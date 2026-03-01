/*************************************************
 * DOM REFERENCES
 *************************************************/
const trackerPage = document.getElementById("tracker-page");
const settingsPage = document.getElementById("settings-page");
const leaderboardPage = document.getElementById("leaderboard-page");
const editSetsList = document.getElementById("edit-sets-list");



/*************************************************
 * DATA & CLOUD SYNC
 *************************************************/



function smartImport(jsonString) {
    try {
        const imported = JSON.parse(jsonString);
        const current = JSON.parse(localStorage.getItem("workout-data") || "{}");
        let newEntries = 0;
        let mergedEntries = 0;

        Object.keys(imported).forEach((date) => {
            let incomingSets = [];

            // Detect Old vs New Format
            if (typeof imported[date] === "number") {
                incomingSets = [imported[date]]; // Normalize old format
            } else if (imported[date].pushups) {
                incomingSets = imported[date].pushups;
            }

            if (!current[date]) {
                // Brand new date
                current[date] = { pushups: incomingSets };
                newEntries++;
            } else {
                // Date exists - check if data is unique before merging
                const currentTotal = current[date].pushups.reduce((a, b) => a + b, 0);
                const importTotal = incomingSets.reduce((a, b) => a + b, 0);

                if (currentTotal !== importTotal) {
                    // Totals differ, add incoming as new sets
                    current[date].pushups.push(...incomingSets);
                    mergedEntries++;
                }
            }
        });

        // Save and Reload
        localStorage.setItem("workout-data", JSON.stringify(current));
        alert(`Import Complete! \nAdded: ${newEntries} new days \nUpdated: ${mergedEntries} existing days.`);
        location.reload();
    } catch (e) {
        alert("Invalid file format.");
        console.error(e);
    }
}
function clearAllData() {
    const warning =
        "⚠️ WARNING: This will permanently delete ALL your push-up sets, streaks, and history. This cannot be undone.\n\nAre you absolutely sure?";

    if (confirm(warning)) {
        // Second layer of protection for a "Nuclear" action
        const finalCheck = confirm("Final check: Delete everything?");

        if (finalCheck) {
            localStorage.removeItem("workout-data");
            alert("Database cleared. Starting fresh!");
            location.reload(); // Refresh to reset all charts and totals
        }
    }
}
// Listen for file selection
document.getElementById("import-input").addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const content = e.target.result;
        smartImport(content);
    };
    reader.readAsText(file);
});

/*************************************************
 * INITIALIZATION
 *************************************************/
async function initPWAUtils() {
    const versionEl = document.getElementById("app-version");
    const updateBtn = document.getElementById("btn-update-app");

    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        // 1. Get Version from SW
        const msgChan = new MessageChannel();
        msgChan.port1.onmessage = (event) => {
            if (event.data.version) versionEl.innerText = `Version ${event.data.version}`;
        };
        navigator.serviceWorker.controller.postMessage({ type: "GET_VERSION" }, [msgChan.port2]);

        // 2. Force Update Logic
        updateBtn.onclick = async () => {
            updateBtn.innerText = "Checking...";

            const registration = await navigator.serviceWorker.getRegistration();

            if (registration) {
                // 1. Set up a listener for the NEW worker arriving
                registration.onupdatefound = () => {
                    const newWorker = registration.installing;
                    newWorker.onstatechange = () => {
                        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                            // New version found and fully downloaded!
                            newWorker.postMessage({ type: "SKIP_WAITING" });
                        }
                    };
                };

                // 2. Trigger the check
                await registration.update();

                // 3. Handle the case where the update was already downloaded but not active
                if (registration.waiting) {
                    registration.waiting.postMessage({ type: "SKIP_WAITING" });
                }

                // 4. Listen for the controller change to reload the page
                navigator.serviceWorker.addEventListener("controllerchange", () => {
                    window.location.reload();
                    alert("Updated to newest version!");
                });

                // 5. Provide feedback if nothing was found after a short delay
                setTimeout(() => {
                    if (!registration.waiting && !registration.installing) {
                        updateBtn.innerText = "App is up to date";
                        setTimeout(() => {
                            updateBtn.innerText = "Check for Updates";
                        }, 5000);
                    }
                }, 1000);
            }
        };
    }
}




// Listener for the Manual Number Input
document.getElementById("manual-goal-input").addEventListener("input", (e) => {
    const data = JSON.parse(localStorage.getItem("workout-data") || "{}");
    if (!data.settings) data.settings = {};

    const val = parseInt(e.target.value);
    data.settings.manualGoal = val > 0 ? val : 60; // Don't allow 0

    saveData(data);
    updateDisplay();
});

// Button Handling for Leaderboard Filters
const lbFilterContainer = document.getElementById("leaderboard-filter");

if (lbFilterContainer) {
    lbFilterContainer.querySelectorAll(".seg-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            // Scope removal to ONLY buttons inside this specific container
            lbFilterContainer.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));

            // Add active to the clicked button
            btn.classList.add("active");

            // Reset UI list to loading state
            const lbList = document.getElementById("lb-list");
            if (lbList) {
                lbList.innerHTML = '<div class="loader"></div>';
            }

            fetchLeaderboard();
        });
    });
}








// 3. Handle the click for both platforms
document.getElementById("btn-install-now").onclick = async () => {
    if (deferredPrompt) {
        // Android Path
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
            document.getElementById("install-banner").classList.add("hidden");
        }
        deferredPrompt = null;
    } else if (isIOS) {
        // iOS Path: Show instructions instead of a prompt
        alert(
            "To install on iPhone:\n1. Tap the 'Share' button (square with arrow)\n2. Scroll down and tap 'Add to Home Screen' (+ icon)",
        );
    }
};

// 4. Handle the "Close" button
document.getElementById("btn-install-close").onclick = () => {
    const banner = document.getElementById("install-banner");
    banner.classList.add("hidden");

    // Optional: Save to local storage so it doesn't bother them again today
    localStorage.setItem("installBannerClosed", new Date().toLocaleDateString());
};

/*************************************************
 * Import/Export/Clear Data Functions
 *************************************************/
async function exportData() {
    const data = localStorage.getItem("workout-data") || "{}";
    const blob = new Blob([data], { type: "application/json" });
    const fileName = `pushups-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([blob], fileName, { type: "application/json" });

    // Check if sharing is supported AND allowed
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                files: [file],
                title: "Push-Up Tracker Backup",
            });
            return; // Success!
        } catch (err) {
            // If user cancels or permission denied, fall through to download
            console.log("Share skipped or blocked, falling back to download.");
        }
    }

    // FALLBACK: Standard Download
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a); // Required for some browsers
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/******************************** 
 * OLD STUFF
 ************************************* */

function updateDisplay() {
    const s = window.computeStats();

    // --- 1. DAILY STATS & PROGRESS ---
    document.getElementById("today-val").innerText = s.todayTotal;
    document.getElementById("yest-val").innerText = s.yesterdayTotal;
    document.getElementById("goal-text").innerText = `Goal: ${s.dailyGoal}`;

    const pct = s.todayTotal / s.dailyGoal;
    document.getElementById("progress-bar-green").style.width = Math.min(pct, 1) * 100 + "%";
    document.getElementById("progress-bar-blue").style.width = pct > 1 ? Math.min(pct - 1, 1) * 100 + "%" : "0%";

    document.getElementById("streak-val").innerText = s.streak;
    const restStreakTag = document.getElementById("rest-streak-tag");
    if (s.restStreak > 0) {
        restStreakTag.style.display = "inline-flex";
        document.getElementById("rest-streak-val").innerText = s.restStreak;
    } else {
        restStreakTag.style.display = "none";
    }
    document.getElementById("rest-val").innerText = s.rest14;

    // --- 2. 30-DAY PERFORMANCE & TRENDS ---
    document.getElementById("total-30-val").innerText = s.total30;
    document.getElementById("active-30-val").innerText = `${s.active30}/30`;
    document.getElementById("avg-30").innerText = `Avg: ${s.avg30}/day`;
    document.getElementById("thirty-goal-val").innerText = s.thirtyGoal;
    document.getElementById("thirty-improv-val").innerText = s.thirtyImprov;

    const trendPct30 = (s.total30 / s.thirtyImprov) * 100;
    document.getElementById("trend-fill").style.width = Math.min(trendPct30, 100) + "%";
    document.getElementById("trend-label").innerText = s.trend.label;
    document.getElementById("trend-label").style.color = s.trend.color;

    // --- 3. WEEKLY CHART ---
    const chart = document.getElementById("bar-chart");
    const labelContainer = document.getElementById("bar-labels");
    chart.innerHTML = "";
    labelContainer.innerHTML = "";
    const days = ["Su", "M", "T", "W", "Th", "F", "Sa"];
    const maxVal = Math.max(...s.weeklyData, 1);
    const midVal = Math.round(maxVal / 2);

    document.getElementById("axis-max-l").innerText = maxVal;
    document.getElementById("axis-max-r").innerText = maxVal;
    document.getElementById("axis-mid-l").innerText = midVal;
    document.getElementById("axis-mid-r").innerText = midVal;

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
    document.getElementById("weekly-title").innerText = `Total: ${s.weeklyTotal}`;

    // --- 4. LEGACY INSIGHTS (ALL-TIME) ---
    if (s.allTimeTotal > 0) {
        document.getElementById("legacy-projected").innerText =
            `${s.currentYearStr} PROJECTION: ${s.projectedYearly.toLocaleString()}`;
        document.getElementById("legacy-since").innerText = `STARTED ${s.firstDateStr}`;
        document.getElementById("legacy-active-days").innerText =
            `ACTIVE: ${s.activeDays} / ${s.totalDaysElapsed} days`;

        document.getElementById("stat-all-time").innerText = s.allTimeTotal.toLocaleString();
        document.getElementById("stat-pb").innerText = s.pb.toLocaleString();
        document.getElementById("stat-ytd").innerText = s.ytdTotal.toLocaleString();
        document.getElementById("stat-century").innerText = s.centuryDays;
        document.getElementById("stat-avg").innerText = `${s.lifetimeAvg}/day`;

        // Milestone Progress
        document.getElementById("label-next-milestone").innerText =
            `NEXT MILESTONE: ${s.nextMilestone.toLocaleString()}`;
        const milestonePct = (s.allTimeTotal / s.nextMilestone) * 100;
        document.getElementById("milestone-fill").style.width = Math.min(milestonePct, 100) + "%";

        // Intensity Pill
        const total = s.allTimeTotal || 1;
        document.getElementById("pill-elite").style.width = (s.eliteVol / total) * 100 + "%";
        document.getElementById("pill-solid").style.width = (s.solidVol / total) * 100 + "%";
        document.getElementById("pill-light").style.width = (s.lightVol / total) * 100 + "%";

        // Monthly Chart
        const monthlyChart = document.getElementById("monthly-chart");
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

function showPage(pageId) {
    // Hash the current page
    window.location.hash = `${pageId}-page`;

    // 1. Hide all pages
    document.getElementById("tracker-page").style.display = "none";
    document.getElementById("settings-page").style.display = "none";
    document.getElementById("leaderboard-page").style.display = "none";

    // 2. Show the requested page
    const activePage = document.getElementById(`${pageId}-page`);
    if (activePage) {
        activePage.style.display = "flex";
    }

    // 3. Update Nav Bar Button Colors
    const navButtons = document.querySelectorAll(".nav-item");
    navButtons.forEach((btn) => btn.classList.remove("active"));

    // Logic to highlight the correct icon
    const indexMap = { tracker: 0, leaderboard: 1, settings: 2 };
    navButtons[indexMap[pageId]].classList.add("active");

    // 4. Special logic: Refresh leaderboard when entering social page
    if (pageId === "leaderboard") {
        window.fetchLeaderboard();
    }

    // 5. Special logic: Show/hide the floating log button (tracker + leaderboard)
    const floatingBtn = document.getElementById("floating-log-btn");
    const showBtn = pageId === "tracker" || pageId === "leaderboard";
    floatingBtn.style.display = showBtn ? "block" : "none";
    if (showBtn) window.updateDisplay();

    // 6. Settings‑page setup
    if (pageId === "settings") {
        window.loadCurrentUsername();
        window.renderEditList();
        window.updateGoalUI();
    }
}

function updateDateLabel(dateKey) {
    const label = document.getElementById("display-date-label");
    const todayKey = window.getDateKey();

    if (dateKey === todayKey) {
        label.innerText = "Today";
    } else {
        // Formats "2026-01-30" into something nicer like "Jan 30, 2026"
        const dateObj = new Date(dateKey + "T00:00:00"); // T00:00:00 prevents timezone shifts
        label.innerText = dateObj.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    }
}


/*************************************************
 * Theme Management for Light/Auto/Dark Modes
 *************************************************/
document.addEventListener("DOMContentLoaded", () => {
    const themeContainer = document.querySelector("#theme-selector");

    // Safety check: only run if the theme selector exists on this page
    if (!themeContainer) return;

    const themeButtons = themeContainer.querySelectorAll(".seg-btn");
    const htmlElement = document.documentElement; // <-- Define this!

    function setTheme(theme) {
        // 1. Determine actual appearance
        let appearance = theme;
        if (theme === "auto") {
            appearance = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
        }

        // 2. Apply to HTML tag
        htmlElement.setAttribute("data-theme", appearance);

        // 3. Save preference
        localStorage.setItem("user-theme", theme);

        // 4. Update UI Button States (Scoped to themeButtons)
        themeButtons.forEach((btn) => {
            btn.classList.toggle("active", btn.getAttribute("data-theme") === theme);
        });
    }

    // Event Listeners for theme buttons
    themeButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            const selectedTheme = btn.getAttribute("data-theme");
            setTheme(selectedTheme);
        });
    });

    // Initialize on Load
    const savedTheme = localStorage.getItem("user-theme") || "auto";
    setTheme(savedTheme);

    // Watch for system theme changes
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
        if (localStorage.getItem("user-theme") === "auto") {
            setTheme("auto");
        }
    });
});