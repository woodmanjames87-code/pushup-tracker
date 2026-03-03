# DailyGrind Expansion Master Blueprint

## Phase 1: The Global Foundation (The Brains)

### Establishing the "Source of Truth" to stop hardcoding "pushups."
•	[ ] Define EXERCISE_LIB: Create a constant object in script.js containing IDs, Display Names, and Icons (e.g., { pushups: { name: "Pushups", icon: "💪" }, squats: { name: "Squats", icon: "🦵" } }).
•	[ ] Initialize Global State: * Set let currentExercise = 'pushups';.
      o	Initialize enabledExercises array from localStorage (default to ['pushups']).
•	[ ] Refactor loadData() Defaults: Ensure the initial data object includes a nested settings structure: data.settings.goals = {}.
•	[ ] Run Migration Script: A one-time logic block to check if data.settings.manualGoal exists and move it to data.settings.goals.pushups.manualGoal.

## Phase 2: Logic Refactoring (The Engine)

### Updating the core math to be exercise-aware.
•	[ ] Audit addSetToDate(dateKey, reps): * Update: Replace hardcoded "pushups" with the currentExercise variable.
•	[ ] Update getDayTotal(data, date): * Update: Modify function to accept exerciseId as an optional parameter or use currentExercise by default.
•	[ ] Refactor calculateDailyGoal():
      o	Update: The Avg/Median logic must now filter activeValues specifically from data[date][currentExercise].
•	[ ] The Firestore Split (syncLocalToCloud):
      o	Logic: Change the reference from doc(db, "users", userId) to doc(db, "users", userId, "exercises", currentExercise).
      o	Function to update: syncLocalToCloud.

## Phase 3: The Settings Dashboard (The Controls)

### Creating a dynamic management hub for all exercises.
•	[ ] Build renderExerciseSettings(): A new function to loop through EXERCISE_LIB and generate HTML for:
      o	Toggles: Enabling/Disabling the exercise.
      o	Goal Matrix (Option 2): Numeric inputs for manualGoal for every enabled exercise.
•	[ ] Update updateGoalUI():
      o	Update: Ensure it pulls the specific goalMode and manualGoal from data.settings.goals[currentExercise].
•	[ ] Visibility Sync: Add logic to hide/show the manual goal input based on its corresponding toggle state.

## Phase 4: The Tracker UI (The Heart)

### Moving from a static page to a dynamic "Multi-Tracker."
•	[ ] Implement ExerciseSwitcher UI: * HTML/CSS: Add a horizontal scrolling nav at the top of #tracker-page.
      o	Logic: Render buttons for each enabledExercise.
•	[ ] The "Switch" Event:
      o	Logic: When a tab is clicked:
        1.	Set currentExercise = selectedId.
        2.	Update Active Tab CSS.
        3.	Call updateDisplay().
        4.	Call updateGoalUI().
•	[ ] The "Snap" Refresh (updateDisplay):
      o	Update: Ensure the Progress Ring, "Today's History" list, and Daily Total are all keyed to data[today][currentExercise].

## Phase 5: The Competition (The Leaderboard)

### Ensuring users are ranked against the correct metrics.
•	[ ] Contextual Fetching (fetchLeaderboard):
      o	Update: Pass currentExercise into the Firestore collection query.
      o	Logic: Query the collection path users/*/exercises/[currentExercise] (using a Collection Group query or specific pathing).
•	[ ] Dynamic Header:
      o	Update: Change document.getElementById("leaderboard-title").innerText based on EXERCISE_LIB[currentExercise].name.

## Phase 6: Input & Safety (The FAB)

### Ensuring logging remains effortless and accurate.
•	[ ] Contextual Logging:
      o	Check: Verify the addSet listener (triggered by the FAB "+") grabs the currentExercise variable.
•	[ ] Safety Catch: Prevent users from disabling all exercises in the settings (must have at least one active).

