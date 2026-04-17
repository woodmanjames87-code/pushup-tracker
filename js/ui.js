// prettier-ignore
import { auth, db, collection, query, orderBy, limit, getDocs, where, reconcileData } from "./init-firebase.js";
import { elements } from "./dom.js";
// prettier-ignore
import { state, computeStats, EXERCISE_LIB, debounceSave, loadData, saveData, getDateKey, getTodayId, getYesterdayId, getWeekId, getMonthId, getYearId, getPreviousPeriodId } from "./store.js";

/*************************************************
 * NAVIGATION
 *************************************************/
function showPage(pageId) {
    const indexMap = { tracker: 0, leaderboard: 1, settings: 2 };
    const newIndex = indexMap[pageId];
    if (newIndex === state.currentPageIndex) return; // Don't animate if already here

    const direction = newIndex > state.currentPageIndex ? "right" : "left";
    const pageIds = ["tracker", "leaderboard", "settings"];

    scrollTo(0, 0);
    location.hash = `${pageId}-page`;

    pageIds.forEach((id) => {
        const el = document.getElementById(`${id}-page`);
        if (!el) return;

        if (id === pageId) {
            // --- INCOMING PAGE ---
            el.style.display = "flex";
            el.classList.remove("slide-active", "slide-from-left", "slide-from-right", "exit-left", "exit-right");

            // Start position
            el.classList.add(direction === "right" ? "slide-from-right" : "slide-from-left");

            void el.offsetWidth; // Force reflow

            el.classList.add("slide-active");
        } else if (el.classList.contains("slide-active")) {
            // --- OUTGOING PAGE ---
            el.classList.remove("slide-active");
            // Slide out in the opposite direction
            el.classList.add(direction === "right" ? "exit-left" : "exit-right");

            // Wait for animation to finish before hiding
            setTimeout(() => {
                el.style.display = "none";
                el.classList.remove("exit-left", "exit-right");
            }, 300); // Matches CSS transition time
        } else {
            el.style.display = "none";
        }
    });

    state.currentPageIndex = newIndex;

    // 2. Update Nav Bar Button Colors
    elements.navButtons.forEach((btn, idx) => {
        btn.classList.toggle("active", idx === indexMap[pageId]);
    });

    if (pageId === "tracker") {
        updateTrackerDisplay();
    }
    // 3. Special logic: Refresh leaderboard
    if (pageId === "leaderboard" && fetchLeaderboard) {
        fetchLeaderboard();
    }

    // 4. Floating log button logic
    const isTrackerOrSocial = pageId === "tracker" || pageId === "leaderboard";

    elements.modal.floatingLogBtn.style.display = isTrackerOrSocial ? "block" : "none";

    // 5. Settings‑page setup
    if (pageId === "settings") {
        loadCurrentUsername();
        renderEditList();
    }

    // 6. Podium Cleanup: Hide immediately if we aren't on Leaderboard
    if (elements.leaderboard.podiumOverlay && pageId !== "leaderboard") {
        elements.leaderboard.podiumOverlay.classList.remove("active");
        // We use a timeout to hide it completely so the slide-down animation can finish
        setTimeout(() => {
            if (!elements.leaderboard.podiumOverlay.classList.contains("active")) {
                elements.leaderboard.podiumOverlay.hidden = true;
            }
        }, 1000); // Adjust to match your CSS transition time
    }
}

function openLogModal() {
    // 1. Get current exercise config
    const exId = state.currentExercise;
    const config = EXERCISE_LIB[exId] || { name: "Exercise", unit: "reps" };

    // 2. Inject dynamic text
    elements.modal.title.innerText = `Log ${config.name}`;
    elements.modal.prompt.innerText = `How many ${config.unit} did you do?`;

    elements.modal.container.style.display = "flex";
    if (elements.modal.input) {
        elements.modal.input.value = "";
        elements.modal.input.focus();
    }
}

function closeLogModal() {
    if (elements.modal.container) {
        elements.modal.container.style.display = "none";
        if (elements.modal.input) {
            elements.modal.input.value = "";
        }
    }
}

function updateFloatingBtn() {
    if (!elements.logBtnSpan) return;

    const exId = state.currentExercise;
    const config = EXERCISE_LIB[exId];

    if (config) {
        elements.logBtnSpan.innerText = config.name.toUpperCase();
    }
}

// ======= Menu Logic ==============
// 1. CONSTRUCTOR: Builds Toggles for Enabling/Disabling Exercises in Settings for the Menu and the Menu Itself
function buildExerciseToggles() {
    const container = elements.settings.exerciseCheckboxList;
    if (!container) return;

    // 1. Use a Document Fragment to build "offline" for better performance
    const fragment = document.createDocumentFragment();
    container.innerHTML = "";

    Object.keys(EXERCISE_LIB).forEach((exId) => {
        const config = EXERCISE_LIB[exId];
        const isEnabled = state.enabledExercises.includes(exId);

        const row = document.createElement("div");
        row.className = "setting-row checkbox-row";
        row.innerHTML = `
            <label for="chk-${exId}">${config.name}</label>
            <label class="switch">
                <input type="checkbox" id="chk-${exId}" ${isEnabled ? "checked" : ""} data-ex="${exId}" />
                <span class="slider round"></span>
            </label>
        `;

        const input = row.querySelector("input");
        input.addEventListener("change", (e) => {
            const id = e.target.getAttribute("data-ex");

            if (e.target.checked) {
                if (!state.enabledExercises.includes(id)) {
                    state.enabledExercises.push(id);
                }
            } else {
                // Prevent disabling everything
                if (state.enabledExercises.length <= 1) {
                    e.target.checked = true;
                    showToast("At least one exercise must stay enabled!");
                    triggerHaptic("warning");
                    return;
                }
                state.enabledExercises = state.enabledExercises.filter((item) => item !== id);
            }

            // Save state
            localStorage.setItem("enabled_exercises", JSON.stringify(state.enabledExercises));

            triggerHaptic("success");

            // 🚀 REFRESH: Rebuild the header dropdown and update the current exercise view
            buildExerciseMenu();
            updateTrackerDisplay();
        });

        fragment.appendChild(row);
    });

    // 2. Inject the entire fragment at once
    container.appendChild(fragment);
}
// 2. CONSTRUCTOR: Builds the HTML for the menu
function buildExerciseMenu() {
    const menu = elements.menu.items;
    const exercises = state.enabledExercises || Object.keys(EXERCISE_LIB);

    // 1. Render the HTML without the 'onclick' attribute
    menu.innerHTML = exercises
        .map((id) => {
            const ex = EXERCISE_LIB[id];
            return `
            <div class="exercise-menu-item" data-id="${id}">
                <span class="menu-thumb-container">
                    <img src="img/bg/bg-${id}.webp" class="menu-thumb" alt="${ex.name}">
                </span>
                <span class="menu-label">${ex.name}</span>
            </div>`;
        })
        .join("");

    // 2. Attach listeners using the function that is now local to this file
    menu.querySelectorAll(".exercise-menu-item").forEach((item) => {
        item.addEventListener("click", () => {
            const id = item.getAttribute("data-id");
            setActiveExercise(id); // Works now because they are in the same module!
        });
    });

    if (state.currentExercise) {
        setActiveExercise(state.currentExercise, true);
    }
}
// 3. ACTUATOR: Handles the actual exercise change
function setActiveExercise(id, silent = false) {
    const ex = EXERCISE_LIB[id];
    if (!ex) return;

    // Update State
    state.currentExercise = id;
    localStorage.setItem("lastExercise", id);

    // Update UI Elements
    const label = elements.activeExerciseName;
    if (label) {
        label.innerText = ex.name;
        label.style.color = ex.color || "inherit";
    }

    // Single-pass menu update (more efficient than querySelectorAll every time)
    const menu = elements.menu.items;
    Array.from(menu.children).forEach((item) => {
        item.classList.toggle("active", item.getAttribute("data-id") === id);
    });

    // Handle "Live" interactions vs "Initial" setup
    if (!silent) {
        triggerHaptic("success");
        updateTrackerDisplay();
        renderExerciseSettings();
        updateFloatingBtn();
        updateBgImage(id);
        renderEditList();

        menu.classList.remove("show");
    }
}

/*************************************************
 * UI RENDERING
 *************************************************/
function refreshStateAndUI() {
    const now = Date.now();
    const isQuickRefresh = now - state.lastInitTime < 10000;

    // --- 2. INITIAL STATE (Logic & UI) ---
    if (!state.selectedEditDate && getDateKey) {
        state.selectedEditDate = getDateKey();
        elements.settings.editDatePicker.value = state.selectedEditDate;
    }

    // --- 3. THEME & NAVIGATION ---
    const savedTheme = localStorage.getItem("user-theme") || "auto";
    setTheme(savedTheme);

    const hash = location.hash.substring(1);
    showPage(hash ? hash.replace("-page", "") : "tracker");

    // Ensure this runs BEFORE buildExerciseMenu()
    const savedExercise = localStorage.getItem("lastExercise");

    // Check if the saved ID actually exists in our library, otherwise default to 'pushups'
    state.currentExercise = savedExercise && EXERCISE_LIB[savedExercise] ? savedExercise : Object.keys(EXERCISE_LIB)[0];

    // --- 4. DATA REFRESH (Local) ---
    loadCurrentUsername();
    updateTrackerDisplay();
    updateFloatingBtn();
    updateBgImage(state.currentExercise);
    renderExerciseSettings();

    // --- 5. CLOUD SYNC (Background) ---
    if (!isQuickRefresh && auth?.currentUser && reconcileData) {
        state.lastInitTime = now;
        reconcileData()
            .then(() => {
                console.log("☁️ Background sync complete.");
                // Silent Leaderboard refresh if active
                const pageId = location.hash.substring(1).replace("-page", "");
                if (pageId === "leaderboard" && fetchLeaderboard) {
                    fetchLeaderboard();
                }
            })
            .catch((err) => console.error("Sync Error:", err));
    }
}

function updateTrackerDisplay() {
    const s = computeStats();
    if (!s) {
        console.warn("No stats object returned.");
        return;
    }

    // Helper: Now uses the cached 'stats' map from dom.js
    const updateText = (id, val) => {
        const el = elements.stats[id];
        if (el) el.innerText = val;
    };

    // --- 1. DAILY STATS & PROGRESS ---
    updateText("today-val", s.todayTotal);
    updateText("yest-val", s.yesterdayTotal);
    updateText("goal-text", `Goal: ${s.dailyGoal}`);
    updateText("streak-val", s.streak);
    updateText("rest-val", s.rest14);

    const pct = s.todayTotal / s.dailyGoal;
    if (elements.ui.greenBar) elements.ui.greenBar.style.width = Math.min(pct, 1) * 100 + "%";
    if (elements.ui.blueBar) elements.ui.blueBar.style.width = pct > 1 ? Math.min(pct - 1, 1) * 100 + "%" : "0%";

    if (elements.ui.restStreakTag) {
        elements.ui.restStreakTag.style.display = s.restStreak > 0 ? "inline-flex" : "none";
        if (s.restStreak > 0) updateText("rest-streak-val", s.restStreak);
    }

    // --- 2. 30-DAY PERFORMANCE & TRENDS ---
    updateText("total-30-val", s.total30);
    updateText("active-30-val", `${s.active30}/30`);
    updateText("avg-30", `Avg: ${s.avg30}/day`);
    updateText("thirty-goal-val", s.thirtyGoal);
    updateText("thirty-improv-val", s.thirtyImprov);

    if (elements.ui.trendFill) {
        elements.ui.trendFill.style.width = Math.min((s.total30 / s.thirtyImprov) * 100, 100) + "%";
    }
    if (elements.ui.trendLabel) {
        elements.ui.trendLabel.innerText = s.trend.label;
        elements.ui.trendLabel.style.color = s.trend.color;
    }

    // --- 3. WEEKLY CHART ---
    if (elements.ui.barChart && elements.ui.barLabels) {
        const bars = elements.ui.barChart.querySelectorAll(".bar-unit");
        const labels = elements.ui.barLabels.querySelectorAll(".day-label");
        const days = ["Su", "M", "T", "W", "Th", "F", "Sa"];
        const maxVal = Math.max(...s.weeklyData, 1);
        const midVal = Math.round(maxVal / 2);

        ["axis-max-l", "axis-max-r", "axis-mid-l", "axis-mid-r"].forEach((id) =>
            updateText(id, id.includes("max") ? maxVal : midVal),
        );

        s.weeklyData.forEach((v, i) => {
            if (bars[i]) {
                const hPercentage = (v / maxVal) * 100;
                bars[i].style.setProperty("--bar-h", `${hPercentage}%`);
                bars[i].style.opacity = v > 0 ? "1" : "0.2";
            }
            if (labels[i]) {
                const d = new Date();
                d.setDate(d.getDate() - (6 - i));
                labels[i].innerText = days[d.getDay()];
            }
        });
        updateText("weekly-title", `Total: ${s.weeklyTotal}`);
    }

    // --- 4. MONTHLY CHART (6-Month Optimized) ---
    if (elements.ui.monthlyChart) {
        const containers = elements.ui.monthlyChart.querySelectorAll(".monthly-bar-container");
        const monthEntries = Object.entries(s.monthlyData).slice(-6); // Only take last 6
        const maxMonth = Math.max(...monthEntries.map(([_, v]) => v), 1);

        monthEntries.forEach(([label, val], i) => {
            const container = containers[i];
            if (container) {
                const bar = container.querySelector(".bar-unit");
                const valLabel = container.querySelector(".chart-value-label");
                const nameLabel = container.querySelector(".month-name-label");

                const hPct = (val / maxMonth) * 100;
                if (bar) {
                    bar.style.setProperty("--bar-h", `${hPct}%`);
                    bar.style.opacity = val > 0 ? "1" : "0.2";
                }
                if (valLabel) valLabel.innerText = val > 0 ? val : "";
                if (nameLabel) nameLabel.innerText = label;
            }
        });
    }

    // --- 5. LEGACY INSIGHTS (ALL-TIME) ---
    if (s.allTimeTotal > 0) {
        updateText("legacy-projected", `${s.currentYearStr} PROJECTION: ${s.projectedYearly.toLocaleString()}`);
        updateText("legacy-since", `STARTED ${s.firstDateStr}`);
        updateText("legacy-active-days", `ACTIVE: ${s.activeDays} / ${s.totalDaysElapsed} days`);
        updateText("stat-all-time", s.allTimeTotal.toLocaleString());
        updateText("stat-pb", s.pb.toLocaleString());
        updateText("stat-ytd", s.ytdTotal.toLocaleString());
        updateText("stat-century", s.centuryDays);
        updateText("stat-avg", `${s.lifetimeAvg}/day`);

        updateText("label-next-milestone", `NEXT MILESTONE: ${s.nextMilestone.toLocaleString()}`);
        if (elements.ui.milestoneFill) {
            const milestonePct = (s.allTimeTotal / s.nextMilestone) * 100;
            elements.ui.milestoneFill.style.width = Math.min(milestonePct, 100) + "%";
        }

        const total = s.allTimeTotal || 1;
        if (elements.ui.pillElite) elements.ui.pillElite.style.width = (s.eliteVol / total) * 100 + "%";
        if (elements.ui.pillSolid) elements.ui.pillSolid.style.width = (s.solidVol / total) * 100 + "%";
        if (elements.ui.pillLight) elements.ui.pillLight.style.width = (s.lightVol / total) * 100 + "%";
    } else {
        ["legacy-projected", "legacy-since", "stat-all-time", "stat-pb", "stat-ytd"].forEach((id) => {
            updateText(
                id,
                id.includes("projected") ? "NO DATA YET" : id.includes("since") ? "START TRACKING TODAY" : "0",
            );
        });

        if (elements.ui.milestoneFill) elements.ui.milestoneFill.style.width = "0%";
        [elements.ui.pillElite, elements.ui.pillSolid, elements.ui.pillLight].forEach((el) => {
            if (el) el.style.width = "0%";
        });
    }
}

function renderExerciseSettings() {
    const data = loadData();
    const exId = state.currentExercise;

    // 1. Get Exercise-Specific Config from your Library
    const config = EXERCISE_LIB[exId] || { name: exId, minGoal: 1, unit: "reps" };
    const defaultMin = config.minGoal;

    // 2. Resolve Settings (Current Exercise vs Baseline)
    const exSettings = data.settings?.goals?.[exId] || {
        goalMode: "auto",
        manualGoal: defaultMin,
        onTrackDays: 4,
    };

    // 3. Update Header & Labels
    const exerciseNameLabels = document.querySelectorAll(".settings-exercise-name");
    exerciseNameLabels.forEach((el) => {
        el.innerText = config.name.toUpperCase();
    });

    // Update the unit labels (e.g., changes "Reps" to "Secs" for Plank)
    const unitLabels = document.querySelectorAll(".unit-label");
    unitLabels.forEach((el) => (el.innerText = config.unit.charAt(0).toUpperCase() + config.unit.slice(1)));

    // 4. Goal Mode (Auto vs Manual)
    const isAuto = exSettings.goalMode !== "manual";
    if (elements.settings.goalModeToggle) elements.settings.goalModeToggle.checked = isAuto;

    // Update the manual input and its placeholder
    if (elements.settings.manualGoalInput) {
        elements.settings.manualGoalInput.value = exSettings.manualGoal;
        elements.settings.manualGoalInput.placeholder = defaultMin;
    }

    // Dynamic Description Text
    const statusText = isAuto
        ? `Calculated Goal: Max(Avg,Median) of 14 active days (Min ${defaultMin} ${config.unit}).`
        : `Manual Goal Setpoint Active for ${config.name}.`;

    elements.settings.manualGoalContainer.style.display = isAuto ? "none" : "flex";

    const goalDescriptions = document.querySelectorAll(".goal-description");
    goalDescriptions.forEach((el) => (el.innerHTML = statusText));

    // 5. Activity Thresholds (Global logic, local value)
    const isRecommended = data.settings?.goals?.[exId]?.thresholdMode !== "custom";
    elements.settings.thresholdModeToggle.checked = isRecommended;

    const savedOnTrack = isRecommended ? 4 : exSettings.onTrackDays || 4;
    elements.settings.onTrackInput.value = savedOnTrack;

    if (elements.settings.customThresholdContainer) {
        elements.settings.customThresholdContainer.style.display = isRecommended ? "none" : "flex";
    }

    // Update live hints
    if (elements.settings.onTrackHint) elements.settings.onTrackHint.innerText = savedOnTrack;
    if (elements.settings.improveDisplay) elements.settings.improveDisplay.innerText = Number(savedOnTrack) + 1;
}

function adjustOnTrack(change) {
    const stepper = elements.settings.onTrackInput?.closest(".number-stepper");
    let currentVal = parseInt(elements.settings.onTrackInput.value) || 4;
    let newVal = currentVal + change;

    if (newVal >= 1 && newVal <= 6) {
        elements.settings.onTrackInput.value = newVal;
        triggerHaptic("success");

        // UI Hints
        elements.settings.improveDisplay.innerText = newVal + 1;
        elements.settings.onTrackHint.innerText = newVal;

        debounceSave(() => {
            const data = loadData();
            const exId = state.currentExercise;

            if (!data.settings.goals) data.settings.goals = {};
            if (!data.settings.goals[exId]) data.settings.goals[exId] = {};

            data.settings.goals[exId].onTrackDays = newVal;

            saveData(data);
        }, 600);
    } else {
        triggerHaptic("warning");
        if (stepper) {
            stepper.classList.add("limit-shake");
            setTimeout(() => stepper.classList.remove("limit-shake"), 400);
        }
    }
}

function renderEditList() {
    const dateKey = state.selectedEditDate;
    const exercise = state.currentExercise;
    const config = EXERCISE_LIB[exercise] || { unit: "reps" };

    if (!elements.settings.editSetsList) return;
    updateDateLabel(dateKey);

    const data = loadData();
    // Instead of todayKey, we use the date from the picker
    const sets = data[dateKey]?.[exercise] || [];

    elements.settings.editSetsList.innerHTML = "";

    if (sets.length === 0) {
        elements.settings.editSetsList.innerHTML =
            '<p class="h3" style="text-align:center;">No sets for this date.</p>';
        return;
    }

    sets.forEach((reps, i) => {
        elements.settings.editSetsList.insertAdjacentHTML(
            "beforeend",
            `
            <div class="edit-item">
                <span>Set ${i + 1}: <strong>${reps}</strong> ${config.unit}</span>
                <button class="btn-delete" data-index="${i}">Delete</button>
            </div>
        `,
        );
    });
}

function loadCurrentUsername() {
    if (elements.settings.nameInput) {
        // Use the 'Getter' to fill the 'Setter'
        elements.settings.nameInput.value = getDisplayUsername();
    }
}

function getDisplayUsername(extraData = {}) {
    const localData = loadData();
    // 1. Explicitly passed data (like from a prompt)
    if (extraData.username) return extraData.username;
    // 2. The "Truth": Saved settings in LocalStorage
    if (localData.settings?.username) return localData.settings.username;
    // 3. Fallback to Auth Profile
    if (auth?.currentUser?.displayName) return auth.currentUser.displayName;
    // 4. Fallback to current UI value ONLY if it isn't the default
    if (elements.settings.nameInput?.value && elements.settings.nameInput.value !== "Anonymous") {
        return elements.settings.nameInput.value;
    }
    // 5. Hard Default
    return "Anonymous";
}

function updateDateLabel(dateKey) {
    if (!elements.settings.displayDateLabel) return;

    // Use whatever name you gave it in store.js
    const todayKey = getTodayId ? getTodayId() : getDateKey();

    if (dateKey === todayKey) {
        elements.settings.displayDateLabel.innerText = "Today";
    } else {
        // T00:00:00 prevents timezone shifts
        const dateObj = new Date(dateKey + "T00:00:00");

        elements.settings.displayDateLabel.innerText = dateObj.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    }
}

function updateBgImage(exId) {
    const primary = elements.ui.bgPrimary;
    const secondary = elements.ui.bgSecondary;
    const newUrl = `url("../img/bg/bg-${exId}.webp")`;

    if (state.currentLayer === "primary") {
        secondary.style.backgroundImage = newUrl;
        secondary.classList.add("active");
        primary.classList.remove("active");
        state.currentLayer = "secondary";
    } else {
        primary.style.backgroundImage = newUrl;
        primary.classList.add("active");
        secondary.classList.remove("active");
        state.currentLayer = "primary";
    }
}
/*************************************************
 * LEADERBOARD LOGIC
 *************************************************/
async function fetchLeaderboard(passedFilter = null) {
    console.log("fetchLeaderboard triggered...");
    // Hide the staggered podium by default (will be shown if data exists)
    const el = elements.leaderboard;
    el.podiumOverlay.hidden = true;

    // Check if auth exists and if there is a currentUser
    const user = auth?.currentUser;

    if (!user) {
        el.rangeText.innerText = "Community Leaderboard";
        el.list.innerHTML = `
            <div style="text-align:center; padding: 40px 20px; opacity: 0.7;">
                <h2>Join the leaderboard</h2>
                <p style="margin-top: 10px; margin-bottom: 20px;">Sign in to Google to see your rank and compare stats with the community.</p>
            </div>
        `;
        return; // Stop the function here
    }

    if (!el.list) return;

    // 1. Determine Filter
    const activeBtn = Array.from(el.filterButtons || []).find((btn) => btn.classList.contains("active"));
    const filter = passedFilter || (activeBtn ? activeBtn.getAttribute("data-filter") : "stats.daily");

    // 2. Safety Guard
    if (!db) {
        el.list.innerHTML = "<p style='text-align:center; opacity:0.5;'>Connecting to cloud...</p>";
        return;
    }

    const now = new Date();
    const exerciseId = state.currentExercise || "pushups"; // 🚀 Added context
    let displayLabel = "";

    // 3. Set Display Label (No changes here)
    if (filter === "stats.daily") displayLabel = "Today & Yesterday";
    else if (filter === "stats.week") {
        const sun = new Date(now);
        sun.setDate(now.getDate() - now.getDay());
        displayLabel = `Week of ${sun.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    } else if (filter === "stats.month") {
        displayLabel = now.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    } else if (filter === "stats.year") {
        displayLabel = now.getFullYear();
    }
    el.rangeText.innerText = displayLabel;

    try {
        el.list.innerHTML = `<div class="loading-state"><span class="dots-container">Loading</span></div>`;

        let leaderboardData = [];

        // 4. Fetch Logic
        if (filter === "stats.daily") {
            drawPodium(null);
            // --- KEEPING YOUR ORIGINAL DAILY LOGIC (Users Collection) ---
            const standingsRef = collection(db, "standings");

            // Inside fetchLeaderboard (Daily Section)
            const qToday = query(
                standingsRef,
                where("exerciseId", "==", exerciseId),
                where("periodId", "==", getTodayId()),
                limit(30),
            );
            const qYest = query(
                standingsRef,
                where("exerciseId", "==", exerciseId),
                where("periodId", "==", getYesterdayId()),
                limit(30),
            );

            const [snapToday, snapYest] = await Promise.all([getDocs(qToday), getDocs(qYest)]);
            const userMap = new Map();

            // 1. First, add everyone who was active YESTERDAY
            snapYest.forEach((doc) => {
                const d = doc.data();
                userMap.set(d.uid, {
                    uid: d.uid,
                    username: d.username,
                    todayScore: 0, // Default to 0 until proven otherwise
                    yesterdayScore: d.score, // Their 'score' in a yesterday document IS their yesterday score
                });
            });

            // 2. Then, add or update with everyone active TODAY
            snapToday.forEach((doc) => {
                const d = doc.data();
                if (userMap.has(d.uid)) {
                    const entry = userMap.get(d.uid);
                    entry.todayScore = d.score;
                    // Optimization: Use the yestScore bundled in the today doc
                    entry.yesterdayScore = d.yestScore || 0;
                } else {
                    userMap.set(d.uid, {
                        uid: d.uid,
                        username: d.username,
                        todayScore: d.score,
                        yesterdayScore: d.yestScore || 0,
                    });
                }
            });

            leaderboardData = Array.from(userMap.values());
            leaderboardData.sort((a, b) => b.todayScore - a.todayScore || b.yesterdayScore - a.yesterdayScore);
        } else {
            // --- 🚀 HISTORICAL LOGIC (Standings Collection) ---
            const fieldName = filter.split(".")[1]; // "week", "month", or "year"
            const now = new Date();

            let idValue;
            if (fieldName === "week") idValue = getWeekId(now);
            else if (fieldName === "month") idValue = getMonthId(now);
            else idValue = getYearId(now);

            // NOW you can call these
            // ... inside the else (Historical Logic) block ...
            const typeKey = fieldName === "week" ? "weekly" : fieldName === "month" ? "monthly" : "yearly";

            // 1. Fetch the data using your existing function
            const podiumData = await fetchPreviousPodium(typeKey, idValue);

            // 2. Call the DRAW function (make sure this matches the name in your JS)
            drawPodium(podiumData, filter);

            // Query the 'standings' collection
            const standingsRef = collection(db, "standings");
            const q = query(
                standingsRef,
                where("periodId", "==", idValue),
                where("exerciseId", "==", exerciseId), // 🚀 Exercise-aware!
                orderBy("score", "desc"),
                limit(20),
            );

            const querySnapshot = await getDocs(q);

            querySnapshot.forEach((doc) => {
                const d = doc.data();
                leaderboardData.push({
                    uid: d.uid || doc.id.split("_").pop(),
                    username: d.username || "Anonymous",
                    score: d.score || 0,
                });
            });
        }

        // 5. Render (No changes here)
        el.list.innerHTML = "";
        if (leaderboardData.length === 0) {
            el.list.innerHTML = `<p class='h3' style="text-align:center; opacity:0.5; margin-top:40px;">No ranks yet.</p>`;
            return;
        }

        leaderboardData.forEach((user, index) => {
            const isMe = user.uid === auth?.currentUser?.uid;
            const displayScore = filter === "stats.daily" ? user.todayScore : user.score;

            const row = `
                <div class="lb-row ${isMe ? "is-me" : ""}">
                    <span class="lb-rank">${index + 1}</span>
                    <span class="lb-name">${user.username}</span>
                    <div style="text-align:right">
                        <span class="lb-score">${displayScore.toLocaleString()}</span>
                        ${filter === "stats.daily" ? `<span style="font-size:0.75rem; opacity:0.6; display:block;">Yest: ${user.yesterdayScore}</span>` : ""}
                    </div>
                </div>
            `;
            el.list.insertAdjacentHTML("beforeend", row);
        });
    } catch (err) {
        console.error("Leaderboard failed:", err);
        el.list.innerHTML = `<p style="text-align:center; opacity:0.5; margin-top:40px;">Failed to load leaderboard.</p>`;
    }
}
// Fetch Previous Podium Data for Leaderboard
async function fetchPreviousPodium(type, currentPeriodId) {
    const prevId = getPreviousPeriodId(type, currentPeriodId);
    const exerciseId = state.currentExercise;

    const q = query(
        collection(db, "standings"),
        where("periodId", "==", prevId),
        where("exerciseId", "==", exerciseId),
        orderBy("score", "desc"),
        limit(3),
    );

    const snap = await getDocs(q);
    return snap.docs.map((doc) => doc.data());
}
// Leaderboard Podium Render
function drawPodium(winners, filterType) {
    // 1. If no winners, slide down and hide
    if (!winners || winners.length === 0) {
        elements.leaderboard.podiumOverlay.classList.remove("active");
        setTimeout(() => {
            if (!elements.leaderboard.podiumOverlay.classList.contains("active"))
                elements.leaderboard.podiumOverlay.hidden = true;
        }, 1000); // Matches CSS transition time
        return;
    }

    // 2. Prepare for entrance
    elements.leaderboard.podiumOverlay.hidden = false;
    // Tiny delay ensures the browser sees 'hidden=false' before adding 'active'
    setTimeout(() => elements.leaderboard.podiumOverlay.classList.add("active"), 10);

    // 3. Update Title
    if (elements.leaderboard.podiumTitle) {
        const labels = {
            "stats.week": "LAST WEEK'S TOP 3",
            "stats.month": "LAST MONTH'S TOP 3",
            "stats.year": "LAST YEAR'S TOP 3",
        };
        elements.leaderboard.podiumTitle.textContent = labels[filterType] || "PREVIOUS TOP 3";
    }

    // 4. Update Slots
    elements.leaderboard.podiumSlots.forEach((slot, index) => {
        if (!slot) return;

        const data = winners[index];

        if (data) {
            // 🚀 Using our pre-linked shortcuts
            if (slot._name) {
                slot._name.textContent = data.username || data.userName || "---";
            }
            if (slot._score) {
                slot._score.textContent = data.score;
            }

            slot.style.display = "flex";
        } else {
            slot.style.display = "none";
        }
    });
}
/***********************
 * Utilities
 ***********************/
function setTheme(theme) {
    const htmlElement = document.documentElement;
    let appearance = theme;

    if (theme === "auto") {
        appearance = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }

    // Apply the theme to the data-theme attribute for CSS to pick up
    htmlElement.setAttribute("data-theme", appearance);
    localStorage.setItem("user-theme", theme);

    // Update the button styles in the settings page
    elements.settings.themeButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.getAttribute("data-theme") === theme);
    });
}

function showUnifiedInstallBanner(platform = "auto") {
    if (!elements.installBanner.container) return;

    if (localStorage.getItem("installBannerClosed") === new Date().toLocaleDateString()) return;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
    const device = platform === "auto" ? (isIOS ? "ios" : "android") : platform;

    if (device === "ios") {
        if (elements.installBanner.text) {
            elements.installBanner.text.innerHTML =
                '<strong>Install App</strong><br>Tap <span class="ios-icon"></span> Share icon then<br>Tap   <span class="ios-add-icon"></span>  Add to Home Screen</style>';
        }
        if (elements.installBanner.nowBtn) {
            elements.installBanner.nowBtn.style.display = "none";
        }
    } else {
        if (elements.installBanner.text) {
            elements.installBanner.text.innerText = "Install App for easy access!";
        }
        if (elements.installBanner.nowBtn) {
            elements.installBanner.nowBtn.innerText = "Install App";
            elements.installBanner.nowBtn.style.display = "inline-block";
        }
    }

    elements.installBanner.container.classList.remove("hidden");
}

function showToast(message, duration = 3000) {
    console.log("Toast triggered with message:", message); // Debug line
    const toast = document.createElement("div");

    toast.className = "toast";
    toast.textContent = message;

    elements.toastContainer.appendChild(toast);

    // Remove the toast after the duration
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.5s ease";
        setTimeout(() => toast.remove(), 500);
    }, duration);

    if (!elements.toastContainer) {
        console.error("Toast container not found in the DOM!");
        return;
    }
}

function triggerHaptic(type = "success") {
    //Check for support
    if (!("vibrate" in navigator)) return;

    // Prevent the "Intervention" error
    // Only attempt vibration if the user has interacted with the page
    if (navigator.userActivation && !navigator.userActivation.isActive) {
        return;
    }

    try {
        switch (type) {
            case "tick":
                navigator.vibrate(10);
                break;
            case "success":
                navigator.vibrate(40);
                break;
            case "warning":
                navigator.vibrate([40, 30, 40]);
                break;
            case "heavy":
                navigator.vibrate(80);
                break;
        }
    } catch (e) {
        // Silently handle any remaining browser-specific gesture blocks
    }
}

export {
    showPage,
    openLogModal,
    closeLogModal,
    buildExerciseMenu,
    buildExerciseToggles,
    refreshStateAndUI,
    updateTrackerDisplay,
    renderExerciseSettings,
    adjustOnTrack,
    renderEditList,
    loadCurrentUsername,
    getDisplayUsername,
    fetchLeaderboard,
    setTheme,
    showUnifiedInstallBanner,
    showToast,
    triggerHaptic,
};
