/*************************************************
 * CONSTANTS & CONFIG
 *************************************************/
const STORAGE_KEY = "workout-data";
const currentExercise = "pushups";

const GOALS = {
    DAYS_PER_WEEK: 7,
    ON_TRACK_DAYS: 4,
    IMPROVE_DAYS: 5,
    WINDOW_DAYS: 30,
};

/*************************************************
 * LOAD AND SAVE
 *************************************************/
function loadData() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
}

// This handles the LOCAL SAVE + triggers the Cloud Push
async function saveData(data) {
    // Save locally (Immediate)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

    // Trigger Cloud Sync (Background)
    const user = window.auth?.currentUser;
    if (user) {
        await syncLocalToCloud(user.uid);
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
    const d = new Date(date);
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

function computeStats() {
    const data = loadData();
    const today = new Date();
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
    sunday.setHours(0, 0, 0, 0); // Start of Sunday morning

    let calendarWeeklyTotal = 0;

    // Loop from Sunday until Today
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

    // 30-Day Windows
    const thirtyGoal = Math.round(dailyGoal * GOALS.WINDOW_DAYS * (GOALS.ON_TRACK_DAYS / GOALS.DAYS_PER_WEEK));
    const thirtyImprov = Math.round(dailyGoal * GOALS.WINDOW_DAYS * (GOALS.IMPROVE_DAYS / GOALS.DAYS_PER_WEEK));

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
    if (trendPct >= GOALS.IMPROVE_DAYS / GOALS.DAYS_PER_WEEK) {
        trend = { label: "Improving", color: "#007aff" };
    } else if (trendPct >= GOALS.ON_TRACK_DAYS / GOALS.DAYS_PER_WEEK) {
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
};


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
