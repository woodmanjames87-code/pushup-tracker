The "DailyGrind" Integrity Checklist

BACKUP DATA FIRST!

Test 1: The "New Device" Pull
Goal: Ensure a fresh login doesn't wipe the cloud.

    Action:
        1. Sign out.
        2. Run clearAllData() (The "Dumb" button).
        3. Log in.

    Pass Criteria: History instantly repopulates; Console shows "Empty local detected. Performing mandatory cloud pull."

Test 2: The "Saturday Night" Boundary
Goal: Ensure sets logged late Saturday stay in the correct week.

    Action:
        1. Set your system clock to Saturday, 11:30 PM MDT.
        2. Log a set.
        3. Check the "Weekly" chart.

    Pass Criteria: The set appears in the current week, not the "Next" week. (This confirms your year-W-week logic is ignoring the UTC Sunday jump).

Test 3: The "Zombie Sync" Loop
Goal: Ensure the app isn't hammering Firebase.

    Action:
        1. Open the Console.
        2. Switch tabs to another app for 5 seconds, then switch back to DailyGrind.
        3. Repeat this 3 times quickly.

    Pass Criteria: You should see ☁️ Background sync check complete. once, followed by ⏭️ Skipping redundant background sync (throttled). for the subsequent tabs switches.

Test 4: The "Offline-to-Online" Merge
Goal: Ensure sets logged while signed out aren't lost upon login.

    Action:
        1. Sign out.
        2. Log a "Test Set" of 99 reps.
        3. Sign in.

    Pass Criteria: Your cloud history pulls down AND your 99-rep test set is still there (merged).


# OVERVIEW PAGE

Creating an **Overview Page** is a massive UX win. It shifts "DailyGrind" from an app where you have to hunt for exercises into a high-level command center. Since you want to stick to a "Modular JS + HTML/CSS" approach, this fits perfectly into your current architecture.

### 1. The Strategy: How to Achieve This
You will need to build an **Overview Controller** within your UI logic. Instead of just showing the "active" exercise, this controller will loop through your `EXERCISE_LIB` and generate a card for every exercise that isn't marked as "disabled" in your settings.

* **HTML Template:** Create a single `<template>` or a hidden "blueprint" card in your HTML. Your JS will clone this template for each exercise, keeping your DOM structure consistent.
* **State Mapping:** You’ll leverage your existing `computeStats(exerciseId)` function. Since that function is already modular, you can call it inside a loop to get the "Today" and "7-Day" data for every card simultaneously.
* **The Log Trigger:** The "Log Set" button on each card will need to pass the specific `exerciseId` to your existing modal logic so the app knows exactly which exercise you are adding reps to.

---

### 2. Drawbacks & Performance Considerations
Adding an overview page means the app has to do more work upfront. Here’s what to watch for:

* **The "Loop" Tax:** Currently, your app computes stats for *one* exercise. On the overview, you might be computing stats for *six* or more. If `computeStats` involves heavy array filtering over 6 months of data, doing it 6 times in a row could cause a slight "stutter" when switching to the overview page.
* **Chart Bloat:** If you use a heavy charting library, rendering 6 separate bar charts at once can eat up RAM, especially on older mobile devices.
* **DOM Clutter:** If you have 10 exercises and each has a complex card with nested elements, your "Main" page becomes much heavier.

---

### 3. The Recommended Format
For a fitness tracker, **Density vs. Clarity** is the balance.

* **The "Hybrid" Card:** I suggest a card that defaults to the **Daily Progress Bar** (high motivation) but has a small "sparkline" or "mini-bar chart" at the bottom for the 7-day trend.
* **Visual Priority:** Use your `EXERCISE_LIB` icons prominently. Users identify "Pushups" by the icon faster than the text.
* **The "Quick-Log" Action:** Make the "Log Set" button the primary touch target. In Fort Saskatchewan (or anywhere on the go), you want to tap once and type.



---

### 4. Implementation Checklist

#### **Phase 1: HTML & CSS (The Skeleton)**
- [ ] Create a new section `<section id="overview-page" class="page-content">`.
- [ ] Design a CSS Grid or Flexbox layout for the cards (e.g., `grid-template-columns: repeat(auto-fit, minmax(300px, 1fr))`).
- [ ] Define a "Disabled" CSS class (e.g., `.hidden { display: none; }`) to handle user preferences.

#### **Phase 2: Logic (The Brain)**
- [ ] **Filter Logic:** Create a function that checks `state.data.settings.disabledExercises` before rendering.
- [ ] **The Loop:** Write an `updateOverview()` function that iterates through `EXERCISE_LIB`.
- [ ] **Stat Injection:** For each card, call `computeStats(id)` and inject the results into the progress bar width and chart heights.
- [ ] **Navigation Handoff:** Ensure tapping the card title takes you to the dedicated "Detailed View" for that exercise, while the button just opens the log modal.

#### **Phase 3: Optimization**
- [ ] **Lazy Processing:** Only run the overview calculations when the user is actually *on* the overview page.
- [ ] **Batch Drawing:** Build the entire overview as a "Document Fragment" in memory first, then inject it into the DOM in one go to prevent layout thrashing.

---

### Potential Performance Fix
If you notice the 7-day charts are slow, you can **cache the stats object**. Instead of re-calculating the 7-day rolling average every time the UI refreshes, you could store that calculated result in a temporary `state.overviewCache` that only updates when a new set is actually added.

How are you currently handling "disabled" exercises in your settings? Is it an array of IDs, or a boolean inside the exercise library?