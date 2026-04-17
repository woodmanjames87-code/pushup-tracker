# DailyGrind: Bodyweight Workout Tracker 🏋️‍♂️

DailyGrind is built for the "living room athlete" who prioritizes consistency and volume over heart rate and distance.
Currently hosted on GitHub: https://woodmanjames87-code.github.io/pushup-tracker/

## 📝 Project Vision

Most fitness trackers are designed for cardio, time, or gym-based weights. DailyGrind fills the gap for those who prefer the simplicity of calisthenics. We focus on tracking exercise reps that use an individual's own body weight as resistance to build muscle, strength, and flexibility with little to no equipment.

By focusing on compound, multi-joint movements—such as push-ups, pull-ups, and squats—DailyGrind helps users improve body awareness and overall fitness through the "daily grind" of high-volume rep tracking.

## ✨ Key Features

Rep-Centric Tracking: Unlike Apple Fitness or GPS trackers, we prioritize the count.

Compound Movement Focus: Optimized for push-ups, pull-ups, and squats.

No-Equipment Freedom: Built for workouts that can be done anywhere—no gym membership required.

Real-Time Leaderboard: Stay motivated by seeing how your total volume compares to the community.

PWA Reliability: Installable on iOS/Android for a native app feel with offline support.

## 🛠 Tech Stack

Frontend: HTML5, CSS3, Vanilla JavaScript.

Backend: Firebase Authentication & Firestore.

PWA: Service Worker API for versioning and offline caching.

# Project Architecture
DailyGrind follows a modular separation of concerns to ensure the codebase remains scalable and easy to maintain.

## JavaScript (Global Module Pattern)
The logic is split into four core files. Functions are defined locally and exposed to the window object for cross-file communication.

js/init-firebase.js: The Foundation. Initializes the Firebase SDK, configures the database connection, and provides the authentication state.

js/store.js: The Brain. Uses the connection from init-firebase.js to sync your reps and streaks to the cloud.

js/ui.js: The Hands. Listens for data changes from the Store and renders the charts and logs.

js/main.js: The Conductor. The entry point that waits for the DOM to load, then triggers the initial data fetch and sets up the button listeners.

## CSS (Modular Architecture)
Styles are categorized into four specific files to improve performance via parallel loading and to make UI customization straightforward.

css/variables.css: Global design tokens (colors, spacing, transitions).

css/base.css: CSS resets, typography, and core element styles.

css/layout.css: Structural containers, navigation, and page wrappers.

css/components.css: Reusable UI elements (buttons, cards, modals, charts).
