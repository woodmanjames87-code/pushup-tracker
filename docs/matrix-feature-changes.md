# Matrix Feature: fetchAndRenderMatrix

Summary

- Added a new function `fetchAndRenderMatrix(matrixTimeframe)` to `js/ui.js`.
- Purpose: fetch and render the "All Exercises" matrix leaderboard for historical periods (`weekly` or `yearly`).

Location

- Function appended to: `js/ui.js` (no existing code modified).

Behavior & Implementation Notes

- Guards: Verifies `auth?.currentUser` and `db` before fetching. If unauthenticated, it renders the "Join the leaderboard" promo in `elements.leaderboard.matrixViewContainer`.
- Timeframe: Accepts `"weekly"` or otherwise defaults to `"yearly"`. Uses `getWeekId(now)` or `getYearId(now)` to compute `periodId`.
- Firestore Query: Reads from `standings` where `periodId == idValue` AND `type == matchingType`. Intentionally does NOT filter by `exerciseId` so a single network call returns all movements for that period.
- Aggregation: Builds a flat `matrixData` map keyed by `uid` with fields for `name` and per-exercise scores. Missing exercise values fall back to `0` during rendering.
- Sorting: Users are sorted by descending total across all exercises, falling back to username alphabetical order.
- Rendering: Produces a simple HTML table inside `elements.leaderboard.matrixViewContainer` with columns for each exercise from `EXERCISE_LIB` and a `Total` column.
- Errors: Any exception replaces the container content with a friendly failure message and logs the error to console.

How to trigger

- The project should call `fetchAndRenderMatrix('weekly')` or `fetchAndRenderMatrix('yearly')` from the matrix sub-filter click handlers. Ensure `elements.leaderboard.matrixViewContainer` exists in the DOM.

Notes

- This change is additive only; existing `fetchLeaderboard` remains untouched.
- No third-party libraries or styling frameworks used.
