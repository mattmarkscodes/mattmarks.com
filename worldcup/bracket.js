const bracketData = window.WORLD_CUP_BRACKET;

const state = {
  person: "",
};

const roundOrder = bracketData.scoring.rounds.map((round) => round.id);
const roundById = new Map(bracketData.scoring.rounds.map((round) => [round.id, round]));
const matchesByRound = new Map(
  roundOrder.map((round) => [
    round,
    bracketData.matches
      .filter((match) => match.round === round)
      .sort((a, b) => a.matchNo - b.matchNo),
  ]),
);
const matchById = new Map(bracketData.matches.map((match) => [match.id, match]));
const teamByCode = new Map(bracketData.teams.map((team) => [team.code, team]));
const picksByPerson = new Map(bracketData.people.map((person) => [person, new Map()]));

bracketData.predictions.forEach((pick) => {
  if (!picksByPerson.has(pick.person)) picksByPerson.set(pick.person, new Map());
  picksByPerson.get(pick.person).set(pick.match, pick.winner);
});

const sourceBracket = document.querySelector("#source-bracket");
const participantBracket = document.querySelector("#participant-bracket");
const participantSection = document.querySelector(".participant-section");
const personSelect = document.querySelector("#person-select");
const participantSummary = document.querySelector("#participant-summary");
const leaderboard = document.querySelector("#leaderboard");
const darkHorse = document.querySelector("#dark-horse");
const championConsensus = document.querySelector("#champion-consensus");

leaderboard.addEventListener("click", (event) => {
  const row = event.target.closest(".leaderboard-row[data-person]");
  if (!row) return;
  selectParticipant(row.dataset.person, { scroll: true });
});

leaderboard.addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key)) return;
  const row = event.target.closest(".leaderboard-row[data-person]");
  if (!row) return;
  event.preventDefault();
  selectParticipant(row.dataset.person, { scroll: true });
});

renderAll();

function renderAll() {
  const scores = scoresByPerson();
  const rankedRows = leaderboardRows(scores);
  if (!state.person) state.person = rankedRows[0]?.person || "";
  const scoredMatches = bracketData.matches.filter((match) => match.winner).length;
  const leader = rankedRows[0];

  document.querySelector("#matches-complete").textContent = scoredMatches;
  document.querySelector("#bracket-people").textContent = bracketData.people.length;
  document.querySelector("#bracket-lead").textContent = leader?.total ?? 0;
  document.querySelector("#bracket-max").textContent = bracketData.scoring.maxTotal;
  document.querySelector("#source-note").textContent =
    scoredMatches === 0
      ? "Awaiting knockout results"
      : `${scoredMatches} of ${bracketData.matches.length} matches have official winners`;

  renderPersonPicker(rankedRows);
  renderBracket(sourceBracket, { mode: "source" });
  renderParticipant(scores.get(state.person));
  renderLeaderboard(rankedRows);
  renderDarkHorse();
  renderChampionConsensus();
}

function renderPersonPicker(rows) {
  personSelect.innerHTML = rows
    .map((row) => `<option value="${escapeAttr(row.person)}" ${row.person === state.person ? "selected" : ""}>${row.person}</option>`)
    .join("");
  personSelect.onchange = () => {
    selectParticipant(personSelect.value);
  };
}

function selectParticipant(person, options = {}) {
  if (!picksByPerson.has(person)) return;
  state.person = person;
  renderAll();
  if (!options.scroll) return;
  participantSection.scrollIntoView({ behavior: "smooth", block: "start" });
  personSelect.focus({ preventScroll: true });
}

function renderParticipant(score) {
  const selectedScore = score || emptyScore(state.person);
  participantSummary.innerHTML = `
    <div>
      <span>Score</span>
      <strong>${selectedScore.total}</strong>
    </div>
    <div>
      <span>Remaining Possible</span>
      <strong>${selectedScore.remaining}</strong>
    </div>
    <div>
      <span>Max Finish</span>
      <strong>${selectedScore.possible}</strong>
    </div>
    <div>
      <span>Correct Picks</span>
      <strong>${selectedScore.correct}</strong>
    </div>
  `;
  renderBracket(participantBracket, { mode: "participant", person: state.person });
}

function renderBracket(target, options) {
  const split = bracketHalves();
  target.innerHTML = `
    ${desktopBracket(split, options)}
    ${mobileBracket(split, options)}
  `;
}

function desktopBracket(split, options) {
  return `
    <div class="game-bracket ${options.mode === "participant" ? "is-participant" : "is-source"}">
      <div class="game-half is-top">
        ${desktopRound("Top Half · Round of 32", split.top.R32, options, "r32")}
        ${desktopRound("Round of 16", split.top.R16, options, "r16")}
        ${desktopRound("Quarterfinals", split.top.QF, options, "qf")}
        ${desktopRound("Semifinal", split.top.SF, options, "sf")}
      </div>
      ${desktopFinal(split.final, options)}
      <div class="game-half is-bottom">
        ${desktopRound("Semifinal", split.bottom.SF, options, "sf")}
        ${desktopRound("Quarterfinals", split.bottom.QF, options, "qf")}
        ${desktopRound("Round of 16", split.bottom.R16, options, "r16")}
        ${desktopRound("Bottom Half · Round of 32", split.bottom.R32, options, "r32")}
      </div>
    </div>
  `;
}

function desktopRound(label, matches, options, stage) {
  const span = 8 / matches.length;
  return `
    <div class="game-round is-${stage}">
      <div class="game-row">
        ${matches
          .map(
            (match) => `
              <div class="game-node" style="grid-column: span ${span}">
                ${desktopMatchCard(match, options, stage)}
              </div>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function desktopFinal(match, options) {
  return `
    <div class="game-final">
      <div class="game-final-stage">
        <div class="game-champion">
          <div class="game-champion-label">
            ${mobileTrophy()}
            <span>Champion</span>
          </div>
          ${desktopChampionPill(advancerFor(match, options), pickStatus(match, advancerFor(match, options)))}
        </div>
        <div class="game-final-card">
          ${desktopMatchCard(match, options, "final")}
        </div>
      </div>
    </div>
  `;
}

function desktopMatchCard(match, options, stage) {
  const slots = matchParticipants(match, options);
  const code = advancerFor(match, options);
  const status = options.mode === "participant" ? pickStatus(match, code) : match.winner ? "official" : "pending";
  return `
    <article class="game-match-card is-${stage} is-${status}">
      <div class="game-team-row">
        ${desktopTeamSlot(match, slots[0], options)}
        ${desktopTeamSlot(match, slots[1], options)}
      </div>
    </article>
  `;
}

function desktopTeamSlot(match, code, options) {
  const slot = teamSlot(match, code, options);
  return `
    <div class="game-team-slot is-${slot.status} ${slot.missed ? "is-no-pick" : ""}" title="${escapeAttr(slot.name)}">
      ${slot.flag ? `<span class="game-flag" style="--flag-image: url('${slot.flag}')"></span>` : `<span class="game-shield"></span>`}
      <strong>${slot.label}</strong>
    </div>
  `;
}

function desktopChampionPill(code, status) {
  const item = team(code);
  return `
    <div class="game-champion-pill is-${status}" title="${escapeAttr(item.name)}">
      ${item.flag ? `<span class="game-flag" style="--flag-image: url('${item.flag}')"></span>` : `<span class="game-shield"></span>`}
      <strong>${code || "TBD"}</strong>
    </div>
  `;
}

function mobileBracket(split, options) {
  return `
    <div class="mobile-bracket ${options.mode === "participant" ? "is-participant" : "is-source"}">
      <div class="mobile-board">
        <div class="mobile-half is-top">
          ${mobileQuarter(split.top.R32.slice(0, 4), split.top.R16.slice(0, 2), split.top.QF[0], options)}
          ${mobileQuarter(split.top.R32.slice(4, 8), split.top.R16.slice(2, 4), split.top.QF[1], options)}
          ${mobileRound("Semifinal", split.top.SF, options, "sf")}
        </div>
        ${mobileFinal(split.final, options)}
        <div class="mobile-half is-bottom">
          ${mobileRound("Semifinal", split.bottom.SF, options, "sf")}
          ${mobileQuarter(split.bottom.R32.slice(0, 4), split.bottom.R16.slice(0, 2), split.bottom.QF[0], options, true)}
          ${mobileQuarter(split.bottom.R32.slice(4, 8), split.bottom.R16.slice(2, 4), split.bottom.QF[1], options, true)}
        </div>
      </div>
    </div>
  `;
}

function mobileQuarter(r32Matches, r16Matches, qfMatch, options, reverse = false) {
  const rounds = [
    mobileRound("Round of 32", r32Matches, options, "r32"),
    mobileRound("Round of 16", r16Matches, options, "r16"),
    mobileRound("Quarterfinal", [qfMatch], options, "qf"),
  ];
  return `<div class="mobile-quarter">${(reverse ? rounds.reverse() : rounds).join("")}</div>`;
}

function mobileRound(label, matches, options, stage) {
  const span = 4 / matches.length;
  return `
    <div class="mobile-round is-${stage}">
      <div class="mobile-row">
        ${matches
          .map(
            (match) => `
              <div class="mobile-node" style="grid-column: span ${span}">
                ${mobileMatchCard(match, options, stage)}
              </div>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function mobileFinal(match, options) {
  return `
    <div class="mobile-final">
      <div class="mobile-final-card">
        ${mobileMatchCard(match, options, "final")}
        <div class="mobile-champion">
          ${mobileTrophy()}
          <span>Champion</span>
          ${mobileChampionPill(advancerFor(match, options), pickStatus(match, advancerFor(match, options)))}
        </div>
      </div>
    </div>
  `;
}

function mobileMatchCard(match, options, stage) {
  const slots = matchParticipants(match, options);
  const code = advancerFor(match, options);
  const status = options.mode === "participant" ? pickStatus(match, code) : match.winner ? "official" : "pending";
  return `
    <article class="mobile-match-card is-${stage} is-${status}">
      <div class="mobile-team-row">
        ${mobileTeamSlot(match, slots[0], options)}
        ${mobileTeamSlot(match, slots[1], options)}
      </div>
    </article>
  `;
}

function mobileStatusLabel(match, code, options) {
  if (options.mode === "source") return match.winner || "Awaiting";
  if (!code) return "No pick";
  if (!match.winner) return "Pending";
  return code === match.winner ? `+${match.points}` : "Out";
}

function mobileTeamSlot(match, code, options) {
  const slot = teamSlot(match, code, options);
  return `
    <div class="mobile-team-slot is-${slot.status} ${slot.missed ? "is-no-pick" : ""}" title="${escapeAttr(slot.name)}">
      ${slot.flag ? `<span class="mobile-flag" style="--flag-image: url('${slot.flag}')"></span>` : `<span class="mobile-shield"></span>`}
      <strong>${slot.label}</strong>
    </div>
  `;
}

function mobileChampionPill(code, status) {
  const item = team(code);
  return `
    <div class="mobile-champion-pill is-${status}" title="${escapeAttr(item.name)}">
      ${item.flag ? `<span class="mobile-flag" style="--flag-image: url('${item.flag}')"></span>` : `<span class="mobile-shield"></span>`}
      <strong>${code || "TBD"}</strong>
    </div>
  `;
}

function mobileTrophy() {
  return `
    <svg class="mobile-trophy" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M20 8h24v8h10v8c0 10-6 17-14 18a14 14 0 0 1-6 4v7h9v6H21v-6h9v-7a14 14 0 0 1-6-4C16 41 10 34 10 24v-8h10V8Zm24 12v14c4-2 6-6 6-12v-2h-6ZM14 20v2c0 6 2 10 6 12V20h-6Z" />
    </svg>
  `;
}

function matchParticipants(match, options) {
  const feeders = bracketData.matches
    .filter((candidate) => candidate.nextMatch === match.id)
    .sort((a, b) => a.nextSlot.localeCompare(b.nextSlot));
  if (options.mode === "participant" && feeders.length) {
    return feeders.map((feeder) => participantFeederSlot(feeder, options));
  }
  if (match.team1 || match.team2) return [match.team1, match.team2];
  if (feeders.length) return feeders.map((feeder) => advancerFor(feeder, options));
  return ["", ""];
}

function bracketHalves() {
  return {
    top: {
      R32: matchesByRound.get("R32").slice(0, 8),
      R16: matchesByRound.get("R16").slice(0, 4),
      QF: matchesByRound.get("QF").slice(0, 2),
      SF: matchesByRound.get("SF").slice(0, 1),
    },
    bottom: {
      R32: matchesByRound.get("R32").slice(8, 16),
      R16: matchesByRound.get("R16").slice(4, 8),
      QF: matchesByRound.get("QF").slice(2, 4),
      SF: matchesByRound.get("SF").slice(1, 2),
    },
    final: matchesByRound.get("FINAL")[0],
  };
}

function roundHeader(roundName, halfName) {
  return `
    <div class="legacy-round-label">
      <span>${halfName}</span>
      <strong>${roundName}</strong>
    </div>
  `;
}

function firstRoundNames(matches) {
  return `
    <div class="legacy-grid name-grid cols-${matches.length}">
      ${matches
        .map(
          (match) => `
            <div class="name-pair">
              <span>${match.team1 || "TBD"}</span>
              <span>${match.team2 || "TBD"}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function firstRoundTeams(matches, options) {
  return `
    <div class="legacy-grid team-grid cols-${matches.length}">
      ${matches
        .map(
          (match) => `
            <div class="team-pair">
              ${flagTile(match.team1, tileState(match, match.team1, options))}
              ${flagTile(match.team2, tileState(match, match.team2, options))}
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function advancerRow(matches, options, stage) {
  return `
    <div class="legacy-grid advancer-grid cols-${matches.length}">
      ${matches.map((match) => flagTile(advancerFor(match, options), pickStatus(match, advancerFor(match, options)), stage)).join("")}
    </div>
  `;
}

function singleAdvancer(match, options, stage) {
  return `
    <div class="single-advancer">
      ${flagTile(advancerFor(match, options), pickStatus(match, advancerFor(match, options)), stage)}
    </div>
  `;
}

function winnerBlock(match, options) {
  const code = advancerFor(match, options);
  return `
    <div class="winner-stage">
      <span>Champion</span>
      ${flagTile(code, pickStatus(match, code), "winner")}
    </div>
  `;
}

function statusRow(matches, options, stage) {
  return `
    <div class="legacy-grid status-grid cols-${matches.length}">
      ${matches.map((match) => statusBand(match, options, stage)).join("")}
    </div>
  `;
}

function statusBand(match, options, stage) {
  const code = advancerFor(match, options);
  const status = options.mode === "participant" ? pickStatus(match, code) : match.winner ? "official" : "pending";
  const label = statusLabel(match, code, options);
  return `<div class="time-band ${stage} is-${status}"><span>${label}</span></div>`;
}

function statusLabel(match, code, options) {
  if (options.mode === "source") return match.winner || "Awaiting result";
  if (!code) return "No pick";
  if (!match.winner) return "Pending";
  return code === match.winner ? `+${match.points}` : "Eliminated";
}

function advancerFor(match, options) {
  if (!match) return "";
  return options.mode === "participant" ? pickFor(options.person, match.id) : match.winner;
}

function participantFeederSlot(match, options) {
  const pick = advancerFor(match, options);
  if (pick || !match.winner) return pick;
  return {
    code: "",
    label: "NP",
    name: "No pick locked",
    status: "missing",
    missed: true,
  };
}

function teamSlot(match, value, options) {
  if (typeof value === "object" && value !== null) {
    const item = team(value.code);
    return {
      code: value.code || "",
      label: value.label || value.code || "TBD",
      name: value.name || item.name,
      flag: item.flag,
      status: value.status || tileState(match, value.code || "", options),
      missed: Boolean(value.missed),
    };
  }

  const item = team(value);
  return {
    code: value || "",
    label: value || "TBD",
    name: item.name,
    flag: item.flag,
    status: tileState(match, value, options),
    missed: false,
  };
}

function tileState(match, code, options) {
  if (!code) return "pending";
  if (options.mode === "source") {
    if (!match.winner) return "alive";
    return code === match.winner ? "official" : "dead";
  }
  const pick = pickFor(options.person, match.id);
  if (!match.winner) {
    if (code === pick) return eliminatedTeams().has(code) ? "dead" : "pick";
    return eliminatedTeams().has(code) ? "dead" : "alive";
  }
  if (!pick) return code === match.winner ? "official" : "dead";
  if (code === pick && pick === match.winner) return "correct";
  if (code === pick) return "wrong";
  if (code === match.winner) return "official";
  return "dead";
}

function flagTile(code, status = "pending", stage = "") {
  const item = team(code);
  const blank = !code;
  return `
    <div
      class="flag-tile ${stage ? `is-${stage}` : ""} is-${status} ${blank ? "is-empty" : ""}"
      style="${item.flag ? `--flag-image: url('${item.flag}')` : ""}"
      title="${item.name}"
    ></div>
  `;
}

function renderLeaderboard(rows) {
  leaderboard.innerHTML = rows
    .map(
      (row) => `
        <li
          class="leaderboard-row ${row.competitionRank <= 3 ? "is-top-three" : ""} ${row.person === state.person ? "is-selected" : ""}"
          data-person="${escapeAttr(row.person)}"
          role="button"
          tabindex="0"
          aria-label="View ${escapeAttr(row.person)} bracket"
        >
          <mark>${row.displayRank}. ${row.person}</mark>
          <small>
            <span class="score">${row.total}</span> points
            <em>${row.possible} max · ${pickFor(row.person, "FINAL-01") || "No champion"}</em>
          </small>
        </li>
      `,
    )
    .join("");
}

function leaderboardRows(scores) {
  return applyTieRanks(
    [...scores.values()].sort(
      (a, b) => b.total - a.total || b.possible - a.possible || a.person.localeCompare(b.person),
    ),
  );
}

function renderDarkHorse() {
  const rows = bracketData.darkHorse?.standings || [];
  darkHorse.innerHTML = `
    <thead>
      <tr>
        <th>Name</th>
        <th>Pick</th>
        <th>Status</th>
        <th>Points</th>
      </tr>
    </thead>
    <tbody>
      ${
        rows.length
          ? rows
              .map((row) => `
                <tr class="${darkHorseStatus(row.result).eliminated ? "is-eliminated" : ""}">
                  <th>${row.person}</th>
                  <td>${teamPill(row.team)}</td>
                  <td>${darkHorseBadge(row.result)}</td>
                  <td><strong>${row.points}</strong></td>
                </tr>
              `)
              .join("")
          : `<tr><td colspan="4" class="empty-cell">Awaiting dark horse picks</td></tr>`
      }
    </tbody>
  `;
}

function darkHorseStatus(result) {
  const label = (result || "Active").trim();
  const eliminated = /^(eliminated|out|dead)$/i.test(label);
  return { label, eliminated };
}

function darkHorseBadge(result) {
  const status = darkHorseStatus(result);
  return `<span class="dark-horse-status ${status.eliminated ? "is-eliminated" : "is-active"}">${status.label}</span>`;
}

function renderChampionConsensus() {
  const counts = new Map();
  bracketData.people.forEach((person) => {
    const champion = pickFor(person, "FINAL-01");
    if (!champion) return;
    counts.set(champion, (counts.get(champion) || 0) + 1);
  });
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  championConsensus.innerHTML = rows.length
    ? rows
        .map(([code, count]) => `
          <div class="consensus-row">
            ${teamPill(code)}
            <div><i style="width: ${(count / bracketData.people.length) * 100}%"></i></div>
            <strong>${count}</strong>
          </div>
        `)
        .join("")
    : `<p class="empty-copy">Champion picks will appear once brackets are entered.</p>`;
}

function scoresByPerson() {
  return new Map(bracketData.people.map((person) => [person, scorePerson(person)]));
}

function scorePerson(person) {
  const eliminated = eliminatedTeams();
  const totals = emptyScore(person);

  bracketData.matches.forEach((match) => {
    const pick = pickFor(person, match.id);
    if (!pick) return;

    if (match.winner) {
      if (pick === match.winner) {
        totals.total += match.points;
        totals.correct += 1;
      }
      return;
    }

    if (!eliminated.has(pick)) {
      totals.remaining += match.points;
    }
  });

  totals.possible = totals.total + totals.remaining;
  return totals;
}

function emptyScore(person) {
  return { person, total: 0, remaining: 0, possible: 0, correct: 0 };
}

function eliminatedTeams() {
  const eliminated = new Set();
  bracketData.matches.forEach((match) => {
    if (!match.winner) return;
    [match.team1, match.team2]
      .filter(Boolean)
      .filter((code) => code !== match.winner)
      .forEach((code) => eliminated.add(code));
  });
  return eliminated;
}

function pickStatus(match, pick) {
  if (!pick) return "missing";
  if (match.winner && pick === match.winner) return "correct";
  if (match.winner && pick !== match.winner) return "wrong";
  if (eliminatedTeams().has(pick)) return "dead";
  return "alive";
}

function applyTieRanks(rows) {
  const scoreCounts = rows.reduce((counts, row) => {
    counts.set(row.total, (counts.get(row.total) || 0) + 1);
    return counts;
  }, new Map());
  const rankByScore = new Map();
  rows.forEach((row, index) => {
    if (!rankByScore.has(row.total)) rankByScore.set(row.total, index + 1);
  });

  return rows.map((row) => {
    const competitionRank = rankByScore.get(row.total);
    const tied = scoreCounts.get(row.total) > 1;
    return {
      ...row,
      competitionRank,
      displayRank: tied ? `T-${competitionRank}` : `${competitionRank}`,
    };
  });
}

function pickFor(person, matchId) {
  return picksByPerson.get(person)?.get(matchId) || "";
}

function team(code) {
  if (!code) return { code: "", name: "To be decided", flag: "" };
  return teamByCode.get(code) || { code, name: code, flag: "" };
}

function teamPill(code) {
  const item = team(code);
  return `
    <span class="team-pill">
      ${item.flag ? `<img src="${item.flag}" alt="${item.name} flag" />` : `<span class="flag-placeholder"></span>`}
      <b>${code || "TBD"}</b>
    </span>
  `;
}

function escapeAttr(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
