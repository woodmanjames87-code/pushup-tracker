# 🗺️ Epic: Grid Matrix Leaderboard ("All Exercises" View)

## 🎯 Overview
The Grid Matrix Leaderboard adds a comprehensive, multi-dimensional view to `DailyGrind`. Instead of forcing users to click through exercises one-by-one, this view aggregates data across the entire `EXERCISE_LIB` into a single, high-density competitive layout.

---

## 📅 The Implementation Roadmap

### 🟩 Phase 1: UI Layout & Navigation
Establish the interface hooks and state toggles before processing heavy data.
- [ ] Add an "All Exercises" tab/pill button next to individual exercise selectors on the Leaderboard page.
- [ ] Create a dedicated container: `<div id="leaderboard-matrix-view" style="display: none;">`.
- [ ] Wire up navigation JavaScript to seamlessly toggle between the single view and the matrix view.
- [ ] Hook into `UI.triggerFeatureAnnouncement` using versioning to introduce the Matrix to returning users upon first click.

### 🟩 Phase 2: Data Processing & Aggregation
Build the data engine to map flat user records from Firebase into a comparative matrix.
- [ ] Create a core utility function: `calculateMatrixData()`.
- [ ] Loop through active users in app state/Firebase.
- [ ] Extract highest scores or volume values for all active keys in `EXERCISE_LIB`.
- [ ] Normalize missing entries (e.g., if a user hasn't logged an exercise, default their value to `0` or `-`).
- [ ] Structure the data payload uniformly:

{
  "user_123": { "name": "James", "pushups": 45, "pullups": 12, "squats": 60, "dips": 20 },
  "user_456": { "name": "Alex", "pushups": 50, "pullups": 8, "squats": 75, "dips": 15 }
}

### 🟩 Phase 3: Building the Matrix Grid (The UI Layer)
Render the layout optimized for desktop and mobile screens.

- [ ] Implement an HTML <'table> layout inside the matrix container.

- [ ] Render headers (<'th>) dynamically using exercise names and relative asset paths (../img/bg/bg-${id}.webp).

- [ ] Render data rows (<'tr>) mapping each user and their respective metrics.

- [ ] Apply CSS position: sticky; left: 0; to the User Name column to allow horizontal swiping on mobile screens without losing user context.

### 🟩 Phase 4: Polish & "The Crown" Badges
Introduce gamification elements to drive engagement.

- [ ] Write a calculation loop to evaluate the maximum value for each column (exercise).

- [ ] Automatically append a gold crown emoji (👑) or badge to the cell containing the highest score in that column.

- [ ] Add a subtle hover state to rows highlighting rows cleanly as users cross-reference numbers.

## 🛠️ Tech Stack & Layout Choices
- Container Architecture: Reuses existing modal structures and layout paradigms for structural alignment.
- Responsive Pattern: Native HTML5 Table with isolated horizontal overflow, keeping the codebase dependency-free and lightweight.
- Path Resolution: Relative tracking strings (../img/bg/...) to guarantee visual loading across local live server deployments and remote production environments (GitHub Pages).