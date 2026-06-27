const data = window.WORLD_CUP_PICKS;

const state = {
  group: "A",
};

const finalGroups = new Set(["A", "B", "C", "D", "E", "F", "G", "H", "I"]);

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
const consensusGrid = document.querySelector("#simple-consensus-grid");

document.querySelector("#group-count").textContent = data.actualResults.length;
document.querySelector("#person-count").textContent = data.people.length;
document.querySelector("#leader-points").textContent = data.standings[0]?.points ?? 0;
document.querySelector("#max-points").textContent = data.scoring.maxTotal;

renderAll();

function renderAll() {
  renderResults();
  renderTabs();
  renderMatrix();
  renderLeaderboard();
  renderConsensus();
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
              <em>${resultStatus(group.id, actual)}</em>
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
  matrix.innerHTML = `
    <thead>
      <tr>
        <th class="person-head">Name</th>
        ${groupHeaders}
      </tr>
    </thead>
    <tbody>
      ${data.people
        .map(
          (person) => `
            <tr>
              <th>${person}</th>
              ${data.groups
                .map((group) => {
                  const pick = picksByPerson.get(person).get(group.id);
                  const score = scorePick(pick);
                  const actual = actualForGroup(group.id);
                  return `
                    <td class="${group.id === state.group ? "is-selected" : ""}">
                      <button class="pick-cell" type="button" data-group="${group.id}" title="${person}: ${pick.first}, ${pick.second}">
                        ${miniTeam(pick.first, "1", pickStatus(pick.first, "first", actual))}
                        ${miniTeam(pick.second, "2", pickStatus(pick.second, "second", actual))}
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
  const ranked = applyTieRanks(official);
  const differentiators = topThreeDifferentiators(ranked, scoreByPerson);

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
        <th>Why They're Leading</th>
      </tr>
    </thead>
    <tbody>
      ${ranked
        .map((standing) => {
          const score = scoreByPerson.get(standing.person);
          return `
            <tr class="${standing.competitionRank <= 3 ? "is-top-three" : ""}">
              <td>${standing.displayRank}</td>
              <th>${standing.person}</th>
              <td><strong>${standing.points}</strong></td>
              <td>${score.advancePoints}</td>
              <td>${score.bonusPoints}</td>
              <td>${score.correctTeams}</td>
              <td>${score.exactPositions}</td>
              <td class="leader-reason">${differentiators.get(standing.person) || ""}</td>
            </tr>
          `;
        })
        .join("")}
    </tbody>
  `;
}

function renderConsensus() {
  consensusGrid.innerHTML = data.groups
    .map((group) => {
      const stats = consensusForGroup(group.id);
      const teams = [...group.teams].sort(
        (a, b) =>
          (stats.advance[b.code] || 0) - (stats.advance[a.code] || 0) ||
          (stats.first[b.code] || 0) - (stats.first[a.code] || 0),
      );
      return `
        <article class="simple-consensus-card">
          <header>Group ${group.id}</header>
          <div class="consensus-bars">
            ${teams
              .map(
                (item) => `
                  <div class="consensus-team-row">
                    <div class="consensus-team-label">
                      <img src="${item.flag}" alt="${item.name} flag" />
                      <strong>${item.code}</strong>
                    </div>
                    ${consensusBar("1st", stats.first[item.code] || 0, "first")}
                    ${consensusBar("2nd", stats.second[item.code] || 0, "second")}
                  </div>
                `,
              )
              .join("")}
          </div>
        </article>
      `;
    })
    .join("");
}

function consensusForGroup(groupId) {
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

function consensusBar(label, count, type) {
  return `
    <div class="consensus-bar-row ${type}">
      <span>${label}</span>
      <div><i style="width: ${(count / data.people.length) * 100}%"></i></div>
      <b>${count}</b>
    </div>
  `;
}

function applyTieRanks(standings) {
  const scoreCounts = standings.reduce((counts, standing) => {
    counts.set(standing.points, (counts.get(standing.points) || 0) + 1);
    return counts;
  }, new Map());
  const rankByScore = new Map();
  standings.forEach((standing, index) => {
    if (!rankByScore.has(standing.points)) rankByScore.set(standing.points, index + 1);
  });

  return standings.map((standing) => {
    const competitionRank = rankByScore.get(standing.points);
    const tied = scoreCounts.get(standing.points) > 1;
    return {
      ...standing,
      competitionRank,
      displayRank: tied ? `T-${competitionRank}` : `${competitionRank}`,
    };
  });
}

function topThreeDifferentiators(official, scoreByPerson) {
  const leaders = official.filter((standing) => standing.competitionRank <= 3);
  const topPoints = leaders[0]?.points ?? 0;
  const tiedLeaders = leaders.filter((standing) => standing.points === topPoints).length;
  const fieldGroupAverages = new Map(
    data.groups.map((group) => [
      group.id,
      data.people.reduce(
        (total, person) => total + scorePick(picksByPerson.get(person).get(group.id)).total,
        0,
      ) / data.people.length,
    ]),
  );
  const result = new Map();

  leaders.forEach((standing) => {
    const person = standing.person;
    const score = scoreByPerson.get(person);
    const otherLeaders = leaders.filter((row) => row.person !== person);
    const phrases = [];

    const maxAdvance = Math.max(...leaders.map((row) => scoreByPerson.get(row.person).advancePoints));
    const maxBonus = Math.max(...leaders.map((row) => scoreByPerson.get(row.person).bonusPoints));
    const advanceLeaders = leaders.filter(
      (row) => scoreByPerson.get(row.person).advancePoints === maxAdvance,
    );
    const bonusLeaders = leaders.filter(
      (row) => scoreByPerson.get(row.person).bonusPoints === maxBonus,
    );

    if (score.advancePoints === maxAdvance && advanceLeaders.length === 1) {
      phrases.push(`${score.advancePoints} advancing points, most in the top three`);
    } else if (score.bonusPoints === maxBonus && bonusLeaders.length === 1) {
      phrases.push(`${score.bonusPoints} position bonuses, most in the top three`);
    }

    const uniqueGroupEdges = data.groups
      .map((group) => {
        const points = scorePick(picksByPerson.get(person).get(group.id)).total;
        const otherBest = Math.max(
          ...otherLeaders.map((row) => scorePick(picksByPerson.get(row.person).get(group.id)).total),
        );
        return { group: group.id, points, edge: points - otherBest };
      })
      .filter((item) => item.points > 0 && item.edge > 0)
      .sort((a, b) => b.edge - a.edge || b.points - a.points);

    if (!phrases.length && uniqueGroupEdges.length) {
      const edge = uniqueGroupEdges[0];
      phrases.push(
        edge.edge === edge.points
          ? `Only top-three scorer in Group ${edge.group}: ${edge.points} points`
          : `Best top-three score in Group ${edge.group}: ${edge.points} points`,
      );
    }

    const strongestFieldGain = data.groups
      .map((group) => {
        const points = scorePick(picksByPerson.get(person).get(group.id)).total;
        return {
          group: group.id,
          points,
          gain: points - fieldGroupAverages.get(group.id),
        };
      })
      .filter((item) => item.points > 0)
      .sort((a, b) => b.gain - a.gain || b.points - a.points)[0];

    if (strongestFieldGain) {
      phrases.push(
        `Group ${strongestFieldGain.group}: ${strongestFieldGain.points} points, +${strongestFieldGain.gain.toFixed(1)} vs field average`,
      );
    }

    const standingContext =
      standing.points === topPoints && tiedLeaders > 1
        ? `Tied for the lead at ${standing.points}`
        : standing.points === topPoints
          ? `Leads with ${standing.points}`
          : `${topPoints - standing.points} point${topPoints - standing.points === 1 ? "" : "s"} back`;
    result.set(person, [standingContext, ...phrases.slice(0, 2)].join(". "));
  });

  return result;
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

function pickStatus(code, position, actual) {
  if (!actual?.first || !actual?.second) return "pending";
  if (code === actual[position]) return "exact";
  if (code === actual.first || code === actual.second) return "advancing";
  return "wrong";
}

function exactPickCount(groupId, first, second) {
  return data.predictions.filter(
    (pick) => pick.group === groupId && pick.first === first && pick.second === second,
  ).length;
}

function resultStatus(groupId, actual) {
  if (!actual) return "Pending";
  return finalGroups.has(groupId) ? "Final" : "Live";
}

function actualForGroup(groupId) {
  return data.actualResults.find((result) => result.group === groupId);
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

function miniTeam(code, rank, status = "") {
  const item = team(code);
  return `
    <span class="mini-team ${status ? `is-${status}` : ""}">
      <span>${rank}</span>
      <img src="${item.flag}" alt="${item.name} flag" />
      <b>${code}</b>
    </span>
  `;
}
