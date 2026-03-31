# DailyGrind Expansion Master Blueprint

## Phase 1: The Global Foundation (The Brains)

### Establishing the "Source of Truth" to stop hardcoding "pushups."

• [Partially Complete ] Define EXERCISE_LIB: Create a constant object in script.js containing IDs, Display Names, and Icons (e.g., { pushups: { name: "Pushups", icon: "💪" }, squats: { name: "Squats", icon: "🦵" } }).
• [Done ] Initialize Global State: \* Set let currentExercise = 'pushups';.
o Initialize enabledExercises array from localStorage (default to ['pushups']).
• [Done ] Refactor loadData() Defaults: Ensure the initial data object includes a nested settings structure: data.settings.goals = {}.
• [Logic written, called in initApp ] Run Migration Script: A one-time logic block to check if data.settings.manualGoal exists and move it to data.settings.goals.pushups.manualGoal.
• [Done ] State Synchronization: Ensure currentExercise is saved to localStorage so that if the user closes the app while looking at "Squats," it reopens on "Squats" instead of defaulting back to "Pushups."
• [Partially Done ] Schema Future-Proofing: Add a unit string to each entry in EXERCISE_LIB. Ensure all UI labels for "Reps" pull from this property rather than being hardcoded text.

## Phase 2: Logic Refactoring (The Engine)

### Updating the core math to be exercise-aware.

• [Done ] Audit addSetToDate(dateKey, reps): _ Update: Replace hardcoded "pushups" with the currentExercise variable.
• [Done ] Update getDayTotal(data, date): _ Update: Modify function to accept exerciseId as an optional parameter or use currentExercise by default.
• [Done ] Refactor calculateDailyGoal():
o Update: The Avg/Median logic must now filter activeValues specifically from data[date][currentExercise].
• [Done ] The Firestore Split (syncLocalToCloud):
o Logic: Change the reference from doc(db, "users", userId) to doc(db, "users", userId, "exercises", currentExercise).
o Function to update: syncLocalToCloud.
• [Done ] Multi-Exercise Stats (The Breakdown): Update computeStats() to ensure the 30-day trend and "On Track" status are calculated only using data from the currentExercise.

## Phase 3: The Settings Dashboard (The Controls)

### Creating a dynamic management hub for all exercises.

• [Done ] Build renderExerciseSettings(): A new function to loop through EXERCISE_LIB and generate HTML for:
o Toggles: Enabling/Disabling the exercise.
o Goal Matrix: Numeric inputs for manualGoal for every enabled exercise.
• [Done ] Update updateGoalUI():
o Update: Ensure it pulls the specific goalMode and manualGoal from data.settings.goals[currentExercise].
• [Done ] Visibility Sync: Add logic to hide/show the manual goal input based on its corresponding toggle state.
• [Done ] Threshold Per-Exercise: Update data.settings.goals[exerciseId].onTrackDays to store frequency targets independently for each exercise; update getGoals() to pull this value based on currentExercise.
• [Done ] Global vs. Local Settings: Distinguish between Global Settings (Theme, Username, Data Export) and Exercise Settings (Goal Mode, Thresholds, Manual Rep Goal).
o Implementation: Use a "Settings Context" (e.g., a header that says "Settings for [Current Exercise]") so the user knows they are only changing the goal for the exercise they are currently tracking.

## Phase 4: The Tracker UI (The Heart)

### Moving from a static page to a dynamic "Multi-Tracker."

• [Done ] Implement ExerciseSwitcher UI: \* HTML/CSS: Add a horizontal scrolling nav at the top of #tracker-page.
o Logic: Render buttons for each enabledExercise.
• [Done ] The "Switch" Event:
o Logic: When a tab is clicked: 1. Set currentExercise = selectedId. 2. Update Active Tab CSS. 3. Call updateDisplay(). 4. Call updateGoalUI().
• [Done ] The "Snap" Refresh (updateDisplay):
o Update: Ensure the Progress Ring, "Today's History" list, and Daily Total are all keyed to data[today][currentExercise].

## Phase 5: The Competition (The Leaderboard)

### Ensuring users are ranked against the correct metrics.

• [Done ] Contextual Fetching (fetchLeaderboard):
o Update: Pass currentExercise into the Firestore collection query.
o Logic: Query the collection path users/\*/exercises/[currentExercise] (using a Collection Group query or specific pathing).
• [Using wheel selector as the Dynamic Header ] Dynamic Header:
o Update: Change document.getElementById("leaderboard-title").innerText based on EXERCISE_LIB[currentExercise].name.
• [Done ] Non-Destructive Stats: Update mapStatsToSchema to store totals in a history object keyed by weekId. This prevents Monday morning logs from wiping the previous week's winning data before it can be archived.
• [??? ] Winner Archiving: Create a leaderboard_history collection. Implement a "Snapshot" logic that saves the Top 3 performers' names and scores at the end of every Week/Month to provide a historical "Hall of Fame" view.

## Phase 6: Input & Safety (The FAB)

### Ensuring logging remains effortless and accurate.

• [Done ] Contextual Logging:
o Check: Verify the addSet listener (triggered by the FAB "+") grabs the currentExercise variable.
• [Done ] Safety Catch: Prevent users from disabling all exercises in the settings (must have at least one active).

## Final Phase:
1. Image & Visuals (The Final Piece)
[ ] SVG Strategy: Replace heavy PNGs with an inline SVG or a CSS-based Mesh Gradient in the body background.

Tip: Using an SVG pattern allows it to tile infinitely without adding file weight.

[ ] Dropdown Refinement: Consolidate your inline SVGs for the "Exercise Switcher."

Goal: Ensure the arrow icons and exercise icons (💪, 🦵, etc.) have consistent viewBox settings so they don't jump in size when you switch.

[ ] Theme-Color Check: Ensure the meta name="theme-color" in your HTML matches your new Glassmorphism background color so the phone's status bar blends in.

2. Web App Manifest (manifest.json)
[ ] Short Name: Does the name still say "Pushups" or "DailyGrind"? Ensure it reflects the new multi-exercise identity.

[ ] Icons: If you changed your app logo, ensure all sizes (192x192, 512x512) are updated in the /icons folder and linked correctly.

[ ] Start URL: Verify the start_url is still ./index.html.

3. Service Worker (sw.js) — CRITICAL
[ ] Cache Versioning: Increment your cache name (e.g., change const CACHE_NAME = 'dg-v1' to const CACHE_NAME = 'dg-v2-multi'). If you don't do this, users will not see your new UI changes.

[ ] Asset List: Update the urlsToCache array to include any new JS files (like store.js or your new CSS files) and remove any deleted PNGs.

[ ] The "Nuke" Check: Ensure the Service Worker doesn't accidentally cache your "Secret Login" or "Admin" state, which could lead to weird auth loops.

4. Data & Logic Verification
[ ] Migration Safety: Double-check that your "One-Time Migration" script (moving old pushup goals to the new object) only runs if the old data format exists.

[ ] Default State: Ensure a "Fresh Install" (someone with no data) defaults to pushups and doesn't crash because data.workouts is undefined.

[ ] The FAB Check: Open every exercise in your EXERCISE_LIB and click the + button. Ensure the reps go into the correct bucket for each one.

5. Firebase Rules Deployment
[ ] Production Push: Ensure your "Hybrid Rules" (the regex ones we just finished) are actually deployed to the Firebase Console, not just sitting in your editor.
