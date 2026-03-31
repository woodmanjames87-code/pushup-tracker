/*************************************************
 * NAVIGATION
 *************************************************/
// Keep track of the current index globally in ui.js
let currentPageIndex = 0;

window.showPage = function (pageId) {
    const indexMap = { tracker: 0, leaderboard: 1, settings: 2 };
    const newIndex = indexMap[pageId];
    if (newIndex === currentPageIndex) return; // Don't animate if already here

    const direction = newIndex > currentPageIndex ? "right" : "left";
    const pageIds = ["tracker", "leaderboard", "settings"];

    window.scrollTo(0, 0);
    window.location.hash = `${pageId}-page`;

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

    currentPageIndex = newIndex;

    // 2. Update Nav Bar Button Colors
    const navButtons = document.querySelectorAll(".nav-item");
    navButtons.forEach((btn, idx) => {
        btn.classList.toggle("active", idx === indexMap[pageId]);
    });

    // 3. Special logic: Refresh leaderboard
    if (pageId === "leaderboard" && window.fetchLeaderboard) {
        window.fetchLeaderboard();
    }

    // 4. Floating log button logic
    const isTrackerOrSocial = pageId === "tracker" || pageId === "leaderboard";

    if (floatingLogBtn) {
        floatingLogBtn.style.display = isTrackerOrSocial ? "block" : "none";
    }

    if (isTrackerOrSocial && window.updateDisplay) {
        window.updateDisplay();
    }

    // 5. Settings‑page setup
    if (pageId === "settings") {
        if (window.loadCurrentUsername) window.loadCurrentUsername();
        if (window.renderEditList) window.renderEditList();
        if (window.renderEnabledSelector) window.renderEnabledSelector();
    }

    // 6. Podium Cleanup: Hide immediately if we aren't on Leaderboard
    if (podiumOverlay && pageId !== "leaderboard") {
        podiumOverlay.classList.remove("active");
        // We use a timeout to hide it completely so the slide-down animation can finish
        setTimeout(() => {
            if (!podiumOverlay.classList.contains("active")) {
                podiumOverlay.hidden = true;
            }
        }, 1000); // Adjust to match your CSS transition time
    }
};

window.updateFloatingBtn = function () {
    const btnSpan = document.getElementById("log-btn-exercise-name");
    if (!btnSpan) return;

    const exId = window.currentExercise;
    const config = window.EXERCISE_LIB[exId];

    if (config) {
        btnSpan.innerText = config.name.toUpperCase();
    }
};

window.openLogModal = function () {
    // 1. Get current exercise config
    const exId = window.currentExercise;
    const config = window.EXERCISE_LIB[exId] || { name: "Exercise", unit: "reps" };

    // 2. Inject dynamic text
    if (window.modalTitle) window.modalTitle.innerText = `Log ${config.name}`;
    if (window.modalPrompt) window.modalPrompt.innerText = `How many ${config.unit} did you do?`;

    if (logModal) {
        logModal.style.display = "flex";
        if (window.modalInput) {
            window.modalInput.value = "";
            window.modalInput.focus();
        }
    }
};

window.closeLogModal = function () {
    if (logModal) {
        logModal.style.display = "none";
        if (modalInput) modalInput.value = "";
    }
};

/**
 * ui.js - DailyGrind 3D Wheel & Menu Logic
 */

// 1. Unified State Management
window.wheelState = {
    currentRotation: 0,
    isDragging: false,
    startX: 0,
    startRotation: 0,
    lastSelectedIndex: -1,
    panelWidth: 80,
};

// 2. Core Rendering Function
window.renderExerciseSwitcher = function () {
    const wheel = document.getElementById("wheel");
    const menu = document.getElementById("menu-items");
    const exercises = window.enabledExercises || Object.keys(window.EXERCISE_LIB);

    // 🛡️ Ensure at least 6 faces for 3D geometry
    let displayList = [...exercises];
    while (displayList.length < 6) {
        displayList = [...displayList, ...exercises];
    }

    const totalFaces = displayList.length;
    const angleStep = 360 / totalFaces;

    // Calculate radius so panels don't overlap or gap too much
    const radius = Math.round(window.wheelState.panelWidth / 2 / Math.tan(Math.PI / totalFaces));

    document.documentElement.style.setProperty("--wheel-radius", `${radius}px`);

    // Render Wheel
    wheel.innerHTML = displayList
        .map((id, i) => {
            const ex = window.EXERCISE_LIB[id];
            return `
            <div class="wheel-face" 
                 data-id="${id}" 
                 style="transform: rotateY(${i * angleStep}deg) translateZ(${radius}px); color: ${ex.color || "inherit"};">
                ${ex.name}
            </div>`;
        })
        .join("");

    // Render Menu (Keep this 1:1 with enabled exercises, no duplicates needed here)
    menu.innerHTML = exercises
        .map((id) => {
            const ex = window.EXERCISE_LIB[id];
            const iconHtml = ex.iconId
                ? `<svg class="menu-svg"><use href="${ex.iconId}"></use></svg>`
                : `<span class="menu-icon">🔥</span>`; // Fallback if iconId is missing

            return `
            <div class="exercise-menu-item" onclick="window.selectExercise('${id}')" data-id="${id}">
                <span class="menu-icon" style="color: ${ex.color}">${iconHtml}</span>
                <span class="menu-label">${ex.name}</span>
            </div>`;
        })
        .join("");

    // Re-init touch/mouse listeners
    initWheelInteractions();

    // Set initial position silently
    if (window.currentExercise) {
        window.selectExercise(window.currentExercise, true);
    }
};

// 3. Selection Logic (The Bridge)
window.selectExercise = function (id, silent = false) {
    const exercises = window.enabledExercises || Object.keys(window.EXERCISE_LIB);
    const index = exercises.indexOf(id);
    if (index === -1) return;

    const faces = document.querySelectorAll(".wheel-face");
    const totalFaces = faces.length;
    if (totalFaces === 0) return; // Safety check
    const angleStep = 360 / totalFaces;

    let targetAngle = index * -angleStep;
    window.wheelState.currentRotation = targetAngle;
    window.currentExercise = id;
    localStorage.setItem("lastExercise", id);

    const wheel = document.getElementById("wheel");
    // If silent (init), no animation. If not silent, smooth transition.
    wheel.style.transition = silent ? "none" : "transform 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.1)";
    wheel.style.transform = `rotateY(${targetAngle}deg)`;

    // Always update the active class on the faces/menu and the floating button text
    window.updateSwitcherUI();
    if (window.updateFloatingBtn) window.updateFloatingBtn();

    // 🛡️ THE FIX: Only trigger the rest of the app if we aren't in a "silent" sync
    if (!silent) {
        if (window.updateDisplay) window.updateDisplay();
        if (window.renderExerciseSettings) window.renderExerciseSettings();
        if (window.renderEditList) window.renderEditList();
        // REMOVED: window.renderExerciseSwitcher() -> This was causing the loop!
    }
};

// 4. UI Visual Updates
window.updateSwitcherUI = function () {
    const wheel = document.getElementById("wheel");
    const faces = wheel.querySelectorAll(".wheel-face");
    const menuItems = document.querySelectorAll(".exercise-menu-item");
    const n = faces.length;
    if (n === 0) return;

    const angleStep = 360 / n;
    let activeSteps = Math.round(window.wheelState.currentRotation / angleStep);
    let actualIndex = ((-activeSteps % n) + n) % n;

    faces.forEach((face, i) => {
        const isSelected = i === actualIndex;
        face.style.opacity = isSelected ? "1" : "0.4";
        face.style.filter = isSelected ? "blur(0px) brightness(1.2)" : "blur(1px) brightness(0.5)";
        face.classList.toggle("active", isSelected);
    });

    // Update Menu highlighting based on the selected ID
    const selectedId = faces[actualIndex]?.getAttribute("data-id");
    menuItems.forEach((item) => {
        item.classList.toggle("active", item.getAttribute("data-id") === selectedId);
    });
};

// 5. Interaction Logic (Input Handling)
const initWheelInteractions = () => {
    const hitbox = document.getElementById("exercise-wheel-hitbox");
    const wheel = document.getElementById("wheel");

    const startDrag = (x) => {
        window.wheelState.startX = x;
        window.wheelState.startRotation = window.wheelState.currentRotation;
        window.wheelState.isDragging = true;
        wheel.style.transition = "none";
    };

    const moveDrag = (x) => {
        if (!window.wheelState.isDragging) return;
        const deltaX = window.wheelState.startX - x;

        // 1. Update Rotation
        window.wheelState.currentRotation = window.wheelState.startRotation - deltaX * 0.5;
        wheel.style.transform = `rotateY(${window.wheelState.currentRotation}deg)`;

        // 2. Calculate Index during movement for Haptic Ticks
        const faces = document.querySelectorAll(".wheel-face");
        const n = faces.length;
        const angleStep = 360 / n;

        let activeSteps = Math.round(window.wheelState.currentRotation / angleStep);
        let currentIndex = ((-activeSteps % n) + n) % n;

        // 3. Trigger TICK if the index changed while dragging
        if (currentIndex !== window.wheelState.lastSelectedIndex) {
            window.wheelState.lastSelectedIndex = currentIndex;
            window.triggerHaptic("tick");
        }

        // 4. Update visuals (opacity/blur) in real-time
        window.updateSwitcherUI();
    };

    const endDrag = () => {
        if (!window.wheelState.isDragging) return;
        window.wheelState.isDragging = false;

        const faces = document.querySelectorAll(".wheel-face");
        const n = faces.length;
        const angleStep = 360 / n;

        wheel.style.transition = "transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.2)";

        // Snap to the closest step (positive or negative)
        window.wheelState.currentRotation = Math.round(window.wheelState.currentRotation / angleStep) * angleStep;
        wheel.style.transform = `rotateY(${window.wheelState.currentRotation}deg)`;

        // Calculate final index for the exercise selection
        let activeSteps = Math.round(window.wheelState.currentRotation / angleStep);
        let actualIndex = ((-activeSteps % n) + n) % n;

        const selectedId = faces[actualIndex].getAttribute("data-id");

        if (selectedId !== window.currentExercise) {
            window.currentExercise = selectedId;
            localStorage.setItem("lastExercise", selectedId);

            // Use your new success haptic
            if (window.triggerHaptic) window.triggerHaptic("success");

            if (window.updateDisplay) window.updateDisplay();
            if (window.renderExerciseSettings) window.renderExerciseSettings();
            if (window.renderEditList) window.renderEditList();
            if (window.updateFloatingBtn) window.updateFloatingBtn();

            window.updateSwitcherUI();
        }
    };

    // Listeners
    hitbox.addEventListener("touchstart", (e) => startDrag(e.touches[0].clientX), { passive: true });
    window.addEventListener("touchmove", (e) => moveDrag(e.touches[0].clientX), { passive: true });
    window.addEventListener("touchend", endDrag);
    hitbox.addEventListener("mousedown", (e) => startDrag(e.clientX));
    window.addEventListener("mousemove", (e) => moveDrag(e.clientX));
    window.addEventListener("mouseup", endDrag);
};

// 6. Global Menu Toggle
document.addEventListener("click", (e) => {
    const menu = document.getElementById("menu-items");
    const trigger = document.querySelector(".menu-trigger");

    // 1. If clicking the trigger (the hamburger or icon), toggle the menu
    if (trigger && trigger.contains(e.target)) {
        menu.classList.toggle("show");
    }
    // 2. If clicking an exercise item INSIDE the menu, select it and CLOSE
    else if (menu && menu.contains(e.target) && e.target.closest(".exercise-menu-item")) {
        // The onclick="window.selectExercise()" handles the logic,
        // we just need to hide the menu here.
        menu.classList.remove("show");
    }
    // 3. If clicking anywhere else outside the menu, close it
    else if (menu && !menu.contains(e.target)) {
        menu.classList.remove("show");
    }
});
/*************************************************
 * UI RENDERING
 *************************************************/
window.updateDisplay = function () {
    const s = window.computeStats ? window.computeStats() : null;
    if (!s) {
        console.warn("No stats object returned.");
        return;
    }

    // Optimized Helper: No more document.getElementById!
    const updateText = (id, val) => {
        const el = window.uiStats[id];
        if (el) el.innerText = val;
    };

    // --- 1. DAILY STATS & PROGRESS ---
    updateText("today-val", s.todayTotal);
    updateText("yest-val", s.yesterdayTotal);
    updateText("goal-text", `Goal: ${s.dailyGoal}`);
    updateText("streak-val", s.streak);
    updateText("rest-val", s.rest14);

    const pct = s.todayTotal / s.dailyGoal;
    if (window.greenBar) greenBar.style.width = Math.min(pct, 1) * 100 + "%";
    if (window.blueBar) blueBar.style.width = pct > 1 ? Math.min(pct - 1, 1) * 100 + "%" : "0%";

    if (window.restStreakTag) {
        if (s.restStreak > 0) {
            restStreakTag.style.display = "inline-flex";
            updateText("rest-streak-val", s.restStreak);
        } else {
            restStreakTag.style.display = "none";
        }
    }

    // --- 2. 30-DAY PERFORMANCE & TRENDS ---
    updateText("total-30-val", s.total30);
    updateText("active-30-val", `${s.active30}/30`);
    updateText("avg-30", `Avg: ${s.avg30}/day`);
    updateText("thirty-goal-val", s.thirtyGoal);
    updateText("thirty-improv-val", s.thirtyImprov);

    if (window.trendFill) trendFill.style.width = Math.min((s.total30 / s.thirtyImprov) * 100, 100) + "%";
    if (window.trendLabel) {
        trendLabel.innerText = s.trend.label;
        trendLabel.style.color = s.trend.color;
    }

    // --- 3. WEEKLY CHART ---
    if (window.barChart && window.barLabels) {
        // 1. START THE SINK: Set existing bars to 0
        const oldBars = barChart.querySelectorAll(".bar-unit");
        oldBars.forEach((bar) => {
            bar.style.setProperty("--bar-h", "0%");
            bar.style.opacity = "0";
        });

        // 2. WAIT FOR SINK: Then replace and grow
        setTimeout(() => {
            barChart.innerHTML = "";
            barLabels.innerHTML = "";

            const days = ["Su", "M", "T", "W", "Th", "F", "Sa"];
            const maxVal = Math.max(...s.weeklyData, 1);
            const midVal = Math.round(maxVal / 2);

            updateText("axis-max-l", maxVal);
            updateText("axis-max-r", maxVal);
            updateText("axis-mid-l", midVal);
            updateText("axis-mid-r", midVal);

            s.weeklyData.forEach((v, i) => {
                const barId = `week-bar-${i}`;
                const hPercentage = (v / maxVal) * 100;

                // Inject at 0% first
                barChart.insertAdjacentHTML(
                    "beforeend",
                    `<div id="${barId}" class="bar-unit" style="--bar-h: 0%; opacity: 0;"></div>`,
                );

                // Trigger the "Grow" animation
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        const el = document.getElementById(barId);
                        if (el) {
                            el.style.setProperty("--bar-h", `${hPercentage}%`);
                            el.style.opacity = v > 0 ? "1" : "0.2";
                            el.removeAttribute("id");
                        }
                    });
                });

                // Handle labels
                const d = new Date();
                d.setDate(d.getDate() - (6 - i));
                barLabels.insertAdjacentHTML("beforeend", `<span class="day-label">${days[d.getDay()]}</span>`);
            });

            updateText("weekly-title", `Total: ${s.weeklyTotal}`);
        }, 300); // This 300ms matches your CSS transition time
    }

    // --- 4. LEGACY INSIGHTS (ALL-TIME) ---
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
        if (window.milestoneFill) {
            const milestonePct = (s.allTimeTotal / s.nextMilestone) * 100;
            milestoneFill.style.width = Math.min(milestonePct, 100) + "%";
        }

        const total = s.allTimeTotal || 1;
        if (window.pillElite) pillElite.style.width = (s.eliteVol / total) * 100 + "%";
        if (window.pillSolid) pillSolid.style.width = (s.solidVol / total) * 100 + "%";
        if (window.pillLight) pillLight.style.width = (s.lightVol / total) * 100 + "%";

        if (window.monthlyChart) {
            const oldMonthly = monthlyChart.querySelectorAll(".bar-unit");
            oldMonthly.forEach((bar) => {
                bar.style.setProperty("--bar-h", "0%");
                bar.style.opacity = "0";
            });

            setTimeout(() => {
                monthlyChart.innerHTML = "";
                const monthEntries = Object.entries(s.monthlyData);
                const maxMonth = Math.max(...monthEntries.map(([_, v]) => v), 1);

                monthEntries.forEach(([label, val], i) => {
                    const barId = `month-bar-${i}`;
                    const hPct = (val / maxMonth) * 100;

                    // 1. Inject with 0% height
                    monthlyChart.insertAdjacentHTML(
                        "beforeend",
                        `
                        <div class="monthly-bar-container">
                            <div class="monthly-bar-wrapper">
                                <span class="chart-value-label">${val > 0 ? val : ""}</span>
                                <div id="${barId}" class="bar-unit legacy" style="--bar-h: 0%; opacity: 0;"></div>
                            </div>
                            <span class="month-name-label">${label}</span>
                        </div>
                        `,
                    );

                    // 2. Trigger the "Grow"
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            const el = document.getElementById(barId);
                            if (el) {
                                el.style.setProperty("--bar-h", `${hPct}%`);
                                el.style.opacity = val > 0 ? "1" : "0.2";
                                el.removeAttribute("id");
                            }
                        });
                    });
                });
            }, 300);
        }
    } else {
        // If there is no all-time data, we must clear the "sticky" elements
        updateText("legacy-projected", "NO DATA YET");
        updateText("legacy-since", "START TRACKING TODAY");
        updateText("stat-all-time", "0");
        updateText("stat-pb", "0");
        updateText("stat-ytd", "0");

        if (window.monthlyChart) monthlyChart.innerHTML = "";
        if (window.milestoneFill) milestoneFill.style.width = "0%";

        if (window.pillElite) pillElite.style.width = "0%";
        if (window.pillSolid) pillSolid.style.width = "0%";
        if (window.pillLight) pillLight.style.width = "0%";
    }
};

// Leaderboard Podium Render
window.drawPodium = function (winners, filterType) {
    // 1. If no winners, slide down and hide
    if (!winners || winners.length === 0) {
        podiumOverlay.classList.remove("active");
        setTimeout(() => {
            if (!podiumOverlay.classList.contains("active")) podiumOverlay.hidden = true;
        }, 1000); // Matches CSS transition time
        return;
    }

    // 2. Prepare for entrance
    podiumOverlay.hidden = false;
    // Tiny delay ensures the browser sees 'hidden=false' before adding 'active'
    setTimeout(() => podiumOverlay.classList.add("active"), 10);

    // 3. Update Title
    if (podiumTitle) {
        const labels = {
            "stats.week": "LAST WEEK'S TOP 3",
            "stats.month": "LAST MONTH'S TOP 3",
            "stats.year": "LAST YEAR'S TOP 3",
        };
        podiumTitle.textContent = labels[filterType] || "PREVIOUS TOP 3";
    }

    // 4. Update Slots
    window.podiumSlots.forEach((slot, index) => {
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
};

window.renderEnabledSelector = function () {
    const container = document.getElementById("exercise-checkbox-list");
    if (!container) return;

    container.innerHTML = ""; // Clear existing

    Object.keys(window.EXERCISE_LIB).forEach((exId) => {
        const config = window.EXERCISE_LIB[exId];
        const isEnabled = window.enabledExercises.includes(exId);

        const row = document.createElement("div");
        row.className = "setting-row checkbox-row";
        row.innerHTML = `
            <label for="chk-${exId}">${config.name}</label>
            <label class="switch">
                <input type="checkbox" id="chk-${exId}" ${isEnabled ? "checked" : ""} data-ex="${exId}" />
                <span class="slider round"></span>
            </label>
        `;

        // Listen for toggles
        const input = row.querySelector("input");
        input.addEventListener("change", (e) => {
            const id = e.target.getAttribute("data-ex");

            if (e.target.checked) {
                if (!window.enabledExercises.includes(id)) {
                    window.enabledExercises.push(id);
                }
            } else {
                // Prevent disabling everything - must have at least one
                if (window.enabledExercises.length <= 1) {
                    e.target.checked = true;
                    window.showToast("At least one exercise must be enabled!");
                    if (window.triggerHaptic) window.triggerHaptic("warning");
                    return;
                }
                window.enabledExercises = window.enabledExercises.filter((item) => item !== id);
            }

            // Save to localStorage
            localStorage.setItem("enabled_exercises", JSON.stringify(window.enabledExercises));

            if (window.triggerHaptic) window.triggerHaptic("success");

            // 🚀 CRITICAL: We must rebuild the carousel and refresh the UI
            // because the indices of the 3D wheel have now changed.
            if (window.renderExerciseSwitcher) window.renderExerciseSwitcher();
            if (window.updateDisplay) window.updateDisplay();
        });

        container.appendChild(row);
    });
};

window.renderExerciseSettings = function () {
    const data = window.loadData();
    const exId = window.currentExercise;

    // 1. Get Exercise-Specific Config from your Library
    const config = window.EXERCISE_LIB[exId] || { name: exId, minGoal: 1, unit: "reps" };
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
    if (goalModeToggle) goalModeToggle.checked = isAuto;

    // Update the manual input and its placeholder
    if (manualGoalInput) {
        manualGoalInput.value = exSettings.manualGoal;
        manualGoalInput.placeholder = defaultMin;
    }

    // Dynamic Description Text
    const statusText = isAuto
        ? `Calculated Goal: Max(Avg,Median) of 14 active days (Min ${defaultMin} ${config.unit}).`
        : `Manual Goal Setpoint Active for ${config.name}.`;

    if (manualGoalContainer) manualGoalContainer.style.display = isAuto ? "none" : "flex";

    const goalDescriptions = document.querySelectorAll(".goal-description");
    goalDescriptions.forEach((el) => (el.innerHTML = statusText));

    // 5. Activity Thresholds (Global logic, local value)
    const isRecommended = data.settings?.thresholdMode !== "custom";
    if (thresholdModeToggle) thresholdModeToggle.checked = isRecommended;

    const savedOnTrack = isRecommended ? 4 : exSettings.onTrackDays || 4;
    if (onTrackInput) onTrackInput.value = savedOnTrack;

    if (customThresholdContainer) {
        customThresholdContainer.style.display = isRecommended ? "none" : "flex";
    }

    // Update live hints
    if (onTrackHint) onTrackHint.innerText = savedOnTrack;
    if (improveDisplay) improveDisplay.innerText = Number(savedOnTrack) + 1;
};

window.adjustOnTrack = function (change) {
    if (!onTrackInput) return;

    let currentVal = parseInt(onTrackInput.value) || 4;
    let newVal = currentVal + change;

    if (newVal >= 1 && newVal <= 6) {
        onTrackInput.value = newVal;
        if (improveDisplay) improveDisplay.innerText = newVal + 1;
        if (onTrackHint) onTrackHint.innerText = newVal;
        if (window.triggerHaptic) window.triggerHaptic("success");

        // --- NEW: Exercise-Aware Auto-Save ---
        const data = window.loadData();
        const exId = window.currentExercise;

        if (!data.settings) data.settings = {};
        if (!data.settings.goals) data.settings.goals = {};
        if (!data.settings.goals[exId]) data.settings.goals[exId] = {};

        data.settings.goals[exId].onTrackDays = newVal;

        window.saveData(data); // This handles Local + Cloud sync
    } else {
        if (window.triggerHaptic) window.triggerHaptic("warning");
        const stepper = onTrackInput.closest(".number-stepper");
        if (stepper) {
            stepper.classList.add("limit-shake");
            setTimeout(() => stepper.classList.remove("limit-shake"), 300);
        }
    }
};

window.renderEditList = function () {
    const dateKey = window.selectedEditDate;
    const exercise = window.currentExercise;
    const config = window.EXERCISE_LIB[exercise] || { unit: "reps" };

    if (!editSetsList) return;
    updateDateLabel(dateKey);

    const data = window.loadData();
    // Instead of todayKey, we use the date from the picker
    const sets = data[dateKey]?.[exercise] || [];

    editSetsList.innerHTML = "";

    if (sets.length === 0) {
        editSetsList.innerHTML = '<p class="h3" style="text-align:center;">No sets for this date.</p>';
        return;
    }

    sets.forEach((reps, i) => {
        editSetsList.insertAdjacentHTML(
            "beforeend",
            `
            <div class="edit-item">
                <span>Set ${i + 1}: <strong>${reps}</strong> ${config.unit}</span>
                <button class="btn-delete" onclick="window.deleteSet(${i})">Delete</button>
            </div>
        `,
        );
    });
};

window.deleteSet = (i) => {
    const data = window.loadData();
    const dateKey = window.selectedEditDate;
    const exercise = window.currentExercise;

    if (data[dateKey] && data[dateKey][exercise]) {
        // Remove the set from the array
        data[dateKey][exercise].splice(i, 1);

        // Save back to LocalStorage
        window.saveData(data);

        // Refresh the UI immediately
        window.renderEditList(); // Redraw the list in Settings
    }
};

window.loadCurrentUsername = function () {
    if (window.nameInput) {
        // Use the 'Getter' to fill the 'Setter'
        window.nameInput.value = window.getDisplayUsername();
    }
};

window.getDisplayUsername = function (extraData = {}) {
    const localData = window.loadData();
    // 1. Explicitly passed data (like from a prompt)
    if (extraData.username) return extraData.username;
    // 2. The "Truth": Saved settings in LocalStorage
    if (localData.settings?.username) return localData.settings.username;
    // 3. Fallback to Auth Profile
    if (window.auth?.currentUser?.displayName) return window.auth.currentUser.displayName;
    // 4. Fallback to current UI value ONLY if it isn't the default
    if (window.nameInput?.value && window.nameInput.value !== "Lazybones") {
        return window.nameInput.value;
    }
    // 5. Hard Default
    return "Lazybones";
};

window.updateDateLabel = function (dateKey) {
    if (!displayDateLabel) return;

    // Use whatever name you gave it in store.js
    const todayKey = window.getTodayId ? window.getTodayId() : window.getDateKey();

    if (dateKey === todayKey) {
        displayDateLabel.innerText = "Today";
    } else {
        // T00:00:00 prevents timezone shifts
        const dateObj = new Date(dateKey + "T00:00:00");
        displayDateLabel.innerText = dateObj.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    }
};

window.getExerciseIcon = function (exerciseId) {
    const ex = window.EXERCISE_LIB[exerciseId];
    if (!ex) return "";

    // Returns a standard SVG structure that uses the symbol from HTML
    return `
        <svg class="icon-svg" aria-hidden="true">
            <use href="${ex.iconId}"></use>
        </svg>
    `;
};
/***********************
 * THEME MANAGEMENT
 ***********************/
window.setTheme = function (theme) {
    const htmlElement = document.documentElement;
    let appearance = theme;

    if (theme === "auto") {
        appearance = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }

    // Apply the theme to the data-theme attribute for CSS to pick up
    htmlElement.setAttribute("data-theme", appearance);
    localStorage.setItem("user-theme", theme);

    // Update the button styles in the settings page
    const themeButtons = document.querySelectorAll("#theme-selector .seg-btn");
    themeButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.getAttribute("data-theme") === theme);
    });
};

/*************************
 * PWA INSTALL BANNER
 *************************/
window.showUnifiedInstallBanner = function (platform = "auto") {
    if (!installBanner) return;

    // 1. Check if user closed it today (Logic/Storage check)
    if (localStorage.getItem("installBannerClosed") === new Date().toLocaleDateString()) return;

    // 2. Platform Detection
    const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const device = platform === "auto" ? (isIOS() ? "ios" : "android") : platform;

    // 3. Update the Visuals
    if (device === "ios") {
        if (installText)
            installText.innerHTML = 'Tap the <strong>Share</strong> icon then <strong>"Add to Home Screen"</strong>';
        if (installNowBtn) installNowBtn.style.display = "none";
    } else {
        if (installText) installText.innerText = "Install App for easy access!";
        if (installNowBtn) {
            installNowBtn.innerText = "Install App";
            installNowBtn.style.display = "inline-block";
        }
    }

    installBanner.classList.remove("hidden");
};

// Show Toast Utility
window.showToast = function (message, duration = 3000) {
    console.log("Toast triggered with message:", message); // Debug line
    const toast = document.createElement("div");

    toast.className = "toast";
    toast.textContent = message;

    toastContainer.appendChild(toast);

    // Remove the toast after the duration
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.5s ease";
        setTimeout(() => toast.remove(), 500);
    }, duration);

    if (!toastContainer) {
        console.error("Toast container not found in the DOM!");
        return;
    }
};

//-------- DEBOUNCE UTILITY (for inputs like on-track days) --------
let saveTimeout;
window.debounceSave = function (callback, delay = 500) {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(callback, delay);
};

//------- HAPTIC FEEDBACK ----------
window.triggerHaptic = function (type = "success") {
    // 1. Console Log for PC/Mac Debugging
    // const colors = { tick: "#888", success: "#4CAF50", warning: "#FF5252", heavy: "#FFD700" };
    // const styles = `color: ${colors[type] || "white"}; font-weight: bold; border-left: 4px solid ${colors[type] || "white"}; padding-left: 10px;`;
    // console.log(`%c[Haptic: ${type.toUpperCase()}]`, styles);

    // 2. Check for support
    if (!("vibrate" in navigator)) return;

    // 3. Prevent the "Intervention" error
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
};

window.initDebugMenu = function () {
    const debugMenu = document.getElementById("debug-menu");
    const debugUid = document.getElementById("debug-uid");
    const user = window.auth?.currentUser;

        debugMenu.classList.toggle("hidden");
        debugUid.innerText = user?.uid || "Not Authenticated";
};
