/*************************************************
 * NAVIGATION
 *************************************************/
// Keep track of the current index globally in ui.js
let currentPageIndex = 0;

function showPage(pageId) {
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
        if (window.updateGoalUI) window.updateGoalUI();
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
}

function openLogModal() {
    if (logModal) {
        logModal.style.display = "flex";
        if (modalInput) {
            modalInput.value = "";
            modalInput.focus();
        }
    }
}

function closeLogModal() {
    if (logModal) {
        logModal.style.display = "none";
        if (modalInput) modalInput.value = "";
    }
}
/*************************************************
 * UI RENDERING
 *************************************************/
function updateDisplay() {
    const s = window.computeStats ? window.computeStats() : null;
    if (!s) return;

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
            const hPercentage = (v / maxVal) * 100;
            barChart.insertAdjacentHTML(
                "beforeend",
                `<div class="bar-unit" style="height:${hPercentage}%; opacity:${v > 0 ? 1 : 0.2}"></div>`,
            );
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            barLabels.insertAdjacentHTML("beforeend", `<span class="day-label">${days[d.getDay()]}</span>`);
        });
        updateText("weekly-title", `Total: ${s.weeklyTotal}`);
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
            monthlyChart.innerHTML = "";
            const monthEntries = Object.entries(s.monthlyData);
            const maxMonth = Math.max(...monthEntries.map(([_, v]) => v), 1);

            monthEntries.forEach(([label, val]) => {
                const hPct = (val / maxMonth) * 100;
                monthlyChart.insertAdjacentHTML(
                    "beforeend",
                    `
                    <div class="monthly-bar-container">
                        <div style="height: 60px; width: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center;">
                            <span class="label-tiny chart-value" style="font-size: 0.6rem; margin-bottom: 2px; line-height: 1;">
                                ${val > 0 ? val : ""}
                            </span>
                            <div class="bar-unit legacy" style="height:${hPct}%; opacity:${val > 0 ? 1 : 0.2};"></div>
                        </div>
                        <span class="month-label" style="font-size: 0.6rem; margin-top: 4px;">
                            ${label.toUpperCase()}
                        </span>
                    </div>
                `,
                );
            });
        }
    }
}

// Function to handle showing/hiding the manual input
function updateGoalUI() {
    const data = JSON.parse(localStorage.getItem(window.STORAGE_KEY) || "{}");

    // --- Goal Mode Logic...
    const isAuto = data.settings?.goalMode !== "manual";
    if (goalModeToggle) goalModeToggle.checked = isAuto;
    if (manualGoalInput) manualGoalInput.value = data.settings?.manualGoal || 60;

    const statusText = isAuto ? `Goal: Max(Avg,Median) of 14 active days (Min 60).` : `Manual Goal Setpoint Active.`;
    if (manualGoalContainer) manualGoalContainer.style.display = isAuto ? "none" : "flex";
    goalDescriptions.forEach((el) => {
        el.innerHTML = statusText;
    });

    // --- Activity Threshold Mode Logic ---
    const isRecommended = data.settings?.thresholdMode !== "custom";
    if (thresholdModeToggle) thresholdModeToggle.checked = isRecommended;

    // Logic: If Recommended, force the display to 4. If Custom, use saved value.
    const savedOnTrack = isRecommended ? 4 : data.settings?.goals?.onTrackDays || 4;

    if (onTrackInput) {
        onTrackInput.value = savedOnTrack;
    }

    // Updated user-facing text
    const thresholdText = isRecommended
        ? `Recommended: 4 days/week for a balanced 30-day trend.`
        : `Custom Target Active. Use the stepper to adjust.`;

    // Toggle the stepper visibility
    if (customThresholdContainer) {
        customThresholdContainer.style.display = isRecommended ? "none" : "flex";
    }

    thresholdDescriptions.forEach((el) => {
        el.innerHTML = thresholdText;
    });

    // Update the live hints (e.g., "On Track at 4, Improving at 5")
    if (onTrackHint) onTrackHint.innerText = savedOnTrack;
    if (improveDisplay) improveDisplay.innerText = Number(savedOnTrack) + 1;
}

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

// Save On Track Goal Settings
window.saveGoalSettings = function (btn) {
    const input = window.onTrackInput;
    if (!input) return;

    const newOnTrack = parseInt(input.value) || 0;

    const data = window.loadData();
    if (!data.settings) data.settings = {};
    if (!data.settings.goals) data.settings.goals = {};

    data.settings.goals.onTrackDays = newOnTrack;

    localStorage.setItem(window.STORAGE_KEY, JSON.stringify(data));

    // 🛡️ Success Feedback
    if (window.triggerHaptic) window.triggerHaptic("success");

    // Sync to cloud since goals changed
    if (window.auth.currentUser) {
        window.syncLocalToCloud(window.auth.currentUser.uid);
    }

    // Visual feedback on the button itself
    if (btn) {
        const originalText = btn.innerText;
        btn.innerText = "Saved! ✓";
        // Using inline style to override the class temporarily
        btn.style.backgroundColor = "#34c759";
        btn.style.borderColor = "#34c759";
        btn.disabled = true; // Prevent double-clicks during sync
        btn.style.opacity = "1";

        setTimeout(() => {
            btn.innerText = originalText;
            btn.style.backgroundColor = "";
            btn.style.borderColor = "";
            btn.disabled = false;
        }, 2000);
    }

    if (window.updateGoalUI) window.updateGoalUI();
};

window.adjustOnTrack = function (change) {
    if (!onTrackInput) return;

    let currentVal = parseInt(onTrackInput.value) || 4;
    let newVal = currentVal + change;

    // 1. Check Boundaries (1 to 6 days)
    if (newVal >= 1 && newVal <= 6) {
        // SUCCESS: Valid change
        onTrackInput.value = newVal;
        if (improveDisplay) {
            improveDisplay.innerText = newVal + 1;
        }

        // Trigger the single short click
        if (window.triggerHaptic) window.triggerHaptic("success");
    } else {
        // WARNING: User hit the limit (0 or 7)
        // Trigger the double pulse to signify "limit reached"
        if (window.triggerHaptic) window.triggerHaptic("warning");

        // Visual feedback: Shake the stepper briefly (optional)
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
                <span>Set ${i + 1}: <strong>${reps}</strong></span>
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
        window.updateDisplay(); // Redraw the charts on the Home page
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
/***********************
 * THEME MANAGEMENT
 ***********************/
function setTheme(theme) {
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
}

/*************************
 * PWA INSTALL BANNER
 *************************/
function showUnifiedInstallBanner(platform = "auto") {
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
}

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
function triggerHaptic(type = "success") {
    if (!("vibrate" in navigator)) return;

    if (type === "success") {
        navigator.vibrate(50); // One short click
    } else if (type === "warning") {
        navigator.vibrate([40, 30, 40]); // Two quick pulses
    }
}

// EXPOSE TO WINDOW
window.showPage = showPage;
window.updateDisplay = updateDisplay;
window.openLogModal = openLogModal;
window.closeLogModal = closeLogModal;
window.updateGoalUI = updateGoalUI;
window.setTheme = setTheme;
window.showUnifiedInstallBanner = showUnifiedInstallBanner;
window.triggerHaptic = triggerHaptic;
