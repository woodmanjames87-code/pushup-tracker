# DailyGrind: Bodyweight Workout Tracker 🏋️‍♂️

DailyGrind is a rep-focused workout tracker built for bodyweight training.  
Live app: https://woodmanjames87-code.github.io/pushup-tracker/

## 📝 Project Vision

Most fitness trackers prioritize cardio distance/time or gym-machine workflows. DailyGrind is designed for calisthenics and volume tracking: pushups, pullups, squats, situps, lunges, dips, and planks.

The goal is simple: make daily consistency visible through sets, totals, streaks, trends, and leaderboard comparison.

## ✨ Key Features

- Rep- and volume-centric tracking
- Multi-exercise logging with exercise-specific goals
- Overview, tracker, leaderboard, and settings pages
- Local-first data persistence with optional cloud sync
- Real-time leaderboard data powered by Firestore
- PWA installability and offline caching via Service Worker
- Import/export JSON backups

## 🛠 Tech Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES modules)
- **Data/Auth:** Firebase Authentication + Firestore (CDN SDK imports)
- **Charts:** Chart.js (`js/vendor/chart.js`)
- **PWA:** Web App Manifest + Service Worker

## 📁 Repository Structure

```text
pushup-tracker/
├── index.html
├── sw.js
├── webmanifest.json
├── css/
│   ├── variables.css
│   ├── base.css
│   ├── layout.css
│   └── components.css
├── js/
│   ├── main.js
│   ├── dom.js
│   ├── store.js
│   ├── ui.js
│   ├── init-firebase.js
│   └── vendor/chart.js
└── docs/
    └── matrix-feature-changes.md
```

## 🧠 Code Organization

### JavaScript modules

- **`js/main.js`**  
  App entry point. Boots the app, wires event listeners, initializes PWA helpers, and coordinates page lifecycle behavior.

- **`js/dom.js`**  
  Centralized DOM element map used by UI and controller logic.

- **`js/store.js`**  
  Local data/state layer. Handles localStorage persistence, exercise metadata, goal logic, stat computation (`computeStats`), import/export, and data mutation helpers.

- **`js/ui.js`**  
  Rendering and interaction layer. Updates all page views, charts, modal flows, leaderboard/matrix views, and theme/install UX.

- **`js/init-firebase.js`**  
  Firebase bootstrap and cloud layer. Manages auth listeners, Firestore configuration, reconciliation between local and cloud data, and leaderboard sync writes.

### CSS architecture

- **`css/variables.css`**: Design tokens (colors, spacing, transitions)
- **`css/base.css`**: Global resets and base element styling
- **`css/layout.css`**: App/page layout and structure
- **`css/components.css`**: Reusable UI component styles

## ⚙️ Runtime Architecture (high level)

1. `index.html` loads `js/main.js` as a module.
2. `main.js` triggers initial render and listener setup.
3. `store.js` computes stats and persists local data.
4. `ui.js` renders tracker/overview/leaderboard/settings from store state.
5. `init-firebase.js` handles authentication and cloud sync/reconciliation.
6. `sw.js` provides offline caching and app update flow.

## 🗃️ Data Model Summary

- Local storage key: `workout-data`
- Workout entries are date-keyed (`YYYY-MM-DD`)
- Each day stores per-exercise set arrays
- Firestore collections:
  - `users/{uid}` for user profile + workout snapshot
  - `standings/{period_exercise_uid}` for leaderboard periods
