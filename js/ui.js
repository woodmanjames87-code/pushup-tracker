import "./vendor/chart.js";
// prettier-ignore
import { auth, db, collection, query, orderBy, limit, getDocs, getDocsFromServer, where, reconcileData } from "./init-firebase.js";
import { elements } from "./dom.js";
// prettier-ignore
import { state, computeStats, getQuickWeekly, EXERCISE_LIB, debounceSave, loadData, saveData, getDateKey, getTodayId, getYesterdayId, getWeekId, getMonthId, getYearId, getPreviousPeriodId } from "./store.js";

/*************************************************
 * NAVIGATION
 *************************************************/
function showPage(pageId) {
    state.selectedEditDate = null;
    const indexMap = { overview: 0, tracker: 1, leaderboard: 2, settings: 3 };
    const newIndex = indexMap[pageId];
    if (newIndex === state.currentPageIndex && document.readyState === "complete") return; // Don't animate if already here

    const direction = newIndex > state.currentPageIndex ? "right" : "left";
    const pageIds = ["overview", "tracker", "leaderboard", "settings"];

    window.scrollTo(0, 0);
    location.hash = `${pageId}-page`;

    // --- 1. PAGE TRANSITION TRANSFORMS & ANIMATIONS ---
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

    // --- 2. UPDATE BOTTOM NAV ACTIVE CLASSES ---
    elements.navButtons.forEach((btn) => {
        const targetPage = btn.getAttribute("data-target");
        btn.classList.toggle("active", targetPage === pageId);
    });

    // --- 3. LIFECYCLE EXECUTION: TRIGGER DATA FETCHES & RENDERERS ---
    refreshActivePage();

    // --- 4. FLOATING LOG BUTTON COMPONENT TOGGLE ---
    const isTrackerOrSocial = pageId === "tracker" || pageId === "leaderboard";
    if (elements.modal?.floatingLogBtn) {
        elements.modal.floatingLogBtn.style.display = isTrackerOrSocial ? "block" : "none";
    }

    // --- 5. PODIUM OVERLAY EXIT CLEANUP ---
    if (pageId !== "leaderboard") {
        hidePodiumOverlay();
    }
}

function refreshActivePage() {
    const pageId = location.hash.substring(1).replace("-page", "");

    if (pageId === "overview") {
        renderOverview();
    }
    if (pageId === "tracker") {
        updateTrackerDisplay();
    }
    if (pageId === "settings") {
        loadCurrentUsername();
        renderEditList();
    }
    if (pageId === "leaderboard") {
        const activeModeBtn = elements.leaderboard.modeSelector?.querySelector(".seg-btn.active");
        const activeMode = activeModeBtn ? activeModeBtn.getAttribute("data-mode") : "single";

        if (activeMode === "matrix" && typeof fetchAndRenderMatrix === "function") {
            // Find which sub-filter is active ("weekly" or "yearly")
            const activeMatrixBtn = elements.leaderboard.matrixFilterContainer?.querySelector(".seg-btn.active");
            const matrixTimeframe = activeMatrixBtn ? activeMatrixBtn.getAttribute("data-matrix-filter") : "weekly";

            fetchAndRenderMatrix(matrixTimeframe);
        } else if (typeof fetchLeaderboard === "function") {
            // Fall back to single mode refresh
            fetchLeaderboard();
        }
    }
}

function openLogModal(exId) {
    const config = EXERCISE_LIB[exId] || { name: "Exercise", unit: "reps" };
    if (!config) {
        console.error(`Exercise configuration not found for ID: ${exId}`);
        return;
    }

    // 2. Inject dynamic text
    elements.modal.title.innerText = `Log ${config.name}`;
    elements.modal.prompt.innerText = `How many ${config.unit} did you do?`;
    elements.modal.container.dataset.activeContext = exId;

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
    delete elements.modal.container.dataset.activeContext;
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
        const pageId = location.hash.substring(1).replace("-page", "");
        if (pageId === "leaderboard" && fetchLeaderboard) {
            fetchLeaderboard();
        }
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
                if (pageId === "leaderboard") {
                    const activeModeBtn = elements.leaderboard.modeSelector?.querySelector(".seg-btn.active");
                    const activeMode = activeModeBtn ? activeModeBtn.getAttribute("data-mode") : "single";

                    if (activeMode === "matrix" && typeof fetchAndRenderMatrix === "function") {
                        // Find which sub-filter is active ("weekly" or "yearly")
                        const activeMatrixBtn =
                            elements.leaderboard.matrixFilterContainer?.querySelector(".seg-btn.active");
                        const matrixTimeframe = activeMatrixBtn
                            ? activeMatrixBtn.getAttribute("data-matrix-filter")
                            : "weekly";

                        fetchAndRenderMatrix(matrixTimeframe);
                    } else if (typeof fetchLeaderboard === "function") {
                        // Fall back to single mode refresh
                        fetchLeaderboard();
                    }
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
        elements.ui.restStreakTag.style.display = s.restStreak > 1 ? "inline-flex" : "none";
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

    // --- 3.5. 30-DAY LINE CHART ---
    if (elements.ui.trendChartView && elements.ui.trendChartView.style.display === "block") {
        renderTrendLineChart(s.chart30Labels || [], s.chart30Values || [], s.dailyGoal);
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
        [
            "legacy-projected",
            "legacy-since",
            "legacy-active-days",
            "stat-all-time",
            "stat-pb",
            "stat-ytd",
            "stat-century",
            "stat-avg",
        ].forEach((id) => {
            let fallbackText = "0";
            if (id.includes("projected") || id.includes("active-days")) {
                fallbackText = "NO DATA YET";
            } else if (id.includes("since")) {
                fallbackText = "START TRACKING TODAY";
            }

            updateText(id, fallbackText);
        });

        // Reset next milestone label text back to its starting anchor
        updateText("label-next-milestone", "NEXT MILESTONE: 5,000");

        if (elements.ui.milestoneFill) elements.ui.milestoneFill.style.width = "0%";
        [elements.ui.pillElite, elements.ui.pillSolid, elements.ui.pillLight].forEach((el) => {
            if (el) el.style.width = "0%";
        });
    }
}

function renderTrendLineChart(labels, values, dailyGoal) {
    // 1. Grab the computed styles from the root element
    const rootStyles = getComputedStyle(document.documentElement);
    // 2. Pull the color values
    const lineColor = rootStyles.getPropertyValue("--fitness-green").trim();
    const gridColor = rootStyles.getPropertyValue("--border-color").trim();
    const textColor = rootStyles.getPropertyValue("--text-muted").trim();

    // 🧠 Dynamic scaling anchored to the user's daily goal
    const realMax = values.length > 0 ? Math.max(...values) : 0;
    const rawCeiling = realMax * 1.1;
    const paddedCeiling = Math.ceil(rawCeiling / 5) * 5;
    const dynamicCeiling = Math.max(paddedCeiling, dailyGoal || 20);

    const canvas = document.getElementById("trendChartCanvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 🔒 Fully centralized cleanup: Wipe previous engine instance using your global state object
    if (state.trendChartInstance) {
        state.trendChartInstance.destroy();
    }

    // Assign directly to your shared global state registry
    state.trendChartInstance = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [
                {
                    label: "Daily Reps",
                    data: values,
                    borderColor: lineColor,
                    borderWidth: 2,
                    pointRadius: 0,
                    hoverRadius: 4,
                    tension: 0.2,
                    fill: true,
                    backgroundColor: "#39e63933", // 20% opacity for the fill
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    display: false,
                },
                y: {
                    beginAtZero: true,
                    max: dynamicCeiling,
                    grid: { color: gridColor },
                    ticks: { maxTicksLimit: 4, color: textColor },
                },
            },
        },
    });
}

function renderOverview() {
    console.log("Rendering overview...");
    const container = document.getElementById("overview-content");
    if (!container) return;

    // 1. Clear existing content (or a specific grid div inside the section)
    container.innerHTML = '<div class="overview-grid"></div>';
    const grid = container.querySelector(".overview-grid");
    const template = document.getElementById("exercise-card-template");

    // 2. Determine which exercises to show
    const rawEnabled = localStorage.getItem("enabled_exercises");
    const enabledList = rawEnabled ? JSON.parse(rawEnabled) : Object.keys(EXERCISE_LIB);

    // 3. Loop and Build
    enabledList.forEach((id) => {
        const ex = EXERCISE_LIB[id];
        if (!ex) return;

        // Fetch light 7-day stats
        const s = getQuickWeekly(id);

        // Clone the template
        const clone = template.content.cloneNode(true);
        const card = clone.querySelector(".widget-card");
        card.dataset.exercise = id; // Store ID for future click events

        // Populate Title and Icon
        clone.querySelector(".exercise-title").innerText = ex.name;
        // Apply the background image path to the card container
        const cardContainer = clone.querySelector(".overview-card");
        if (cardContainer) {
            cardContainer.style.setProperty("--card-bg", `url('../img/bg/bg-${id}.webp')`);
        }

        // Calculate Axis Values
        const maxVal = s.maxVal; // Provided by your helper
        const midVal = Math.round(maxVal / 2);

        // Update Axis (using classes within the clone)
        clone.querySelectorAll(".axis-max").forEach((el) => (el.innerText = maxVal));
        clone.querySelectorAll(".axis-mid").forEach((el) => (el.innerText = midVal));

        // Update Bars and Labels
        const bars = clone.querySelectorAll(".bar-unit");
        const labels = clone.querySelectorAll(".day-label");
        const days = ["Su", "M", "T", "W", "Th", "F", "Sa"];
        const today = new Date();

        s.weeklyData.forEach((v, i) => {
            // Update Bar Height & Opacity
            if (bars[i]) {
                const hPercentage = (v / maxVal) * 100;
                bars[i].style.setProperty("--bar-h", `${hPercentage}%`);
                bars[i].style.opacity = v > 0 ? "1" : "0.2";
            }
            // Update Day Label (matching your tracker logic)
            if (labels[i]) {
                const d = new Date(today);
                d.setDate(d.getDate() - (6 - i));
                labels[i].innerText = days[d.getDay()];
            }
        });

        // Add to DOM
        grid.appendChild(clone);
    });
    window.scrollTo(0, 0);
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
    const newUrl = `url("img/bg/bg-${exId}.webp")`;

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
let leaderboardUnsubscribe = null;

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

            const [snapToday, snapYest] = await Promise.all([getDocsFromServer(qToday), getDocsFromServer(qYest)]);
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

            const querySnapshot = await getDocsFromServer(q);

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

    const snap = await getDocsFromServer(q);
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

function hidePodiumOverlay() {
    const { podiumOverlay } = elements.leaderboard;
    if (!podiumOverlay) return;

    podiumOverlay.classList.remove("active");

    // Smoothly hide the structural node once the slide-down completes
    setTimeout(() => {
        if (!podiumOverlay.classList.contains("active")) {
            podiumOverlay.hidden = true;
        }
    }, 1000); // Matches the CSS transition length
}

// New: Matrix fetch and render for All Exercises view
async function fetchAndRenderMatrix(matrixTimeframe) {
    console.log("fetchAndRenderMatrix triggered...", matrixTimeframe);
    const el = elements.leaderboard;

    if (!el || !el.matrixViewContainer) {
        console.warn("Matrix container not present.");
        return;
    }

    // Guard: Auth check
    const user = auth?.currentUser;
    if (!user) {
        el.matrixViewContainer.innerHTML = `
            <div style="text-align:center; padding: 40px 20px; opacity: 0.7;">
                <h2>Join the leaderboard</h2>
                <p style="margin-top: 10px; margin-bottom: 20px;">Sign in to Google to see your rank and compare stats with the community.</p>
            </div>
        `;
        return;
    }

    // Guard: DB connection
    if (!db) {
        el.matrixViewContainer.innerHTML = "<p style='text-align:center; opacity:0.5;'>Connecting to cloud...</p>";
        return;
    }

    const now = new Date();
    let idValue;
    let typeKey;

    if (matrixTimeframe === "weekly") {
        idValue = getWeekId(now);
        typeKey = "weekly";
    } else {
        // default to yearly
        idValue = getYearId(now);
        typeKey = "yearly";
    }

    // show loader
    el.matrixViewContainer.innerHTML = `<div class="loading-state"><span class="dots-container">Loading</span></div>`;

    try {
        const matrixData = {};

        const standingsRef = collection(db, "standings");
        const q = query(standingsRef, where("periodId", "==", idValue), where("type", "==", typeKey));

        const snap = await getDocsFromServer(q);

        snap.forEach((doc) => {
            const d = doc.data();
            const uid = d.uid || doc.id.split("_").pop();
            const username = d.username || "Anonymous";
            const exerciseId = d.exerciseId || "unknown";
            const score = d.score || 0;

            if (!matrixData[uid]) matrixData[uid] = { name: username };
            matrixData[uid][exerciseId] = (matrixData[uid][exerciseId] || 0) + score;
        });

        // Build rows
        const rows = Object.entries(matrixData).map(([uid, rec]) => {
            const total = Object.keys(rec).reduce((s, k) => (k === "name" ? s : s + (rec[k] || 0)), 0);
            return { uid, name: rec.name, total, measures: rec };
        });

        // Sort by total desc then name
        rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

        // Build table HTML
        const exercises = Object.keys(EXERCISE_LIB || {});

        // 1. SCAN FOR HIGH SCORES PER EXERCISE
        const highScores = {};
        exercises.forEach((ex) => {
            highScores[ex] = 0;
        });

        rows.forEach((userRow) => {
            exercises.forEach((ex) => {
                const val = userRow.measures[ex] || 0;
                if (val > highScores[ex]) {
                    highScores[ex] = val; // Update the record for this column
                }
            });
        });

        // Build table HTML
        let html = `<div class="matrix-wrapper"><table class="matrix-table"><thead><tr><th>Name</th>`;
        exercises.forEach((ex) => {
            const label = (EXERCISE_LIB[ex] && EXERCISE_LIB[ex].name) || ex;
            html += `<th>${label}</th>`;
        });
        html += `<th>Total</th></tr></thead><tbody>`;

        // Generate Rows
        rows.forEach((userRow) => {
            const isMe = userRow.uid === auth?.currentUser?.uid;

            // 2. TRUNCATE THE NAME
            const formattedName = truncateUsername(userRow.name);

            html += `<tr class="${isMe ? "is-me" : ""}">`;
            html += `<td>${formattedName}</td>`; // Use the newly formatted name here

            // Generate individual cells with logic for zeros and crowns
            exercises.forEach((ex) => {
                const val = userRow.measures[ex] || 0;

                if (val === 0) {
                    // Muted zero styling
                    html += `<td><span class="matrix-value-zero">0</span></td>`;
                } else {
                    // Check if this score is the highest in the entire column
                    const isWinner = val === highScores[ex];
                    html += `
                        <td>
                            ${isWinner ? '<span class="matrix-crown">👑</span>' : ""}
                            ${Number(val).toLocaleString()}
                        </td>
                    `;
                }
            });

            html += `<td><strong>${userRow.total.toLocaleString()}</strong></td>`;
            html += `</tr>`;
        });

        html += `</tbody></table></div>`;

        el.matrixViewContainer.innerHTML = html;
    } catch (err) {
        console.error("Matrix failed:", err);
        el.matrixViewContainer.innerHTML = `<p style="text-align:center; opacity:0.5; margin-top:40px;">Failed to load matrix view.</p>`;
    }
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

function triggerFeatureAnnouncement(featureId, title, bulletPoints) {
    // 1. Check if they have already seen this specific update
    if (localStorage.getItem(`seen_update_${featureId}`)) return;

    // 2. Grab elements and inject the custom text strings
    const modal = document.getElementById("reusable-tour-modal");
    if (!modal) return;

    modal.querySelector(".tour-title").innerText = title;

    const listContainer = modal.querySelector(".tour-features-list");
    listContainer.innerHTML = bulletPoints.map((point) => `<li>${point}</li>`).join("");

    // 3. SHOW THE MODAL: Use your standard style pattern
    modal.style.display = "flex";

    // 4. Handle closure click events and seal it for the future
    modal.querySelector(".tour-close-btn").onclick = () => {
        modal.style.display = "none";
        localStorage.setItem(`seen_update_${featureId}`, "true");
    };
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

function truncateUsername(username, maxChar = 12) {
    if (!username) return "Anonymous";

    const cleanName = username.trim();

    // If the name is already short enough, leave it exactly as they styled it
    if (cleanName.length <= maxChar) return cleanName;

    // Split into parts by space
    const parts = cleanName.split(/\s+/);

    // If it's just one massive single word, slice it and add an ellipsis
    if (parts.length === 1) {
        return `${cleanName.substring(0, maxChar)}...`;
    }

    // Grab the first name, and the first letter of the last name
    const firstName = parts[0];
    const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();

    return `${firstName} ${lastInitial}.`;
}

export {
    showPage,
    refreshActivePage,
    openLogModal,
    closeLogModal,
    renderTrendLineChart,
    buildExerciseMenu,
    setActiveExercise,
    buildExerciseToggles,
    refreshStateAndUI,
    updateTrackerDisplay,
    renderOverview,
    renderExerciseSettings,
    adjustOnTrack,
    renderEditList,
    loadCurrentUsername,
    getDisplayUsername,
    fetchLeaderboard,
    hidePodiumOverlay,
    fetchAndRenderMatrix,
    setTheme,
    showUnifiedInstallBanner,
    triggerFeatureAnnouncement,
    showToast,
    triggerHaptic,
};
