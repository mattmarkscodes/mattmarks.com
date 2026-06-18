# World Cup Site Update SOP

## Purpose

This site is now design-stable. Routine work should update workbook-driven data,
scores, ranks, and leader explanations without changing the site structure or
visual design.

The authoritative source is:

`World Cup Predictions.xlsx`

The generated browser data is:

`predictions-data.js`

Never manually edit prediction, result, or leaderboard values in
`predictions-data.js`.

## Routine Update Workflow

1. Read the workbook before editing code.
2. Confirm the changed group positions in:
   `Actual Results - Actual Group R`
3. Confirm the leaderboard in:
   `Actual Results - Standings`
4. Regenerate the site data:

```bash
python3 tools/export_predictions.py
```

Use the bundled workspace Python runtime when one is provided.

5. Verify the generated data and calculated scoring.
6. Verify the rendered site.
7. Report the changed groups, new leaders, ties, and verification results.

## Workbook Contracts

Expected worksheets:

- `Actual Results - Predictions`
- `Actual Results - Actual Group R`
- `Actual Results - Standings`

Expected groups are `A` through `L`.

Expected prediction volume:

- 23 participants
- 12 group predictions per participant
- 276 prediction rows
- 552 individual team selections

Do not silently continue if these counts change. Determine whether the workbook
was intentionally changed or malformed.

## Scoring Rules

For each group:

- Correct advancing team: 2 points
- Both advancing teams correct: 4 points
- Correct first-place position: 1 bonus point
- Correct second-place position: 1 bonus point
- Maximum per group: 6 points
- Maximum overall: 72 points

The website calculation for every participant must exactly match the `Points`
value in `Actual Results - Standings`.

If any score differs, stop and diagnose the workbook/export/scoring discrepancy.
Do not patch the displayed leaderboard to conceal a mismatch.

## Position Accuracy

Group order matters. A result of:

```text
1st Place: COL
2nd Place: COD
```

is not equivalent to:

```text
1st Place: COD
2nd Place: COL
```

After every update, explicitly compare every generated `actualResults` row with
the workbook. Pay special attention to the group named by the user.

The Pick Matrix colors mean:

- Green: correct team and correct position
- Orange: correct advancing team, wrong position
- Red: team outside the current top two

## Leaderboard Ranking

The site uses competition ranking:

- Equal scores share the first occupied rank with a `T-` prefix.
- The following rank skips the occupied tied positions.

Example:

```text
T-1, T-1, T-3, T-3, 5
```

Tie labels are calculated by `app.js`; do not hardcode them in the workbook or
generated data.

## Lead Explanations

The `Why They're Leading` column is generated for everyone occupying the top
three competition-rank positions. This may include more than three people when
there is a tie.

Every explanation must be arithmetic-based and reproducible from current data.
The current explanation logic may use:

- Distance from the lead
- Advancing-team points relative to other top-ranked participants
- Exact-position bonuses relative to other top-ranked participants
- A group-level advantage over the other leaders
- A group score compared with the full-field average

After each workbook update, verify that:

- The stated lead or points-back amount is correct.
- Tie language is correct.
- Advancing-point and bonus claims are uniquely true when described as "most."
- Group-specific claims use the latest group positions.
- Field-average differences recalculate correctly.
- Only qualifying top-three rank occupants receive explanations.

Do not write subjective explanations or manually maintain explanatory text.

## Required Data Audit

Before considering an update complete, verify:

- Workbook prediction rows equal generated prediction rows.
- Workbook group results equal generated `actualResults`.
- Workbook standings equal generated `standings`.
- All calculated participant totals equal workbook points.
- There are no missing or duplicate participant/group prediction rows.
- Each updated group has valid team codes and matching local flag files.

A successful audit should have:

```text
prediction_rows_match: true
actual_results_match: true
standings_match: true
score_mismatches: {}
```

## Required Browser Audit

Run a local static server and inspect the rendered site:

```bash
python3 -m http.server 4173
```

Verify:

- Updated group cards show the correct first and second teams.
- Matrix points and green/orange/red states reflect the updated positions.
- Leaderboard names, scores, and tie ranks are correct.
- Lead explanations are populated for the correct rows.
- Consensus bars still total 23 first-place and 23 second-place votes per group.
- All flags load.
- There are no browser console warnings or errors.
- There is no page-level overflow on desktop or mobile.

Stop the local server after verification.

## Stable UI Boundary

Routine data updates should normally change only:

- `World Cup Predictions.xlsx`
- `predictions-data.js`

`tools/export_predictions.py` should change only when the workbook schema or
export requirements change.

Do not modify `index.html`, `app.js`, or `styles.css` during a routine standings
update unless:

- Verification exposes a genuine application bug, or
- The user explicitly requests a UI or behavior change.

Do not reintroduce removed components such as participant detail cards or search
unless explicitly requested.

## Completion Report

Keep the final update concise. Include:

- Which group positions changed
- The new leaderboard leaders and tied ranks
- Whether all 23 scores matched the workbook
- Whether browser verification passed
