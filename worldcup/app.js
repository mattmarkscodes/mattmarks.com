const data = window.WORLD_CUP_PICKS;

const state = {
  group: "A",
  query: "",
};

const teamByCode = new Map();
data.groups.forEach((group) => {
  group.teams.forEach((team) => teamByCode.set(team.code, { ...team, group: group.id }));
});

const picksByPerson = new Map(data.people.map((person) => [person, new Map()]));
data.predictions.forEach((pick) => {
  picksByPerson.get(pick.person).set(pick.group, pick);
});

const resultsGrid = document.querySelector("#results-grid");
const tabs = document.querySelector("#group-tabs");
const matrix = document.querySelector("#pick-matrix");
const leaderboard = document.querySelector("#leaderboard");
const searchInput = document.querySelector("#search-input");

document.querySelector("#group-count").textContent = data.actualResults.length;
document.querySelector("#person-count").textContent = data.people.length;
document.querySelector("#leader-points").textContent = data.standings[0]?.points ?? 0;
document.querySelector("#max-points").textContent = data.scoring.maxTotal;

renderAll();

searchInput.addEventListener("input", (event) => {
  state.query = event.target.value.trim().toLowerCase();
  renderMatrix();
});

function renderAll() {
  renderResults();
  renderTabs();
  renderMatrix();
  renderLeaderboard();
}

function renderResults() {
  resultsGrid.innerHTML = data.groups
    .map((group) => {
      const actual = actualForGroup(group.id);
      const first = actual?.first ? team(actual.first) : null;
      const second = actual?.second ? team(actual.second) : null;
      const exactPicks = actual ? exactPickCount(group.id, actual.first, actual.second) : 0;

      return `
        <article class="result-card ${group.id === state.group ? "is-active" : ""}">
          <button type="button" data-group="${group.id}" aria-label="Highlight Group ${group.id}">
            <header>
              <span>Group ${group.id}</span>
              <em>${actual ? "Live" : "Pending"}</em>
            </header>
            ${
              actual
                ? `
                  ${standingTeam(first, "1")}
                  ${standingTeam(second, "2")}
                  <footer>${exactPicks} exact ${exactPicks === 1 ? "ballot" : "ballots"}</footer>
                `
                : `<p class="result-pending">Awaiting standings</p>`
            }
          </button>
        </article>
      `;
    })
    .join("");

  resultsGrid.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.group = button.dataset.group;
      renderAll();
      matrix.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
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

function renderMatrix() {
  const groupHeaders = data.groups
    .map((group) => `<th class="${group.id === state.group ? "is-selected" : ""}">${group.id}</th>`)
    .join("");
  const filtered = data.people.filter((person) => personMatches(person));
  document.querySelector("#matrix-note").textContent = `${filtered.length} of ${data.people.length} participants shown`;

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
            <tr>
              <th>${person}</th>
              ${data.groups
                .map((group) => {
                  const pick = picksByPerson.get(person).get(group.id);
                  const score = scorePick(pick);
                  return `
                    <td class="${group.id === state.group ? "is-selected" : ""}">
                      <button class="pick-cell" type="button" data-group="${group.id}" title="${person}: ${pick.first}, ${pick.second}">
                        ${miniTeam(pick.first, "1")}
                        ${miniTeam(pick.second, "2")}
                        ${scoreBadge(score)}
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

  matrix.querySelectorAll(".pick-cell").forEach((button) => {
    button.addEventListener("click", () => {
      state.group = button.dataset.group;
      renderAll();
    });
  });
}

function renderLeaderboard() {
  const scoreByPerson = new Map(data.people.map((person) => [person, scorePerson(person)]));
  const official = data.standings?.length
    ? data.standings
    : data.people
        .map((person) => {
          const score = scoreByPerson.get(person);
          return { person, points: score.total };
        })
        .sort((a, b) => b.points - a.points || a.person.localeCompare(b.person))
        .map((row, index) => ({ ...row, rank: index + 1 }));

  document.querySelector("#leaderboard-note").textContent =
    "2 points per correct advancing team, plus 1 point per exact position";

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
      ${official
        .map((standing) => {
          const score = scoreByPerson.get(standing.person);
          return `
            <tr>
              <td>${standing.rank}</td>
              <th>${standing.person}</th>
              <td><strong>${standing.points}</strong></td>
              <td>${score.advancePoints}</td>
              <td>${score.bonusPoints}</td>
              <td>${score.correctTeams}</td>
              <td>${score.exactPositions}</td>
            </tr>
          `;
        })
        .join("")}
    </tbody>
  `;
}

function scorePerson(person) {
  const totals = {
    total: 0,
    advancePoints: 0,
    bonusPoints: 0,
    correctTeams: 0,
    exactPositions: 0,
  };

  data.groups.forEach((group) => {
    const score = scorePick(picksByPerson.get(person).get(group.id));
    totals.total += score.total;
    totals.advancePoints += score.advancePoints;
    totals.bonusPoints += score.bonusPoints;
    totals.correctTeams += score.correctTeams;
    totals.exactPositions += score.exactPositions;
  });

  return totals;
}

function scorePick(pick) {
  const actual = actualForGroup(pick.group);
  const score = {
    total: 0,
    advancePoints: 0,
    bonusPoints: 0,
    correctTeams: 0,
    exactPositions: 0,
  };

  if (!actual?.first || !actual?.second) return score;

  const actualAdvancers = new Set([actual.first, actual.second]);
  score.correctTeams = [pick.first, pick.second].filter((code) => actualAdvancers.has(code)).length;
  score.advancePoints = score.correctTeams * data.scoring.advancingTeam;
  score.exactPositions = Number(pick.first === actual.first) + Number(pick.second === actual.second);
  score.bonusPoints = score.exactPositions * data.scoring.positionBonus;
  score.total = score.advancePoints + score.bonusPoints;
  return score;
}

function exactPickCount(groupId, first, second) {
  return data.predictions.filter(
    (pick) => pick.group === groupId && pick.first === first && pick.second === second,
  ).length;
}

function actualForGroup(groupId) {
  return data.actualResults.find((result) => result.group === groupId);
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

function standingTeam(item, rank) {
  return `
    <div class="standing-team">
      <strong>${rank}</strong>
      <img src="${item.flag}" alt="${item.name} flag" />
      <div>
        <b>${item.code}</b>
        <span>${item.name}</span>
      </div>
    </div>
  `;
}

function scoreBadge(score) {
  return `<em class="score-badge">${score.total} pts</em>`;
}

function team(code) {
  return teamByCode.get(code) || { code, name: code, flag: "" };
}

function teamName(code) {
  return team(code).name;
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
