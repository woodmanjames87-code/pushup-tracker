/*************************************************
 * CONSTANTS & CONFIG
 *************************************************/
const STORAGE_KEY = "workout-data";
const currentExercise = "pushups";

// Get goals from localStorage or use defaults
window.getGoals = function () {
    const data = window.loadData();
    const settings = data.settings || {};

    // 1. Check if we are in "Recommended" mode (Default) or "Custom"
    const isRecommended = settings.thresholdMode !== "custom";

    // 2. Determine the baseline (Force 4 if Recommended, otherwise use saved value)
    const ON_TRACK = isRecommended ? 4 : settings.goals?.onTrackDays || 4;

    const IMPROVE = ON_TRACK + 1;
    const DAYS_PER_WEEK = 7;

    return {
        DAYS_PER_WEEK: DAYS_PER_WEEK, // Ensure this is returned!
        ON_TRACK_DAYS: ON_TRACK,
        IMPROVE_DAYS: IMPROVE,
        WINDOW_DAYS: 30,
        onTrackRatio: ON_TRACK / DAYS_PER_WEEK,
        improveRatio: IMPROVE / DAYS_PER_WEEK,
    };
};

/*************************************************
 * LOAD AND SAVE
 *************************************************/
function loadData() {
    return JSON.parse(localStorage.getItem(window.STORAGE_KEY) || "{}");
}

// This handles the LOCAL SAVE + triggers the Cloud Push
async function saveData(data) {
    // 1. Mark the data with the current time
    data.lastUpdated = new Date().toISOString();

    // 2. Save locally (Immediate)
    localStorage.setItem(window.STORAGE_KEY, JSON.stringify(data));

    // 3. Trigger Cloud Sync (Background)
    const user = window.auth?.currentUser;
    if (user) {
        // We pass the userId to sync
        await window.syncLocalToCloud(user.uid);
    }
}

/*************************************************
 * LOGGING & DATA ACTIONS
 *************************************************/

function addSetToDate(dateKey, reps) {
    const data = loadData();

    if (!data[dateKey]) data[dateKey] = {};
    if (!data[dateKey][currentExercise]) data[dateKey][currentExercise] = [];

    data[dateKey][currentExercise].push(reps);
    saveData(data);
    // We just save. main.js will tell the UI to refresh.
}

function deleteSet(index, dateKey) {
    const data = loadData();

    if (data[dateKey] && data[dateKey][currentExercise]) {
        data[dateKey][currentExercise].splice(index, 1);
        saveData(data);
    }
}

/*************************************************
 * STATS ENGINE
 *************************************************/
function getDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-indexed
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getDayTotal(data, date) {
    const key = getDateKey(date);
    return data[key] && data[key][currentExercise] ? data[key][currentExercise].reduce((a, b) => a + b, 0) : 0;
}

function getTodayId() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getYesterdayId() {
    const d = new Date();
    d.setDate(d.getDate() - 1); // Subtract one day
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getWeekId(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    // Find the Sunday of this week
    d.setDate(d.getDate() - d.getDay());
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    // Returns a string like "2026-W-Feb-8"
    return `${year}-W-${month}-${day}`;
}
function getMonthId(date) {
    const d = new Date(date);
    // Returns "2026-02"
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function getYearId(date) {
    return String(new Date(date).getFullYear());
}

window.getPreviousPeriodId = function (type, currentId) {
    // We create a fresh date object right here to avoid any scope issues
    const date = new Date();

    // Normalize type to lowercase to avoid "Weekly" vs "weekly" bugs
    const t = type.toLowerCase();

    if (t.includes("week")) {
        date.setDate(date.getDate() - 7);
        return window.getWeekId(date);
    }

    if (t.includes("month")) {
        date.setMonth(date.getMonth() - 1);
        return window.getMonthId(date);
    }

    if (t.includes("year")) {
        date.setFullYear(date.getFullYear() - 1);
        return window.getYearId(date);
    }

    return null;
};

function computeStats() {
    const data = loadData();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const currentYearStr = today.getFullYear().toString();

    // Basic Totals
    const todayTotal = getDayTotal(data, today);
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    const yesterdayTotal = getDayTotal(data, yest);

    // Weekly Data
    let weeklyData = [];
    let weeklyTotal = 0;
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(today.getDate() - i);
        const v = getDayTotal(data, d);
        weeklyData.push(v);
        weeklyTotal += v;
    }

    // Calendar Week Total
    const diffToSunday = today.getDay();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - diffToSunday);
    sunday.setHours(0, 0, 0, 0);

    let calendarWeeklyTotal = 0;

    // Now this loop will correctly run from 0 to 6 on Saturday night
    for (let i = 0; i <= diffToSunday; i++) {
        const d = new Date(sunday);
        d.setDate(sunday.getDate() + i);
        calendarWeeklyTotal += getDayTotal(data, d);
    }

    // Daily Goal Manual or Auto (Avg/Median of last 14 active days)
    let dailyGoal = 60; // Default fallback

    if (data.settings?.goalMode === "manual") {
        // Use the user's manual preference
        dailyGoal = data.settings.manualGoal || 60;
    } else {
        // Use your original smart calculation
        let activeValues = [];
        for (let i = 1; i <= 30 && activeValues.length < 14; i++) {
            const d = new Date();
            d.setDate(today.getDate() - i);
            const v = getDayTotal(data, d);
            if (v > 0) activeValues.push(v);
        }

        if (activeValues.length > 0) {
            const sum = activeValues.reduce((a, b) => a + b, 0);
            const avg = sum / activeValues.length;
            const sorted = [...activeValues].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

            // Your original rounding logic
            dailyGoal = Math.max(60, Math.ceil(Math.max(avg, median) / 5) * 5);
        }
    }

    const currentGoals = window.getGoals();
    // 30-Day Windows
    const thirtyGoal = Math.round(dailyGoal * currentGoals.WINDOW_DAYS * currentGoals.onTrackRatio);
    const thirtyImprov = Math.round(dailyGoal * currentGoals.WINDOW_DAYS * currentGoals.improveRatio);

    let total30 = 0;
    for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(today.getDate() - i);
        total30 += getDayTotal(data, d);
    }
    const avg30 = Number((total30 / 30).toFixed(1));

    let active30 = 0;
    for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(today.getDate() - i);
        if (getDayTotal(data, d) > 0) active30++;
    }
    // Streaks
    let streak = todayTotal > 0 ? 1 : 0;
    for (let i = 1; i < 30; i++) {
        const d = new Date();
        d.setDate(today.getDate() - i);
        if (getDayTotal(data, d) > 0) streak++;
        else break;
    }

    // Rest Streak (Days since last workout)
    let restStreak = 0;
    // We start checking from "Yesterday" (i = 1)
    // because we don't want to penalize them for not working out "yet" today.
    for (let i = 1; i < 365; i++) {
        const d = new Date();
        d.setDate(today.getDate() - i);

        if (getDayTotal(data, d) === 0) {
            restStreak++;
        } else {
            break; // Stop counting as soon as we find a workout day
        }
    }
    // Special case: If they haven't worked out today AND they missed yesterday,
    // we add today to the streak.
    if (restStreak > 0 && todayTotal === 0) {
        restStreak += 1;
    } else if (todayTotal > 0) {
        // If they worked out today, rest streak is always 0
        restStreak = 0;
    }

    // Best Streak (All time)
    const allKeys = Object.keys(data).sort();
    let bestStreak = 0,
        currentStreak = 0;
    if (allKeys.length) {
        let d = new Date(allKeys[0]);
        while (d <= today) {
            if (getDayTotal(data, d) > 0) currentStreak++;
            else currentStreak = 0;
            bestStreak = Math.max(bestStreak, currentStreak);
            d.setDate(d.getDate() + 1);
        }
    }

    // Rest Days (Last 14 days)
    const rest14 = Array.from({ length: 14 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        return getDayTotal(data, d) === 0 ? 1 : 0;
    }).reduce((a, b) => a + b, 0);

    // Trend
    const trendPct = avg30 / dailyGoal;
    let trend = { label: "Below Target", color: "#ff3b30" };
    if (trendPct >= currentGoals.improveRatio) {
        trend = { label: "Improving", color: "#007aff" };
    } else if (trendPct >= currentGoals.onTrackRatio) {
        trend = { label: "On Track", color: "#34c759" };
    }

    // --- All-Time Data ---
    let allTimeTotal = 0;
    let ytdTotal = 0;
    let pb = 0;
    let centuryDays = 0;
    let activeDays = 0;
    let eliteVol = 0,
        solidVol = 0,
        lightVol = 0;

    // One loop to rule them all (All-Time Stats)
    allKeys.forEach((dateKey) => {
        const val = getDayTotal(data, new Date(dateKey + "T00:00:00"));
        if (val > 0) {
            allTimeTotal += val;
            activeDays++;
            if (val > pb) pb = val;
            if (val >= 100) {
                centuryDays++;
                eliteVol += val;
            } else if (val >= 50) {
                solidVol += val;
            } else {
                lightVol += val;
            }

            if (dateKey.startsWith(currentYearStr)) {
                ytdTotal += val;
            }
        }
    });

    // --- Legacy Calculations ---
    const firstDateObj = allKeys.length ? new Date(allKeys[0] + "T00:00:00") : today;
    const firstDateStr = firstDateObj.toLocaleDateString(undefined, { month: "short", year: "numeric" }).toUpperCase();

    const diffTime = Math.abs(today - firstDateObj);
    const totalDaysElapsed = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
    const lifetimeAvg = Math.round(allTimeTotal / totalDaysElapsed);

    // Monthly Chart (Last 6 Months)
    const monthlyData = {};
    let currentMonthLabel = "";
    for (let i = 5; i >= 0; i--) {
        let d = new Date();
        d.setDate(1);
        d.setMonth(today.getMonth() - i);
        const label = d.toLocaleString("default", { month: "short" });

        if (i === 0) currentMonthLabel = label;

        const monthPrefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthlyData[label] = allKeys
            .filter((date) => date.startsWith(monthPrefix))
            .reduce((s, date) => s + getDayTotal(data, new Date(date + "T00:00:00")), 0);
    }
    const monthlyTotal = monthlyData[currentMonthLabel];

    const nextMilestone = Math.ceil((allTimeTotal + 1) / 5000) * 5000;
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const daysInYearSoFar = Math.max(Math.ceil((today - startOfYear) / 86400000), 1);
    const projectedYearly = Math.round((ytdTotal / daysInYearSoFar) * 365);

    return {
        // Leaderboard Helpers
        weekId: getWeekId(today),
        monthId: getMonthId(today),
        yearId: getYearId(today),

        // Core Stats
        todayTotal,
        yesterdayTotal,
        weeklyTotal,
        calendarWeeklyTotal,
        monthlyTotal,
        total30,
        allTimeTotal,
        ytdTotal,

        // Streaks & Goals
        dailyGoal,
        thirtyGoal,
        active30,
        restStreak,
        streak,
        bestStreak,

        // Insights & Trends
        rest14,
        avg30,
        trend,
        thirtyImprov,
        weeklyData,
        monthlyData,
        pb,
        centuryDays,
        lifetimeAvg,
        nextMilestone,
        projectedYearly,

        // Metadata
        currentYearStr,
        eliteVol,
        solidVol,
        lightVol,
        firstDateStr,
        totalDaysElapsed,
        activeDays,
    };
}

/*************************************************
 * CLEAR LOCAL DATA - IMPORT - EXPORT
 *************************************************/
function clearAllData() {
    // 1. Check if the user is logged in
    const user = window.auth?.currentUser;

    if (user) {
        if (window.triggerHaptic) window.triggerHaptic("error");
        alert("🔒 Action Blocked: You must sign out before clearing local data to prevent an automatic cloud sync.");
        return;
    }

    // 2. Standard warning for logged-out users
    const warning = "⚠️ This will delete all local workout history on this device. Are you sure?";

    if (confirm(warning)) {
        if (window.triggerHaptic) window.triggerHaptic("warning");

        // 3. Simple Wipe
        localStorage.clear();
        sessionStorage.clear();

        // Show toast notification and refresh
        window.showToast("Local database cleared.");
        // location.reload();
    }
}

function smartImport(jsonString) {
    try {
        const imported = JSON.parse(jsonString);
        const current = JSON.parse(localStorage.getItem(window.STORAGE_KEY) || "{}");
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
        localStorage.setItem(window.STORAGE_KEY, JSON.stringify(current));
        alert(`Import Complete! \nAdded: ${newEntries} new days \nUpdated: ${mergedEntries} existing days.`);
        location.reload();
    } catch (e) {
        alert("Invalid file format.");
        console.error(e);
    }
}

async function exportData() {
    const data = localStorage.getItem(window.STORAGE_KEY) || "{}";
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

// Fetch Previous Podium Data for Leaderboard
async function fetchPreviousPodium(type, currentPeriodId) {
    const { collection, query, where, orderBy, limit, getDocs } = window.firebaseMethods;
    const prevId = window.getPreviousPeriodId(type, currentPeriodId);
    const exerciseId = window.currentExercise;

    const q = query(
        collection(window.db, "standings"),
        where("periodId", "==", prevId),
        where("exerciseId", "==", exerciseId),
        orderBy("score", "desc"),
        limit(3),
    );

    const snap = await getDocs(q);
    return snap.docs.map((doc) => doc.data());
}

// Expose Data & Logic to the Global Window Object
window.STORAGE_KEY = STORAGE_KEY;
window.currentExercise = currentExercise;
window.loadData = loadData;
window.saveData = saveData;
window.addSetToDate = addSetToDate;
window.deleteSet = deleteSet;
window.computeStats = computeStats;
window.getDateKey = getDateKey;
window.getDayTotal = getDayTotal;
window.getTodayId = getTodayId;
window.getYesterdayId = getYesterdayId;
window.getWeekId = getWeekId;
window.getMonthId = getMonthId;
window.getYearId = getYearId;
window.clearAllData = clearAllData;
window.smartImport = smartImport;
window.exportData = exportData;
