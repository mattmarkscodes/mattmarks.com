from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / "World Cup Predictions.xlsx"
OUTPUT = ROOT / "predictions-data.js"

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


def group_teams() -> list[dict[str, object]]:
    groups = []
    for folder in sorted((ROOT / "flags").iterdir(), key=lambda item: item.name):
        if not folder.is_dir():
            continue
        group_id = folder.name.upper()
        teams = []
        for flag in sorted(folder.glob("*.png")):
            code = flag.stem.upper()
            teams.append(
                {
                    "code": code,
                    "name": COUNTRY_NAMES.get(code, code),
                    "flag": flag.relative_to(ROOT).as_posix(),
                }
            )
        groups.append({"id": group_id, "teams": teams})
    return groups


def predictions() -> tuple[list[str], list[dict[str, str]]]:
    raw = pd.read_excel(WORKBOOK, sheet_name="Actual Results - Predictions", header=1)
    person_col = raw.columns[0]
    rows = raw[raw["Group"].isin(list("ABCDEFGHIJKL"))].copy()
    rows = rows[[person_col, "Group", "1st Place", "2nd Place"]]
    rows.columns = ["person", "group", "first", "second"]

    people = rows["person"].drop_duplicates().astype(str).tolist()
    records = [
        {
            "person": str(row.person),
            "group": str(row.group),
            "first": str(row.first),
            "second": str(row.second),
        }
        for row in rows.itertuples(index=False)
    ]
    return people, records


def actual_results() -> list[dict[str, str]]:
    raw = pd.read_excel(WORKBOOK, sheet_name="Actual Results - Actual Group R", header=1)
    rows = raw[raw["Group"].isin(list("ABCDEFGHIJKL"))].copy()
    rows = rows[["Group", "1st Place", "2nd Place"]].dropna(subset=["1st Place", "2nd Place"], how="all")

    return [
        {
            "group": str(row.Group),
            "first": str(row._1) if pd.notna(row._1) else "",
            "second": str(row._2) if pd.notna(row._2) else "",
        }
        for row in rows.itertuples(index=False)
    ]


def main() -> None:
    people, records = predictions()
    data = {
        "source": WORKBOOK.name,
        "scoring": {
            "advancingTeam": 2,
            "positionBonus": 1,
            "maxPerGroup": 6,
            "maxTotal": 72,
        },
        "people": people,
        "groups": group_teams(),
        "predictions": records,
        "actualResults": actual_results(),
    }
    payload = json.dumps(data, indent=2, sort_keys=False)
    OUTPUT.write_text(f"window.WORLD_CUP_PICKS = {payload};\n", encoding="utf-8")
    print(f"Wrote {OUTPUT.name}: {len(people)} people, {len(records)} picks")


if __name__ == "__main__":
    main()
