const bracketData = window.WORLD_CUP_BRACKET;

const state = {
  person: bracketData.people[0] || "",
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
const personSelect = document.querySelector("#person-select");
const participantSummary = document.querySelector("#participant-summary");
const leaderboard = document.querySelector("#leaderboard");
const darkHorse = document.querySelector("#dark-horse");
const championConsensus = document.querySelector("#champion-consensus");

renderAll();

function renderAll() {
  const scores = scoresByPerson();
  const scoredMatches = bracketData.matches.filter((match) => match.winner).length;
  const leader = [...scores.values()].sort((a, b) => b.total - a.total)[0];

  document.querySelector("#matches-complete").textContent = scoredMatches;
  document.querySelector("#bracket-people").textContent = bracketData.people.length;
  document.querySelector("#bracket-lead").textContent = leader?.total ?? 0;
  document.querySelector("#bracket-max").textContent = bracketData.scoring.maxTotal;
  document.querySelector("#source-note").textContent =
    scoredMatches === 0
      ? "Awaiting knockout results"
      : `${scoredMatches} of ${bracketData.matches.length} matches have official winners`;

  renderPersonPicker();
  renderBracket(sourceBracket, { mode: "source" });
  renderParticipant(scores.get(state.person));
  renderLeaderboard(scores);
  renderDarkHorse();
  renderChampionConsensus();
}

function renderPersonPicker() {
  personSelect.innerHTML = bracketData.people
    .map((person) => `<option value="${escapeAttr(person)}" ${person === state.person ? "selected" : ""}>${person}</option>`)
    .join("");
  personSelect.addEventListener("change", () => {
    state.person = personSelect.value;
    renderAll();
  }, { once: true });
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
    <div class="legacy-bracket ${options.mode === "participant" ? "is-participant" : "is-source"}">
      ${roundHeader("Round of 32", "Top half")}
      ${firstRoundNames(split.top.R32)}
      ${firstRoundTeams(split.top.R32, options)}
      ${statusRow(split.top.R32, options, "r32")}

      ${advancerRow(split.top.R32, options, "r16")}
      ${statusRow(split.top.R16, options, "r16")}

      ${advancerRow(split.top.R16, options, "qf")}
      ${statusRow(split.top.QF, options, "qf")}

      ${advancerRow(split.top.QF, options, "sf")}
      ${statusRow(split.top.SF, options, "sf")}

      ${singleAdvancer(split.top.SF[0], options, "finalist")}
      ${winnerBlock(split.final, options)}
      ${singleAdvancer(split.bottom.SF[0], options, "finalist")}

      ${statusRow(split.bottom.SF, options, "sf")}
      ${advancerRow(split.bottom.QF, options, "sf")}

      ${statusRow(split.bottom.QF, options, "qf")}
      ${advancerRow(split.bottom.R16, options, "qf")}

      ${statusRow(split.bottom.R16, options, "r16")}
      ${advancerRow(split.bottom.R32, options, "r16")}

      ${statusRow(split.bottom.R32, options, "r32")}
      ${firstRoundTeams(split.bottom.R32, options)}
      ${firstRoundNames(split.bottom.R32)}
      ${roundHeader("Round of 32", "Bottom half")}
    </div>
  `;
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
      <span>${options.mode === "participant" ? "Champion Pick" : "Champion"}</span>
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

function tileState(match, code, options) {
  if (!code) return "pending";
  if (options.mode === "source") {
    if (!match.winner) return "alive";
    return code === match.winner ? "official" : "dead";
  }
  const pick = pickFor(options.person, match.id);
  if (!pick) return "pending";
  if (!match.winner) return code === pick ? "pick" : "alive";
  if (code === match.winner) return "correct";
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

function renderLeaderboard(scores) {
  const rows = applyTieRanks(
    [...scores.values()].sort(
      (a, b) => b.total - a.total || b.possible - a.possible || a.person.localeCompare(b.person),
    ),
  );

  leaderboard.innerHTML = rows
    .map(
      (row) => `
        <li class="leaderboard-row ${row.competitionRank <= 3 ? "is-top-three" : ""}">
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

function renderDarkHorse() {
  const rows = bracketData.darkHorse?.standings || [];
  darkHorse.innerHTML = `
    <thead>
      <tr>
        <th>Name</th>
        <th>Pick</th>
        <th>Points</th>
      </tr>
    </thead>
    <tbody>
      ${
        rows.length
          ? rows
              .map((row) => `
                <tr>
                  <th>${row.person}</th>
                  <td>${teamPill(row.team)}</td>
                  <td><strong>${row.points}</strong></td>
                </tr>
              `)
              .join("")
          : `<tr><td colspan="3" class="empty-cell">Awaiting dark horse picks</td></tr>`
      }
    </tbody>
  `;
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
