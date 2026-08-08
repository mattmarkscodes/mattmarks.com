const FOTMOB_AUSTIN_FC = {
  name: 'FotMob Austin FC',
  url: 'https://www.fotmob.com/teams/1218886/fixtures/austin-fc',
  teamId: 1218886,
  displayName: 'Austin FC',
};

const ESPN_FEEDS = [
  {
    name: 'NCAAF',
    url: 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard',
    favorites: ['Texas Longhorns', 'Texas', 'TEX'],
    displayName: 'Texas FB',
    showTournament: false,
  },
];

const LOOKAHEAD_DAYS = 75;
const MAX_HUB_LINES = 8;
const MAX_TEAM_LINES = 8;
const RECENT_RESULT_HOURS = 72;
const DISPLAY_TIME_ZONE = 'America/Chicago';

export async function buildSportsPayload(now = new Date()) {
  const entries = (
    await Promise.all([
      loadFotMobAustinFixtures(FOTMOB_AUSTIN_FC, now),
      ...ESPN_FEEDS.map((feed) => loadEspnFeed(feed, now)),
    ])
  )
    .flat();

  const selected = selectSportsEntries(entries, now, MAX_HUB_LINES);
  const austinEntries = selectSportsEntries(
    entries.filter((entry) => entry.label === 'Austin FC'),
    now,
    MAX_TEAM_LINES,
  );
  const texasEntries = selectSportsEntries(
    entries.filter((entry) => entry.label === 'Texas FB'),
    now,
    MAX_TEAM_LINES,
  );
  const hubSportsLine = selected[0]
    ? { label: 'SPORTS', value: selected[0].hubValue }
    : { label: 'SPORTS', value: 'No priority games live' };

  return {
    generatedAt: now.toISOString(),
    hubSportsLine,
    teamScreens: [
      buildTeamScreen({
        id: 'austin-fc',
        title: 'AUSTIN FC',
        entries: austinEntries,
        emptyLine: 'No Austin FC matches found',
        now,
      }),
      buildTeamScreen({
        id: 'texas-football',
        title: 'TEXAS FB',
        entries: texasEntries,
        emptyLine: 'No Texas football games found',
        now,
      }),
    ],
  };
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const payload = await buildSportsPayload();
    return jsonResponse(200, payload, {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    });
  } catch (error) {
    return jsonResponse(
      500,
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to build sports payload',
      },
      {
        'Cache-Control': 'no-store',
      },
    );
  }
}

function jsonResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

async function loadFotMobAustinFixtures(feed, now) {
  try {
    const response = await fetch(feed.url, {
      headers: {
        Accept: 'text/html',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`${feed.name} returned ${response.status}`);
    }

    const html = await response.text();
    const data = parseFotMobNextData(html);
    const teamData = data.props?.pageProps?.fallback?.[`team-${feed.teamId}`];
    const fixtures = teamData?.fixtures?.allFixtures?.fixtures;

    if (!Array.isArray(fixtures)) {
      throw new Error('FotMob fixtures array not found');
    }

    return fixtures.flatMap((fixture) => {
      const entry = toFotMobEntry(feed, fixture, now);
      return entry ? [entry] : [];
    });
  } catch (error) {
    console.warn(`Sports feed unavailable: ${feed.name}`, error);
    return [];
  }
}

async function loadEspnFeed(feed, now) {
  try {
    const response = await fetch(buildFeedUrl(feed, now));
    if (!response.ok) {
      throw new Error(`${feed.name} returned ${response.status}`);
    }

    const data = await response.json();
    const events = Array.isArray(data.events) ? data.events : [];

    return events.flatMap((event) => {
      const competition = event.competitions?.[0];
      const competitors = competition?.competitors ?? [];
      const favorite = competitors.find((competitor) =>
        isFavorite(competitor.team, feed.favorites),
      );

      if (!favorite) {
        return [];
      }

      const opponent = competitors.find((competitor) => competitor !== favorite);
      const entry = toEspnEntry(feed, event, competition, favorite, opponent, now);
      return entry ? [entry] : [];
    });
  } catch (error) {
    console.warn(`Sports feed unavailable: ${feed.name}`, error);
    return [];
  }
}

function buildFeedUrl(feed, now) {
  const url = new URL(feed.url);
  url.searchParams.set('dates', buildDateWindow(now));
  url.searchParams.set('limit', '200');
  return url;
}

function parseFotMobNextData(html) {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/,
  );

  if (!match) {
    throw new Error('FotMob __NEXT_DATA__ block not found');
  }

  return JSON.parse(match[1]);
}

function toFotMobEntry(feed, fixture, now) {
  const eventDate = fixture.status?.utcTime
    ? new Date(fixture.status.utcTime)
    : null;
  const state = fotMobState(fixture);

  if (!eventDate || shouldHideEvent(state, eventDate, now)) {
    return null;
  }

  const isHome = fixture.home?.id === feed.teamId;
  const favoriteScore = isHome ? fixture.home?.score : fixture.away?.score;
  const opponentScore = isHome ? fixture.away?.score : fixture.home?.score;
  const opponent = isHome ? fixture.away : fixture.home;
  const opponentName = displayOpponentName(opponent?.name);
  const tournament = formatTournament(fixture.tournament?.name);

  if (state === 'in') {
    return {
      state,
      startsAt: eventDate.getTime(),
      label: feed.displayName,
      value: `${favoriteScore ?? 0}-${opponentScore ?? 0} ${opponentName} | Live`,
      hubValue: `${feed.displayName} ${favoriteScore ?? 0}-${opponentScore ?? 0}`,
    };
  }

  if (state === 'post') {
    const scoreLine = `${favoriteScore ?? 0}-${opponentScore ?? 0}`;
    const tournamentPrefix = tournament ? `${tournament} ` : '';

    return {
      state,
      startsAt: eventDate.getTime(),
      label: feed.displayName,
      value: `FINAL ${scoreLine} ${opponentName} | ${tournamentPrefix}${formatResultDate(eventDate)}`,
      hubValue: `${feed.displayName} FINAL ${scoreLine} ${opponentName}`,
    };
  }

  const venueLabel = isHome ? 'HOME' : 'AWAY';
  const homeAway = isHome ? 'HOME vs' : 'AWAY at';
  const kickoff = formatUpcoming(eventDate, now);
  const prefix = tournament ? `${tournament} ` : '';

  return {
    state,
    startsAt: eventDate.getTime(),
    label: feed.displayName,
    value: `${homeAway} ${opponentName} | ${prefix}${kickoff}`,
    hubValue: `${feed.displayName} ${venueLabel} ${opponentName} ${prefix}${kickoff}`,
  };
}

function toEspnEntry(feed, event, competition, favorite, opponent, now) {
  const status = competition?.status ?? event.status;
  const state = status?.type?.state ?? 'pre';
  const favoriteName = feed.displayName ?? shortName(favorite.team);
  const opponentName = displayName(opponent?.team);
  const venueLabel = favorite.homeAway === 'home' ? 'HOME' : 'AWAY';
  const homeAway = favorite.homeAway === 'home' ? 'HOME vs' : 'AWAY at';
  const eventDate = event.date ? new Date(event.date) : null;

  if (!eventDate || shouldHideEvent(state, eventDate, now)) {
    return null;
  }

  if (state === 'in') {
    const favoriteScore = favorite.score ?? '0';
    const opponentScore = opponent?.score ?? '0';
    const clock = status.displayClock || status.type?.shortDetail || 'Live';

    return {
      state,
      startsAt: eventDate?.getTime() ?? Number.MAX_SAFE_INTEGER,
      label: favoriteName,
      value: `${favoriteScore}-${opponentScore} ${opponentName} | ${clock}`,
      hubValue: `${favoriteName} ${favoriteScore}-${opponentScore} ${clock}`,
    };
  }

  if (state === 'post') {
    const favoriteScore = favorite.score ?? '0';
    const opponentScore = opponent?.score ?? '0';

    return {
      state,
      startsAt: eventDate?.getTime() ?? Number.MAX_SAFE_INTEGER,
      label: favoriteName,
      value: `FINAL ${favoriteScore}-${opponentScore} ${opponentName} | ${formatResultDate(eventDate)}`,
      hubValue: `${favoriteName} FINAL ${favoriteScore}-${opponentScore}`,
    };
  }

  const kickoff = formatUpcoming(eventDate, now);
  const tournament = feed.showTournament === false
    ? ''
    : formatTournament(event.season?.slug ?? feed.name);
  const prefix = tournament ? `${tournament} ` : '';

  return {
    state,
    startsAt: eventDate?.getTime() ?? Number.MAX_SAFE_INTEGER,
    label: favoriteName,
    value: `${homeAway} ${opponentName} | ${prefix}${kickoff}`,
    hubValue: `${favoriteName} ${venueLabel} ${prefix}${kickoff}`,
  };
}

function fotMobState(fixture) {
  if (fixture.status?.finished) {
    return 'post';
  }

  if (fixture.status?.started) {
    return 'in';
  }

  return 'pre';
}

function shouldHideEvent(state, eventDate, now) {
  if (state === 'in') {
    return false;
  }

  if (state === 'post') {
    return hoursBetween(eventDate, now) > RECENT_RESULT_HOURS;
  }

  return eventDate.getTime() < now.getTime() - 60 * 60 * 1000;
}

function isFavorite(team, favorites) {
  if (!team) {
    return false;
  }

  const names = [
    team.displayName,
    team.shortDisplayName,
    team.name,
    team.location,
    team.abbreviation,
  ]
    .filter(Boolean)
    .map((value) => value.toLowerCase());

  return favorites.some((favorite) => names.includes(favorite.toLowerCase()));
}

function compactName(team) {
  return team?.abbreviation ?? shortName(team);
}

function displayName(team) {
  return (
    team?.shortDisplayName ??
    team?.displayName ??
    team?.name ??
    team?.abbreviation ??
    'Opponent'
  );
}

function displayOpponentName(name) {
  const names = {
    Dallas: 'FC Dallas',
    Philadelphia: 'Philadelphia Union',
    Portland: 'Portland Timbers',
    'San Jose': 'San Jose Earthquakes',
    Colorado: 'Colorado Rapids',
    Vancouver: 'Vancouver Whitecaps',
    'Salt Lake': 'Real Salt Lake',
    Houston: 'Houston Dynamo',
    America: 'America',
  };

  return names[name] ?? name ?? 'OPP';
}

function shortName(team) {
  return (
    team?.shortDisplayName ??
    team?.abbreviation ??
    team?.displayName ??
    'Opponent'
  );
}

function compareEntries(a, b) {
  const stateRank = { in: 0, pre: 1, post: 2 };
  return (
    (stateRank[a.state] ?? 3) - (stateRank[b.state] ?? 3) ||
    a.startsAt - b.startsAt
  );
}

function buildTeamScreen({ id, title, entries, emptyLine, now }) {
  return {
    id,
    title,
    timestamp: formatShortTime(now),
    summary: '',
    lines:
      entries.length > 0
        ? toSportsScreenLines(entries, { includeLabel: false })
        : [{ value: emptyLine }],
    footer: '',
  };
}

function toSportsScreenLines(selected, options = {}) {
  const includeLabel = options.includeLabel ?? true;

  return selected.flatMap((entry, index) => {
    const line = {
      value: includeLabel ? `${entry.label} ${entry.value}` : entry.value,
    };
    const next = selected[index + 1];

    if (index === 0 && entry.state === 'post' && next?.state === 'pre') {
      return [line, { value: '' }];
    }

    return [line];
  });
}

function selectSportsEntries(entries, now, maxLines) {
  const live = entries
    .filter((entry) => entry.state === 'in')
    .sort((a, b) => a.startsAt - b.startsAt);
  const recentFinal = entries
    .filter((entry) => entry.state === 'post')
    .sort((a, b) => b.startsAt - a.startsAt);
  const upcoming = entries
    .filter((entry) => entry.state === 'pre' && entry.startsAt >= now.getTime())
    .sort((a, b) => a.startsAt - b.startsAt);

  if (live.length > 0) {
    return [...live, ...upcoming].slice(0, maxLines);
  }

  return [...recentFinal.slice(0, 1), ...upcoming].slice(0, maxLines);
}

function hoursBetween(earlier, later) {
  return (later.getTime() - earlier.getTime()) / (60 * 60 * 1000);
}

function formatTournament(name) {
  const normalized = String(name ?? '').toLowerCase();

  if (!normalized) {
    return '';
  }

  if (normalized.includes('leagues cup')) {
    return 'LC';
  }

  if (normalized.includes('open cup')) {
    return 'USOC';
  }

  if (normalized.includes('major league soccer') || normalized.includes('mls')) {
    return 'MLS';
  }

  if (normalized.includes('ncaaf')) {
    return '';
  }

  return String(name)
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 4)
    .toUpperCase();
}

function buildDateWindow(now) {
  const start = datePartsInDisplayTimeZone(now);
  const end = addDaysToDateParts(start, LOOKAHEAD_DAYS);
  return `${formatDateParam(start)}-${formatDateParam(end)}`;
}

function datePartsInDisplayTimeZone(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DISPLAY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value),
  };
}

function addDaysToDateParts(parts, days) {
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));

  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function formatDateParam(parts) {
  return `${parts.year}${String(parts.month).padStart(2, '0')}${String(parts.day).padStart(2, '0')}`;
}

function formatUpcoming(date, now) {
  const daysAway = daysBetweenDateParts(
    datePartsInDisplayTimeZone(now),
    datePartsInDisplayTimeZone(date),
  );
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: DISPLAY_TIME_ZONE,
    weekday: 'short',
  }).format(date);

  if (daysAway === 0) {
    return `${weekday} Today ${formatTime(date)}`;
  }

  if (daysAway === 1) {
    return `${weekday} Tomorrow ${formatTime(date)}`;
  }

  if (daysAway <= 6) {
    return `${weekday} ${formatTime(date)}`;
  }

  const dateLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: DISPLAY_TIME_ZONE,
    month: 'short',
    day: 'numeric',
  }).format(date);
  return `${weekday} ${dateLabel} ${formatTime(date)}`;
}

function formatResultDate(date) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: DISPLAY_TIME_ZONE,
    weekday: 'short',
  }).format(date);

  return `${weekday} ${formatTime(date)}`;
}

function formatTime(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DISPLAY_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '';
  const dayPeriod =
    parts.find((part) => part.type === 'dayPeriod')?.value.toLowerCase()[0] ??
    '';
  return `${hour}:${minute}${dayPeriod}`;
}

function daysBetweenDateParts(start, end) {
  const startTime = Date.UTC(start.year, start.month - 1, start.day);
  const endTime = Date.UTC(end.year, end.month - 1, end.day);
  return Math.floor((endTime - startTime) / (24 * 60 * 60 * 1000));
}

function formatShortTime(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: DISPLAY_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
