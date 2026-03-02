/*************************************************
 * NAVIGATION
 *************************************************/
function showPage(pageId) {
    window.location.hash = `${pageId}-page`;

    // 1. Hide all pages (using a loop is cleaner/safer)
    const pageIds = ["tracker", "settings", "leaderboard"];
    pageIds.forEach((id) => {
        const el = document.getElementById(`${id}-page`);
        if (el) el.style.display = id === pageId ? "flex" : "none";
    });

    // 2. Update Nav Bar Button Colors
    const navButtons = document.querySelectorAll(".nav-item");
    const indexMap = { tracker: 0, leaderboard: 1, settings: 2 };

    navButtons.forEach((btn, idx) => {
        // Only add 'active' if the index matches our map
        btn.classList.toggle("active", idx === indexMap[pageId]);
    });

    // 3. Special logic: Refresh leaderboard
    if (pageId === "leaderboard" && window.fetchLeaderboard) {
        window.fetchLeaderboard();
    }

    // 4. Floating log button logic
    const floatingBtn = document.getElementById("floating-log-btn");
    const isTrackerOrSocial = pageId === "tracker" || pageId === "leaderboard";

    if (floatingBtn) {
        floatingBtn.style.display = isTrackerOrSocial ? "block" : "none";
    }

    // Refresh stats if on main views
    if (isTrackerOrSocial && window.updateDisplay) {
        window.updateDisplay();
    }

    // 5. Settings‑page setup
    if (pageId === "settings") {
        // Use '&&' to check if the function exists before calling
        if (window.loadCurrentUsername) window.loadCurrentUsername();
        if (window.renderEditList) window.renderEditList();
        if (window.updateGoalUI) window.updateGoalUI();
    }
}

function openLogModal() {
    const logModal = document.getElementById("log-modal");
    const modalInput = document.getElementById("modal-input");
    if (logModal) {
        logModal.style.display = "flex";
        if (modalInput) {
            modalInput.value = "";
            modalInput.focus();
        }
    }
}

function closeLogModal() {
    const logModal = document.getElementById("log-modal");
    const modalInput = document.getElementById("modal-input");
    if (logModal) {
        logModal.style.display = "none";
        if (modalInput) modalInput.value = "";
    }
}
/*************************************************
 * UI RENDERING
 *************************************************/
function updateDisplay() {
    // 1. Get the data from the 'Brain'
    // We check if the function exists first to prevent startup errors
    const s = window.computeStats ? window.computeStats() : null;
    if (!s) return;

    // --- 1. DAILY STATS & PROGRESS ---
    const updateText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    };

    updateText("today-val", s.todayTotal);
    updateText("yest-val", s.yesterdayTotal);
    updateText("goal-text", `Goal: ${s.dailyGoal}`);
    updateText("streak-val", s.streak);
    updateText("rest-val", s.rest14);

    // Progress Bars
    const pct = s.todayTotal / s.dailyGoal;
    const greenBar = document.getElementById("progress-bar-green");
    const blueBar = document.getElementById("progress-bar-blue");
    if (greenBar) greenBar.style.width = Math.min(pct, 1) * 100 + "%";
    if (blueBar) blueBar.style.width = pct > 1 ? Math.min(pct - 1, 1) * 100 + "%" : "0%";

    // Rest Streak Tag
    const restStreakTag = document.getElementById("rest-streak-tag");
    if (restStreakTag) {
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

    const trendFill = document.getElementById("trend-fill");
    const trendLabel = document.getElementById("trend-label");
    if (trendFill) trendFill.style.width = Math.min((s.total30 / s.thirtyImprov) * 100, 100) + "%";
    if (trendLabel) {
        trendLabel.innerText = s.trend.label;
        trendLabel.style.color = s.trend.color;
    }

    // --- 3. WEEKLY CHART ---
    const chart = document.getElementById("bar-chart");
    const labelContainer = document.getElementById("bar-labels");

    if (chart && labelContainer) {
        chart.innerHTML = "";
        labelContainer.innerHTML = "";
        const days = ["Su", "M", "T", "W", "Th", "F", "Sa"];
        const maxVal = Math.max(...s.weeklyData, 1);
        const midVal = Math.round(maxVal / 2);

        updateText("axis-max-l", maxVal);
        updateText("axis-max-r", maxVal);
        updateText("axis-mid-l", midVal);
        updateText("axis-mid-r", midVal);

        s.weeklyData.forEach((v, i) => {
            const hPercentage = (v / maxVal) * 100;
            chart.insertAdjacentHTML(
                "beforeend",
                `<div class="bar-unit" style="height:${hPercentage}%; opacity:${v > 0 ? 1 : 0.2}"></div>`,
            );
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            labelContainer.insertAdjacentHTML("beforeend", `<span class="day-label">${days[d.getDay()]}</span>`);
        });
        updateText("weekly-title", `Total: ${s.weeklyTotal}`);
    }

    // --- 4. LEGACY INSIGHTS (ALL-TIME) ---
    const legacySection = document.getElementById("legacy-section"); // Assuming you have a wrapper
    if (s.allTimeTotal > 0) {
        updateText("legacy-projected", `${s.currentYearStr} PROJECTION: ${s.projectedYearly.toLocaleString()}`);
        updateText("legacy-since", `STARTED ${s.firstDateStr}`);
        updateText("legacy-active-days", `ACTIVE: ${s.activeDays} / ${s.totalDaysElapsed} days`);
        updateText("stat-all-time", s.allTimeTotal.toLocaleString());
        updateText("stat-pb", s.pb.toLocaleString());
        updateText("stat-ytd", s.ytdTotal.toLocaleString());
        updateText("stat-century", s.centuryDays);
        updateText("stat-avg", `${s.lifetimeAvg}/day`);

        // Milestone Progress
        updateText("label-next-milestone", `NEXT MILESTONE: ${s.nextMilestone.toLocaleString()}`);
        const milestoneFill = document.getElementById("milestone-fill");
        if (milestoneFill) {
            const milestonePct = (s.allTimeTotal / s.nextMilestone) * 100;
            milestoneFill.style.width = Math.min(milestonePct, 100) + "%";
        }

        // Intensity Pill
        const total = s.allTimeTotal || 1;
        const pillElite = document.getElementById("pill-elite");
        const pillSolid = document.getElementById("pill-solid");
        const pillLight = document.getElementById("pill-light");
        if (pillElite) pillElite.style.width = (s.eliteVol / total) * 100 + "%";
        if (pillSolid) pillSolid.style.width = (s.solidVol / total) * 100 + "%";
        if (pillLight) pillLight.style.width = (s.lightVol / total) * 100 + "%";

        // Monthly Chart
        const monthlyChart = document.getElementById("monthly-chart");
        if (monthlyChart) {
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
    const data = JSON.parse(localStorage.getItem("workout-data") || "{}");
    const toggle = document.getElementById("goal-mode-toggle");
    const manualContainer = document.getElementById("manual-goal-container");
    const manualInput = document.getElementById("manual-goal-input");
    const descriptions = document.querySelectorAll(".goal-description");

    const isAuto = data.settings?.goalMode !== "manual";
    toggle.checked = isAuto;
    manualInput.value = data.settings?.manualGoal || 60;

    // 1. Determine the content based on the state
    const statusText = isAuto ? `Goal: Max(Avg,Median) of 14 active days (Min 60).` : `Manual Goal Setpoint Active.`;

    // 2. Toggle Visibility & Update all descriptions
    if (isAuto) {
        manualContainer.style.display = "none";
    } else {
        manualContainer.style.display = "flex";
    }

    // Loop through every instance found and update them together
    descriptions.forEach((el) => {
        el.innerHTML = statusText;
    });
}

function renderEditList() {
    const dateKey = window.selectedEditDate;
    const exercise = window.currentExercise;
    const listEl = document.getElementById("edit-sets-list");

    if (!listEl) return;
    updateDateLabel(dateKey);

    const data = window.loadData();
    // Instead of todayKey, we use the date from the picker
    const sets = data[dateKey]?.[exercise] || [];

    listEl.innerHTML = "";

    if (sets.length === 0) {
        listEl.innerHTML = '<p class="h3" style="text-align:center;">No sets for this date.</p>';
        return;
    }

    sets.forEach((reps, i) => {
        listEl.insertAdjacentHTML(
            "beforeend",
            `
            <div class="edit-item">
                <span>Set ${i + 1}: <strong>${reps}</strong></span>
                <button class="btn-delete" onclick="window.deleteSet(${i})">Delete</button>
            </div>
        `,
        );
    });
}

window.deleteSet = (i) => {
    const data = window.loadData();
    const dateKey = window.selectedEditDate();
    const exercise = window.currentExercise();

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

function loadCurrentUsername() {
    const data = window.loadData();
    const nameInput = document.getElementById("username-input");
    if (!nameInput) return;

    // Use an interval to wait for Firebase Auth to "wake up"
    const checkAuth = setInterval(() => {
        const user = window.auth?.currentUser;
        const customName = data.settings?.username;
        const firebaseName = user?.displayName;

        if (customName || firebaseName) {
            nameInput.value = customName || firebaseName;
            clearInterval(checkAuth);
        }
    }, 100);

    // Stop looking after 2 seconds
    setTimeout(() => clearInterval(checkAuth), 2000);
}

function updateDateLabel(dateKey) {
    const label = document.getElementById("display-date-label");
    if (!label) return;

    // Use whatever name you gave it in store.js
    const todayKey = window.getTodayId ? window.getTodayId() : window.getDateKey();

    if (dateKey === todayKey) {
        label.innerText = "Today";
    } else {
        // T00:00:00 prevents timezone shifts
        const dateObj = new Date(dateKey + "T00:00:00");
        label.innerText = dateObj.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    }
}
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
    const banner = document.getElementById("install-banner");
    const textEl = document.getElementById("install-text");
    const installBtn = document.getElementById("btn-install-now");
    if (!banner) return;

    // 1. Check if user closed it today (Logic/Storage check)
    if (localStorage.getItem("installBannerClosed") === new Date().toLocaleDateString()) return;

    // 2. Platform Detection
    const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const device = platform === "auto" ? (isIOS() ? "ios" : "android") : platform;

    // 3. Update the Visuals
    if (device === "ios") {
        if (textEl) textEl.innerHTML = 'Tap the <strong>Share</strong> icon then <strong>"Add to Home Screen"</strong>';
        if (installBtn) installBtn.style.display = "none";
    } else {
        if (textEl) textEl.innerText = "Install App for easy access!";
        if (installBtn) {
            installBtn.innerText = "Install App";
            installBtn.style.display = "inline-block";
        }
    }

    banner.classList.remove("hidden");
}

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
window.renderEditList = renderEditList;
window.updateDateLabel = updateDateLabel;
window.openLogModal = openLogModal;
window.closeLogModal = closeLogModal;
window.updateGoalUI = updateGoalUI;
window.loadCurrentUsername = loadCurrentUsername;
window.setTheme = setTheme;
window.showUnifiedInstallBanner = showUnifiedInstallBanner;
window.triggerHaptic = triggerHaptic;
