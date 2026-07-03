from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / "World Cup Bracket.xlsx"
OUTPUT = ROOT / "bracket-data.js"

ROUNDS = [
    {"id": "R32", "name": "Round of 32", "shortName": "R32", "points": 1, "matchCount": 16},
    {"id": "R16", "name": "Round of 16", "shortName": "R16", "points": 2, "matchCount": 8},
    {"id": "QF", "name": "Quarterfinals", "shortName": "QF", "points": 4, "matchCount": 4},
    {"id": "SF", "name": "Semifinals", "shortName": "SF", "points": 8, "matchCount": 2},
    {"id": "FINAL", "name": "Final", "shortName": "Final", "points": 12, "matchCount": 1},
]

ROUND_ORDER = {round_def["id"]: index for index, round_def in enumerate(ROUNDS)}
ROUND_POINTS = {round_def["id"]: round_def["points"] for round_def in ROUNDS}
EXPECTED_MATCH_COUNT = sum(round_def["matchCount"] for round_def in ROUNDS)

COUNTRY_NAMES = {
    "ALG": "Algeria",
    "ARG": "Argentina",
    "AUS": "Australia",
    "AUT": "Austria",
    "BEL": "Belgium",
    "BIH": "Bosnia and Herzegovina",
    "BRA": "Brazil",
    "CAN": "Canada",
    "CIV": "Cote d'Ivoire",
    "COD": "DR Congo",
    "COL": "Colombia",
    "CPV": "Cape Verde",
    "CRO": "Croatia",
    "CUW": "Curacao",
    "CZE": "Czechia",
    "ECU": "Ecuador",
    "EGY": "Egypt",
    "ENG": "England",
    "ESP": "Spain",
    "FRA": "France",
    "GER": "Germany",
    "GHA": "Ghana",
    "HAI": "Haiti",
    "IRN": "Iran",
    "IRQ": "Iraq",
    "JOR": "Jordan",
    "JPN": "Japan",
    "KOR": "South Korea",
    "KSA": "Saudi Arabia",
    "MAR": "Morocco",
    "MEX": "Mexico",
    "NED": "Netherlands",
    "NOR": "Norway",
    "NZL": "New Zealand",
    "PAN": "Panama",
    "PAR": "Paraguay",
    "POR": "Portugal",
    "QAT": "Qatar",
    "RSA": "South Africa",
    "SCO": "Scotland",
    "SEN": "Senegal",
    "SUI": "Switzerland",
    "SWE": "Sweden",
    "TUN": "Tunisia",
    "TUR": "Turkey",
    "URU": "Uruguay",
    "USA": "United States",
    "UZB": "Uzbekistan",
}


def match_id(round_id: str, index: int) -> str:
    return f"{round_id}-{index:02d}"


def default_matches() -> list[dict[str, object]]:
    matches: list[dict[str, object]] = []
    for round_def in ROUNDS:
        round_id = str(round_def["id"])
        match_count = int(round_def["matchCount"])
        for index in range(1, match_count + 1):
            current_id = match_id(round_id, index)
            next_match = ""
            next_slot = ""
            if round_id != "FINAL":
                next_round = ROUNDS[ROUND_ORDER[round_id] + 1]["id"]
                next_match = match_id(str(next_round), (index + 1) // 2)
                next_slot = "team1" if index % 2 else "team2"
            matches.append(
                {
                    "id": current_id,
                    "round": round_id,
                    "roundName": round_def["name"],
                    "matchNo": index,
                    "label": f"{round_def['shortName']} Match {index}",
                    "points": round_def["points"],
                    "nextMatch": next_match,
                    "nextSlot": next_slot,
                }
            )
    return matches


def required_columns(frame: pd.DataFrame, sheet: str, columns: list[str]) -> None:
    missing = [column for column in columns if column not in frame.columns]
    if missing:
        raise ValueError(f"{sheet} is missing required columns: {', '.join(missing)}")


def clean_code(value: object) -> str:
    if pd.isna(value):
        return ""
    text = str(value).strip().upper()
    return "" if text in {"NAN", "NONE", "NP"} else text


def read_sheet(sheet_name: str) -> pd.DataFrame:
    try:
        return pd.read_excel(WORKBOOK, sheet_name=sheet_name)
    except ValueError as exc:
        raise ValueError(f"Workbook is missing required sheet: {sheet_name}") from exc


def team_directory() -> dict[str, dict[str, str]]:
    teams: dict[str, dict[str, str]] = {}
    flags_root = ROOT / "flags"
    if flags_root.exists():
        for flag in sorted(flags_root.glob("*/*.png")):
            code = flag.stem.upper()
            teams[code] = {
                "code": code,
                "name": COUNTRY_NAMES.get(code, code),
                "flag": flag.relative_to(ROOT).as_posix(),
            }

    try:
        raw = read_sheet("Team Directory")
    except ValueError:
        return teams

    required_columns(raw, "Team Directory", ["Code", "Name", "Flag"])
    for row in raw.itertuples(index=False):
        code = clean_code(getattr(row, "Code"))
        if not code:
            continue
        teams[code] = {
            "code": code,
            "name": str(getattr(row, "Name")).strip() if pd.notna(getattr(row, "Name")) else code,
            "flag": str(getattr(row, "Flag")).strip() if pd.notna(getattr(row, "Flag")) else "",
        }
    return teams


def matches() -> list[dict[str, object]]:
    raw = read_sheet("Actual Bracket")
    required_columns(raw, "Actual Bracket", ["Match ID", "Round", "Match No", "Team 1", "Team 2", "Winner"])

    base = {match["id"]: match for match in default_matches()}
    rows = raw.dropna(subset=["Match ID"]).copy()
    if len(rows) != EXPECTED_MATCH_COUNT:
        raise ValueError(
            f"Actual Bracket must contain {EXPECTED_MATCH_COUNT} matches; found {len(rows)}. "
            "Do not continue until the bracket shape is confirmed."
        )

    seen: set[str] = set()
    output: list[dict[str, object]] = []
    for row in rows.itertuples(index=False):
        current_id = str(getattr(row, "_0")).strip().upper()
        if current_id in seen:
            raise ValueError(f"Duplicate match row in Actual Bracket: {current_id}")
        if current_id not in base:
            raise ValueError(f"Unexpected match ID in Actual Bracket: {current_id}")
        seen.add(current_id)
        match = dict(base[current_id])
        match.update(
            {
                "team1": clean_code(getattr(row, "_3")),
                "team2": clean_code(getattr(row, "_4")),
                "winner": clean_code(getattr(row, "Winner")),
            }
        )
        output.append(match)

    return sorted(output, key=lambda item: (ROUND_ORDER[str(item["round"])], int(item["matchNo"])))


def predictions() -> tuple[list[str], list[dict[str, str]]]:
    raw = read_sheet("Bracket Predictions")
    required_columns(raw, "Bracket Predictions", ["Person", "Match ID", "Winner"])

    rows = raw.dropna(subset=["Person", "Match ID"]).copy()
    rows["Person"] = rows["Person"].astype(str).str.strip()
    rows["Match ID"] = rows["Match ID"].astype(str).str.strip().str.upper()
    rows["Winner"] = rows["Winner"].map(clean_code)

    duplicates = rows.duplicated(subset=["Person", "Match ID"], keep=False)
    if duplicates.any():
        sample = rows.loc[duplicates, ["Person", "Match ID"]].head(8).to_dict("records")
        raise ValueError(f"Duplicate participant/match prediction rows: {sample}")

    expected_ids = {match["id"] for match in default_matches()}
    unexpected = sorted(set(rows["Match ID"]) - expected_ids)
    if unexpected:
        raise ValueError(f"Unexpected match IDs in Bracket Predictions: {', '.join(unexpected)}")

    people = rows["Person"].drop_duplicates().tolist()
    records = [
        {"person": row.Person, "match": row._1, "winner": row.Winner}
        for row in rows.itertuples(index=False)
    ]
    return people, records


def dark_horse() -> dict[str, object]:
    try:
        picks_raw = read_sheet("Dark Horse Picks")
    except ValueError:
        return {"picks": [], "standings": []}

    required_columns(picks_raw, "Dark Horse Picks", ["Person", "Team", "Result", "Points"])
    picks = []
    for row in picks_raw.dropna(subset=["Person"]).itertuples(index=False):
        team = clean_code(getattr(row, "Team"))
        if not team:
            continue
        points = getattr(row, "Points")
        picks.append(
            {
                "person": str(getattr(row, "Person")).strip(),
                "team": team,
                "result": str(getattr(row, "Result")).strip() if pd.notna(getattr(row, "Result")) else "",
                "points": int(points) if pd.notna(points) else 0,
            }
        )

    standings = sorted(
        [
            {
                "person": pick["person"],
                "team": pick["team"],
                "result": pick["result"],
                "points": pick["points"],
            }
            for pick in picks
        ],
        key=lambda item: (-int(item["points"]), str(item["person"])),
    )
    return {"picks": picks, "standings": standings}


def main() -> None:
    if not WORKBOOK.exists():
        raise FileNotFoundError(f"Missing source workbook: {WORKBOOK}")

    people, prediction_rows = predictions()
    data = {
        "source": WORKBOOK.name,
        "scoring": {
            "rounds": ROUNDS,
            "maxTotal": sum(round_def["points"] * round_def["matchCount"] for round_def in ROUNDS),
        },
        "teams": sorted(team_directory().values(), key=lambda item: item["code"]),
        "people": people,
        "matches": matches(),
        "predictions": prediction_rows,
        "darkHorse": dark_horse(),
    }
    payload = json.dumps(data, indent=2, sort_keys=False)
    OUTPUT.write_text(f"window.WORLD_CUP_BRACKET = {payload};\n", encoding="utf-8")
    print(
        f"Wrote {OUTPUT.name}: {len(people)} people, {len(prediction_rows)} picks, "
        f"{len(data['matches'])} matches"
    )


if __name__ == "__main__":
    main()
