const data = window.WORLD_CUP_PICKS;

const state = {
  group: "A",
  query: "",
  person: data.people[0],
};

const byGroup = new Map(data.groups.map((group) => [group.id, group]));
const teamByCode = new Map();
data.groups.forEach((group) => {
  group.teams.forEach((team) => teamByCode.set(team.code, { ...team, group: group.id }));
});

const picksByPerson = new Map(data.people.map((person) => [person, new Map()]));
data.predictions.forEach((pick) => {
  picksByPerson.get(pick.person).set(pick.group, pick);
});

const groupStats = new Map(data.groups.map((group) => [group.id, statsForGroup(group.id)]));

const tabs = document.querySelector("#group-tabs");
const participantRail = document.querySelector("#participant-rail");
const participantDetail = document.querySelector("#participant-detail");
const spotlight = document.querySelector("#spotlight");
const matrix = document.querySelector("#pick-matrix");
const cardsGrid = document.querySelector("#cards-grid");
const leaderboard = document.querySelector("#leaderboard");
const searchInput = document.querySelector("#search-input");

document.querySelector("#person-count").textContent = data.people.length;
document.querySelector("#pick-count").textContent = data.predictions.length * 2;
document.querySelector("#lock-count").textContent = countNearLocks();
document.querySelector("#max-points").textContent = data.scoring.maxTotal;

renderTabs();
renderAll();

searchInput.addEventListener("input", (event) => {
  state.query = event.target.value.trim().toLowerCase();
  renderParticipants();
  renderMatrix();
});

function renderAll() {
  renderTabs();
  renderParticipants();
  renderSpotlight();
  renderMatrix();
  renderCards();
  renderLeaderboard();
}

function renderTabs() {
  tabs.innerHTML = data.groups
    .map(
      (group) => `
        <button class="tab-button ${group.id === state.group ? "is-active" : ""}" data-group="${group.id}" type="button">
          ${group.id}
        </button>
      `,
    )
    .join("");

  tabs.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.group = button.dataset.group;
      renderAll();
    });
  });
}

function renderParticipants() {
  const filtered = data.people.filter((person) => personMatches(person));
  document.querySelector("#participant-note").textContent = `${filtered.length} of ${data.people.length} participants shown`;

  participantRail.innerHTML = filtered.length
    ? filtered
        .map(
          (person) => `
            <button class="participant-button ${person === state.person ? "is-active" : ""}" type="button" data-person="${person}">
              <span>${person}</span>
              <strong>${favoriteTicket(person)}</strong>
            </button>
          `,
        )
        .join("")
    : `<p class="empty-state">No participants match that search.</p>`;

  participantRail.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.person = button.dataset.person;
      renderParticipants();
      renderMatrix();
    });
  });

  renderParticipantDetail();
}

function renderParticipantDetail() {
  const picks = data.groups.map((group) => picksByPerson.get(state.person).get(group.id));
  const selectedPick = picksByPerson.get(state.person).get(state.group);
  const score = scorePerson(state.person);

  participantDetail.innerHTML = `
    <div class="participant-hero">
      <div>
        <p class="eyebrow">Selected Ballot</p>
        <h2>${state.person}</h2>
      </div>
      <div class="participant-score ${hasResults() ? "" : "is-pending"}">
        <strong>${score.total}</strong>
        <span>${hasResults() ? "points" : "pending"}</span>
      </div>
    </div>

    <div class="selected-ticket">
      <span>Group ${state.group}</span>
      <strong>${flagPair(selectedPick.first, selectedPick.second)} ${selectedPick.first}-${selectedPick.second}</strong>
      <em>${teamName(selectedPick.first)} first, ${teamName(selectedPick.second)} second</em>
    </div>

    <div class="ballot-grid">
      ${picks
        .map((pick) => {
          const isActive = pick.group === state.group;
          const pickScore = score.groups.get(pick.group);
          return `
            <button class="ballot-card ${isActive ? "is-active" : ""}" type="button" data-group="${pick.group}">
              <span>Group ${pick.group}</span>
              <div>${miniTeam(pick.first, "1")}${miniTeam(pick.second, "2")}</div>
              <em>${hasResults() ? `${pickScore.total} pts` : "Awaiting results"}</em>
            </button>
          `;
        })
        .join("")}
    </div>
  `;

  participantDetail.querySelectorAll(".ballot-card").forEach((button) => {
    button.addEventListener("click", () => {
      state.group = button.dataset.group;
      renderAll();
    });
  });
}

function renderSpotlight() {
  const group = byGroup.get(state.group);
  const stats = groupStats.get(state.group);
  const leaderPair = pairCounts(state.group)[0];
  const spotlightTeams = [...group.teams].sort(
    (a, b) => (stats.advance[b.code] || 0) - (stats.advance[a.code] || 0),
  );
  const maxAdvance = Math.max(...spotlightTeams.map((team) => stats.advance[team.code] || 0), 1);

  spotlight.innerHTML = `
    <div class="spotlight-main">
      <div class="spotlight-title">
        <p class="eyebrow">Group ${group.id}</p>
        <h2>${flagPair(leaderPair.first, leaderPair.second)} Consensus: ${teamName(leaderPair.first)} and ${teamName(leaderPair.second)}</h2>
      </div>
      <div class="team-race">
        ${spotlightTeams
          .map((team) => {
            const first = stats.first[team.code] || 0;
            const second = stats.second[team.code] || 0;
            const advance = stats.advance[team.code] || 0;
            const width = Math.max(4, (advance / maxAdvance) * 100);
            return `
              <article class="team-card">
                <div class="team-card-top">
                  <img src="${team.flag}" alt="${team.name} flag" />
                  <div>
                    <strong>${team.code}</strong>
                    <span>${team.name}</span>
                  </div>
                </div>
                <div class="bar-stack" aria-label="${team.name} pick counts">
                  <div class="bar-row">
                    <span>1st</span>
                    <div><i style="width: ${percent(first)}%"></i></div>
                    <b>${first}</b>
                  </div>
                  <div class="bar-row second">
                    <span>2nd</span>
                    <div><i style="width: ${percent(second)}%"></i></div>
                    <b>${second}</b>
                  </div>
                </div>
                <div class="advance-meter">
                  <span style="width: ${width}%"></span>
                </div>
                <p>${advance} advancing ballots</p>
              </article>
            `;
          })
          .join("")}
      </div>
    </div>
    <aside class="pair-board">
      <p class="eyebrow">Most Common Tickets</p>
      ${pairCounts(state.group)
        .slice(0, 5)
        .map(
          (pair, index) => `
            <div class="pair-row">
              <span>${index + 1}</span>
              <div>${flagPair(pair.first, pair.second)}</div>
              <strong>${pair.first}-${pair.second}</strong>
              <em>${pair.count}</em>
            </div>
          `,
        )
        .join("")}
    </aside>
  `;
}

function renderMatrix() {
  const groupHeaders = data.groups.map((group) => `<th>${group.id}</th>`).join("");
  const filtered = data.people.filter((person) => personMatches(person));
  document.querySelector("#matrix-note").textContent = `${filtered.length} of ${data.people.length} shown`;

  matrix.innerHTML = `
    <thead>
      <tr>
        <th class="person-head">Name</th>
        ${groupHeaders}
      </tr>
    </thead>
    <tbody>
      ${filtered
        .map(
          (person) => `
            <tr class="${person === state.person ? "is-person-selected" : ""}">
              <th>
                <button class="person-cell" type="button" data-person="${person}">${person}</button>
              </th>
              ${data.groups
                .map((group) => {
                  const pick = picksByPerson.get(person).get(group.id);
                  const isSelected = group.id === state.group;
                  return `
                    <td class="${isSelected ? "is-selected" : ""}">
                      <button class="pick-cell" type="button" data-person="${person}" data-group="${group.id}" title="${person}: ${pick.first}, ${pick.second}">
                        ${miniTeam(pick.first, "1")}
                        ${miniTeam(pick.second, "2")}
                      </button>
                    </td>
                  `;
                })
                .join("")}
            </tr>
          `,
        )
        .join("")}
    </tbody>
  `;

  matrix.querySelectorAll(".person-cell").forEach((button) => {
    button.addEventListener("click", () => {
      state.person = button.dataset.person;
      renderAll();
      participantDetail.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  matrix.querySelectorAll(".pick-cell").forEach((button) => {
    button.addEventListener("click", () => {
      state.person = button.dataset.person;
      state.group = button.dataset.group;
      renderAll();
      participantDetail.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderCards() {
  cardsGrid.innerHTML = data.groups
    .map((group) => {
      const stats = groupStats.get(group.id);
      const leaderPair = pairCounts(group.id)[0];
      const topAdvance = [...group.teams].sort(
        (a, b) => (stats.advance[b.code] || 0) - (stats.advance[a.code] || 0),
      );
      return `
        <article class="consensus-card ${group.id === state.group ? "is-active" : ""}">
          <button type="button" data-group="${group.id}" aria-label="View Group ${group.id}">
            <span>Group ${group.id}</span>
            <strong>${leaderPair.first}-${leaderPair.second}</strong>
            <div class="card-flags">${flagPair(leaderPair.first, leaderPair.second)}</div>
            <div class="mini-bars">
              ${topAdvance
                .map(
                  (team) => `
                    <p>
                      <span>${team.code}</span>
                      <i style="width: ${percent(stats.advance[team.code] || 0)}%"></i>
                      <b>${stats.advance[team.code] || 0}</b>
                    </p>
                  `,
                )
                .join("")}
            </div>
          </button>
        </article>
      `;
    })
    .join("");

  cardsGrid.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.group = button.dataset.group;
      renderAll();
      spotlight.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderLeaderboard() {
  const scores = data.people.map((person) => scorePerson(person)).sort((a, b) => b.total - a.total || a.person.localeCompare(b.person));
  document.querySelector("#leaderboard-note").textContent = hasResults()
    ? "2 points per correct advancing team, plus 1 point per exact position"
    : "Ready for scoring once actual group results are entered";

  leaderboard.innerHTML = `
    <thead>
      <tr>
        <th>Rank</th>
        <th>Name</th>
        <th>Total</th>
        <th>Advancing</th>
        <th>Bonus</th>
        <th>Correct Teams</th>
        <th>Exact Spots</th>
      </tr>
    </thead>
    <tbody>
      ${scores
        .map(
          (score, index) => `
            <tr class="${score.person === state.person ? "is-person-selected" : ""}">
              <td>${index + 1}</td>
              <th>${score.person}</th>
              <td><strong>${score.total}</strong></td>
              <td>${score.advancePoints}</td>
              <td>${score.bonusPoints}</td>
              <td>${score.correctTeams}</td>
              <td>${score.exactPositions}</td>
            </tr>
          `,
        )
        .join("")}
    </tbody>
  `;
}

function statsForGroup(groupId) {
  const stats = { first: {}, second: {}, advance: {} };
  data.predictions
    .filter((pick) => pick.group === groupId)
    .forEach((pick) => {
      stats.first[pick.first] = (stats.first[pick.first] || 0) + 1;
      stats.second[pick.second] = (stats.second[pick.second] || 0) + 1;
      stats.advance[pick.first] = (stats.advance[pick.first] || 0) + 1;
      stats.advance[pick.second] = (stats.advance[pick.second] || 0) + 1;
    });
  return stats;
}

function pairCounts(groupId) {
  const pairs = new Map();
  data.predictions
    .filter((pick) => pick.group === groupId)
    .forEach((pick) => {
      const key = `${pick.first}-${pick.second}`;
      pairs.set(key, { first: pick.first, second: pick.second, count: (pairs.get(key)?.count || 0) + 1 });
    });
  return [...pairs.values()].sort((a, b) => b.count - a.count || a.first.localeCompare(b.first));
}

function scorePerson(person) {
  const groups = new Map();
  const totals = {
    person,
    total: 0,
    advancePoints: 0,
    bonusPoints: 0,
    correctTeams: 0,
    exactPositions: 0,
    groups,
  };

  data.groups.forEach((group) => {
    const pick = picksByPerson.get(person).get(group.id);
    const actual = actualForGroup(group.id);
    const groupScore = { total: 0, advancePoints: 0, bonusPoints: 0, correctTeams: 0, exactPositions: 0 };

    if (actual?.first && actual?.second) {
      const actualAdvancers = new Set([actual.first, actual.second]);
      groupScore.correctTeams = [pick.first, pick.second].filter((code) => actualAdvancers.has(code)).length;
      groupScore.advancePoints = groupScore.correctTeams * data.scoring.advancingTeam;
      groupScore.exactPositions = Number(pick.first === actual.first) + Number(pick.second === actual.second);
      groupScore.bonusPoints = groupScore.exactPositions * data.scoring.positionBonus;
      groupScore.total = groupScore.advancePoints + groupScore.bonusPoints;
    }

    totals.total += groupScore.total;
    totals.advancePoints += groupScore.advancePoints;
    totals.bonusPoints += groupScore.bonusPoints;
    totals.correctTeams += groupScore.correctTeams;
    totals.exactPositions += groupScore.exactPositions;
    groups.set(group.id, groupScore);
  });

  return totals;
}

function actualForGroup(groupId) {
  return (data.actualResults || []).find((result) => result.group === groupId);
}

function hasResults() {
  return (data.actualResults || []).some((result) => result.first && result.second);
}

function favoriteTicket(person) {
  const picks = data.groups.map((group) => picksByPerson.get(person).get(group.id));
  const consensusMatches = picks.filter((pick) => {
    const topPair = pairCounts(pick.group)[0];
    return pick.first === topPair.first && pick.second === topPair.second;
  }).length;
  return `${consensusMatches}/12 consensus`;
}

function personMatches(person) {
  if (!state.query) return true;
  const personText = person.toLowerCase();
  const picksText = data.groups
    .map((group) => {
      const pick = picksByPerson.get(person).get(group.id);
      return `${pick.first} ${pick.second} ${teamName(pick.first)} ${teamName(pick.second)}`;
    })
    .join(" ")
    .toLowerCase();
  return personText.includes(state.query) || picksText.includes(state.query);
}

function countNearLocks() {
  return data.groups.reduce((total, group) => {
    const stats = groupStats.get(group.id);
    return total + group.teams.filter((team) => (stats.advance[team.code] || 0) >= data.people.length - 1).length;
  }, 0);
}

function percent(value) {
  return (value / data.people.length) * 100;
}

function team(code) {
  return teamByCode.get(code) || { code, name: code, flag: "" };
}

function teamName(code) {
  return team(code).name;
}

function flagPair(first, second) {
  return `${flagImg(first)}${flagImg(second)}`;
}

function flagImg(code) {
  const item = team(code);
  return `<img class="flag" src="${item.flag}" alt="${item.name} flag" />`;
}

function miniTeam(code, rank) {
  const item = team(code);
  return `
    <span class="mini-team">
      <span>${rank}</span>
      <img src="${item.flag}" alt="${item.name} flag" />
      <b>${code}</b>
    </span>
  `;
}
