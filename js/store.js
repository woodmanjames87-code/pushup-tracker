/*************************************************
 * CONSTANTS & CONFIG
 *************************************************/
window.STORAGE_KEY = "workout-data";
// 1. The Source of Truth
window.EXERCISE_LIB = {
    pushups: { name: "Pushups", iconId: "#icon-pushups", unit: "reps", minGoal: 60, target: "Chest" },
    squats: { name: "Squats", iconId: "#icon-squats", unit: "reps", minGoal: 60, target: "Legs" },
    pullups: { name: "Pullups", iconId: "#icon-pullups", unit: "reps", minGoal: 10, target: "Back" },
    situps: { name: "Situps", iconId: "#icon-situps", unit: "reps", minGoal: 60, target: "Core" },
    lunges: { name: "Lunges", iconId: "#icon-lunges", unit: "reps", minGoal: 60, target: "Legs" },
    dips: { name: "Dips", iconId: "#icon-dips", unit: "reps", minGoal: 30, target: "Triceps" },
    plank: { name: "Plank", iconId: "#icon-plank", unit: "secs", minGoal: 60, target: "Core" },
};

// 2. Global State
window.currentExercise = localStorage.getItem("lastExercise") || "pushups";

const savedEnabled = localStorage.getItem("enabled_exercises");
window.enabledExercises = savedEnabled ? JSON.parse(savedEnabled) : Object.keys(window.EXERCISE_LIB);

/*************************************************
 * LOAD AND SAVE
 *************************************************/
window.loadData = function () {
    let raw = localStorage.getItem(window.STORAGE_KEY);
    let data = raw ? JSON.parse(raw) : {};

    if (!data.settings) data.settings = {};
    if (!data.settings.goals) data.settings.goals = {};

    window.enabledExercises.forEach((exId) => {
        if (!data.settings.goals[exId]) {
            // 🚩 FIX: Use the library baseline instead of a hardcoded 60
            const libEntry = window.EXERCISE_LIB[exId] || { minGoal: 10 };
            data.settings.goals[exId] = {
                manualGoal: libEntry.minGoal,
                goalMode: "auto",
                onTrackDays: 4,
            };
        }
    });

    return data;
};

// This handles the LOCAL SAVE + triggers the Cloud Push
window.saveData = async function (data) {
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
};

window.migrateToMultiExercise = function (data) {
    // 🛡️ CRITICAL GUARD: If data is null/undefined, return an empty object immediately
    if (!data) return {};

    if (!data.settings) data.settings = {};
    if (!data.settings.goals) data.settings.goals = {};

    let needsSave = false;

    // Check for old "Flat" settings (Legacy)
    if (data.settings.manualGoal && !data.settings.goals.pushups) {
        console.log("🛠 Migrating legacy pushup goals...");

        data.settings.goals.pushups = {
            manualGoal: data.settings.manualGoal || 60,
            goalMode: data.settings.goalMode || "auto",
            onTrackDays: data.settings.onTrackDays || 4,
            thresholdMode: data.settings.thresholdMode || "recommended",
        };

        delete data.settings.manualGoal;
        delete data.settings.goalMode;
        delete data.settings.thresholdMode;
        delete data.settings.onTrackDays;

        needsSave = true;
    }

    if (needsSave) {
        // Use a direct localStorage set here to avoid the circular dependency
        // that window.saveData() might cause during initialization.
        localStorage.setItem(window.STORAGE_KEY, JSON.stringify(data));
        console.log("✅ Migration committed to storage.");
    }

    return data;
};
/*************************************************
 * LOGGING & DATA ACTIONS
 *************************************************/
window.addSetToDate = function (dateKey, reps, exerciseId = window.currentExercise) {
    const data = window.loadData();

    // 1. Ensure the Date entry exists
    if (!data[dateKey]) {
        data[dateKey] = {};
    }

    // 🛡️ LEGACY PROTECTION:
    // If the data for this date is an Array (old style),
    // move that array into the 'pushups' key before proceeding.
    if (Array.isArray(data[dateKey])) {
        const oldSets = data[dateKey];
        data[dateKey] = {
            pushups: oldSets, // Preserve the history in the new format
        };
        console.log(`📦 Converted legacy array for ${dateKey} to object format.`);
    }

    // 2. Ensure the specific exercise array exists within that date object
    if (!data[dateKey][exerciseId]) {
        data[dateKey][exerciseId] = [];
    }

    // 3. Add the new set
    data[dateKey][exerciseId].push(Number(reps));

    // 4. Save and Sync
    window.saveData(data);

    console.log(`✅ Added ${reps} ${window.EXERCISE_LIB[exerciseId].unit} to ${exerciseId}`);
};

window.deleteSet = function (index, dateKey, exerciseId = window.currentExercise) {
    const data = window.loadData();

    // 1. Contextual Check
    // We check if the date exists AND if that specific exercise exists
    if (data[dateKey] && data[dateKey][exerciseId]) {
        // 2. Remove the specific set
        data[dateKey][exerciseId].splice(index, 1);

        // 3. Housekeeping (The "Cleanup" Rule)
        // If that was the last set for that exercise, delete the empty array
        if (data[dateKey][exerciseId].length === 0) {
            delete data[dateKey][exerciseId];
        }

        // 4. If the entire date is now empty (no exercises left), delete the date key
        if (Object.keys(data[dateKey]).length === 0) {
            delete data[dateKey];
        }

        // 5. Save and Sync
        window.saveData(data);

        console.log(`🗑️ Deleted set at index ${index} from ${exerciseId} on ${dateKey}`);
    }
};

/*************************************************
 * STATS ENGINE
 *************************************************/
function getDateKey(date = new Date()) {
    // 🛡️ THE FIX: If 'date' is a string (e.g., "2026-03-27"),
    // convert it back to a Date Object so .getFullYear() works.
    const d = date instanceof Date ? date : new Date(date);

    // Fallback: If the string was totally mangled, use today's date
    if (isNaN(d.getTime())) {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    }

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

window.getDayTotal = function (data, date, exerciseId) {
    const dateKey = date instanceof Date ? window.getDateKey(date) : date;
    const dayEntry = data[dateKey];

    if (!dayEntry || !dayEntry[exerciseId]) return 0;

    const sets = dayEntry[exerciseId];

    // If it's an array of numbers, sum them up
    if (Array.isArray(sets)) {
        return sets.reduce((sum, val) => sum + (Number(val) || 0), 0);
    }

    // Fallback if it's already a single number
    return Number(sets) || 0;
};

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

window.calculateDailyGoal = function (data, exerciseId) {
    const libEntry = window.EXERCISE_LIB[exerciseId] || { minGoal: 10 };
    const exSettings = data.settings?.goals?.[exerciseId] || {};

    if (exSettings.goalMode === "manual") {
        return exSettings.manualGoal || libEntry.minGoal;
    }

    let activeValues = [];
    const today = new Date();

    for (let i = 1; i <= 30 && activeValues.length < 14; i++) {
        const d = new Date();
        d.setDate(today.getDate() - i);

        // Passing 'data' through to the next function
        const v = window.getDayTotal(data, d, exerciseId);
        if (v > 0) activeValues.push(v);
    }

    if (activeValues.length === 0) return libEntry.minGoal;

    const sorted = [...activeValues].sort((a, b) => a - b);
    const sum = activeValues.reduce((a, b) => a + b, 0);
    const avg = sum / activeValues.length;
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

    const rounded = Math.ceil(Math.max(avg, median) / 5) * 5;
    return Math.max(libEntry.minGoal, rounded);
};

window.getGoals = function (data, exerciseId = window.currentExercise) {
    const settings = data.settings || {};

    // Look for settings specific to THIS exercise
    const exSettings = settings.goals?.[exerciseId] || {};

    // 1. Check mode
    const mode = exSettings.thresholdMode || settings.thresholdMode || "recommended";
    const isRecommended = mode !== "custom";

    // 2. Determine the baseline (Priority: Exercise -> Global -> Default)
    const ON_TRACK = isRecommended ? 4 : exSettings.onTrackDays || 4;

    const IMPROVE = ON_TRACK + 1;
    const DAYS_PER_WEEK = 7;

    return {
        DAYS_PER_WEEK: DAYS_PER_WEEK,
        ON_TRACK_DAYS: ON_TRACK,
        IMPROVE_DAYS: IMPROVE,
        WINDOW_DAYS: 30,
        onTrackRatio: ON_TRACK / DAYS_PER_WEEK,
        improveRatio: IMPROVE / DAYS_PER_WEEK,
    };
};

window.computeStats = function (exerciseId = window.currentExercise) {
    if (!exerciseId || !window.EXERCISE_LIB[exerciseId]) return null;
    const data = window.loadData ? window.loadData() : {};
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayStr = window.getDateKey(today);
    const currentYearStr = today.getFullYear().toString();

    // 1. Contextual Dates & IDs
    const yest = new Date(today);
    yest.setDate(yest.getDate() - 1);
    const yestStr = window.getDateKey(yest);

    const diffToSunday = today.getDay();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - diffToSunday);
    const sundayStr = window.getDateKey(sunday);

    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(today.getDate() - 13);
    const fourteenDaysAgoStr = window.getDateKey(fourteenDaysAgo);

    // IDs for Database Sync/Organization
    const weekId = window.getWeekId ? window.getWeekId(today) : null;
    const monthId = window.getMonthId ? window.getMonthId(today) : null;
    const yearId = window.getYearId ? window.getYearId(today) : null;

    // 2. Prepare Accumulators
    const allKeys = Object.keys(data)
        .filter((k) => k.match(/^\d{4}-\d{2}-\d{2}$/))
        .sort();

    let allTimeTotal = 0,
        ytdTotal = 0,
        pb = 0,
        activeDays = 0;
    let centuryDays = 0,
        eliteVol = 0,
        solidVol = 0,
        lightVol = 0;
    let currentStreakCount = 0,
        bestStreak = 0;
    let lastActiveDateStr = "";
    let calendarWeeklyTotal = 0;
    let total30 = 0,
        active30 = 0;
    let expectedDateStr = "";
    let active14 = 0;

    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 29);
    const thirtyDaysAgoStr = window.getDateKey(thirtyDaysAgo);

    // --- THE ONE LOOP ---

    allKeys.forEach((dateKey) => {
        const val = window.getDayTotal(data, dateKey, exerciseId);
        if (val <= 0) return; // Skip days with 0 reps for this specific exercise

        // 1. Accumulate all historical totals
        allTimeTotal += val;
        activeDays++;
        lastActiveDateStr = dateKey;
        if (val > pb) pb = val;

        if (val >= 100) {
            centuryDays++;
            eliteVol += val;
        } else if (val >= 50) {
            solidVol += val;
        } else {
            lightVol += val;
        }

        if (dateKey.startsWith(currentYearStr)) ytdTotal += val;
        if (dateKey >= sundayStr && dateKey <= todayStr) calendarWeeklyTotal += val;
        if (dateKey >= thirtyDaysAgoStr && dateKey <= todayStr) {
            total30 += val;
            active30++;
        }

        // 2. STREAK LOGIC (The Fix)
        // If this date is exactly 1 day after the previous one, continue streak
        if (expectedDateStr === "" || dateKey === expectedDateStr) {
            currentStreakCount++;
        } else {
            currentStreakCount = 1; // Gap found, reset to 1
        }

        // Prepare the string for the "Next Day" to check against
        let nextDay = new Date(dateKey + "T00:00:00");
        nextDay.setDate(nextDay.getDate() + 1);
        expectedDateStr = window.getDateKey(nextDay);

        bestStreak = Math.max(bestStreak, currentStreakCount);

        if (dateKey >= fourteenDaysAgoStr && dateKey <= todayStr) {
            active14++;
        }
    });

    // 3. Check if the "Live" streak is still valid today or yesterday
    // If you haven't worked out today OR yesterday, the live streak is 0
    if (lastActiveDateStr !== todayStr && lastActiveDateStr !== yestStr) {
        currentStreakCount = 0;
    }

    // 3. Weekly Chart Data (The 7-Day Array)
    let weeklyData = [];
    let weeklyTotal = 0;
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const v = window.getDayTotal(data, d, exerciseId);
        weeklyData.push(v);
        weeklyTotal += v;
    }

    // 4. Specific Totals & Goals
    const todayTotal = window.getDayTotal(data, todayStr, exerciseId);
    const yesterdayTotal = window.getDayTotal(data, yestStr, exerciseId);
    const dailyGoal = window.calculateDailyGoal(data, exerciseId);
    const currentGoals = window.getGoals(data, exerciseId);

    // 5. Monthly Trend Calculation
    const monthlyData = {};
    let currentMonthLabel = "";
    for (let i = 5; i >= 0; i--) {
        let d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const label = d.toLocaleString("default", { month: "short" });
        if (i === 0) currentMonthLabel = label;

        const monthPrefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthlyData[label] = allKeys
            .filter((date) => date.startsWith(monthPrefix))
            .reduce((s, date) => s + window.getDayTotal(data, date, exerciseId), 0);
    }

    // 6. Rest Streak Math
    let restStreak = 0;
    if (lastActiveDateStr && todayTotal === 0) {
        const lastDate = new Date(lastActiveDateStr + "T00:00:00");
        restStreak = Math.floor((today - lastDate) / 86400000);
    }

    // 7. Trends & Milestones
    const avg30 = Number((total30 / 30).toFixed(1));
    const trendPct = avg30 / dailyGoal;
    let trend = { label: "Below Target", color: "#ff3b30" };
    if (trendPct >= currentGoals.improveRatio) trend = { label: "Improving", color: "#007aff" };
    else if (trendPct >= currentGoals.onTrackRatio) trend = { label: "On Track", color: "#34c759" };

    const firstDateObj = allKeys.length ? new Date(allKeys[0] + "T00:00:00") : today;
    const firstDateStr = firstDateObj.toLocaleDateString(undefined, { month: "short", year: "numeric" }).toUpperCase();
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const daysInYearSoFar = Math.max(Math.ceil((today - startOfYear) / 86400000), 1);

    // 8. Lifetime Metrics
    const diffTime = Math.abs(today - firstDateObj);
    const totalDaysElapsed = Math.ceil(diffTime / 86400000) || 1;
    const lifetimeAvg = Math.round(allTimeTotal / totalDaysElapsed);

    // If 14 days have passed, it's 14 - active.
    // If it's a new account, we use totalDaysElapsed (up to 14).
    const windowSize = Math.min(14, totalDaysElapsed);
    const rest14 = Math.max(0, windowSize - active14);

    return {
        exerciseId,
        weekId,
        monthId,
        yearId,
        todayTotal,
        yesterdayTotal,
        weeklyTotal, // Rolling 7-day total
        calendarWeeklyTotal, // Sun-Sat total
        monthlyTotal: monthlyData[currentMonthLabel] || 0,
        total30,
        allTimeTotal,
        ytdTotal,
        dailyGoal,
        thirtyGoal: Math.round(dailyGoal * 30 * currentGoals.onTrackRatio),
        thirtyImprov: Math.round(dailyGoal * 30 * currentGoals.improveRatio),
        active30,
        restStreak,
        rest14,
        streak: todayTotal > 0 ? currentStreakCount : 0,
        bestStreak,
        avg30,
        trend,
        weeklyData,
        monthlyData,
        pb,
        centuryDays,
        lifetimeAvg,
        totalDaysElapsed,
        nextMilestone: Math.ceil((allTimeTotal + 1) / 5000) * 5000,
        projectedYearly: Math.round((ytdTotal / daysInYearSoFar) * 365),
        currentYearStr,
        eliteVol,
        solidVol,
        lightVol,
        firstDateStr,
        activeDays,
    };
};

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

window.smartImport = function (jsonString) {
    try {
        const imported = JSON.parse(jsonString);
        const current = window.loadData();
        let newEntries = 0;
        let mergedEntries = 0;

        // 1. Filter for valid date keys only
        const dateKeys = Object.keys(imported).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));

        dateKeys.forEach((date) => {
            let incomingData = imported[date];
            let normalizedDay = {};

            // --- STEP A: NORMALIZE FORMAT ---
            if (Array.isArray(incomingData)) {
                // Current Format: [10, 15] -> Move to pushups
                normalizedDay = { pushups: incomingData };
            } else if (typeof incomingData === "object" && incomingData !== null) {
                // New Expansion Format: { pushups: [], squats: [] }
                normalizedDay = incomingData;
            } else {
                return; // Skip invalid formats (like the "Very Old" number format)
            }

            // --- STEP B: MERGE ---
            if (!current[date]) {
                current[date] = normalizedDay;
                newEntries++;
            } else {
                let dateWasUpdated = false;

                // Loop through exercises in the incoming day
                Object.keys(normalizedDay).forEach((exId) => {
                    const incomingSets = normalizedDay[exId];

                    if (!current[date][exId]) {
                        current[date][exId] = incomingSets;
                        dateWasUpdated = true;
                    } else {
                        // Compare totals to avoid simple duplicates
                        const currentTotal = current[date][exId].reduce((a, b) => a + b, 0);
                        const importTotal = incomingSets.reduce((a, b) => a + b, 0);

                        if (currentTotal !== importTotal) {
                            current[date][exId].push(...incomingSets);
                            dateWasUpdated = true;
                        }
                    }
                });

                if (dateWasUpdated) mergedEntries++;
            }
        });

        // 2. Finalize
        window.saveData(current);
        alert(`Import Complete! \nAdded: ${newEntries} new days \nUpdated: ${mergedEntries} existing days.`);
        location.reload();
    } catch (e) {
        alert("Invalid file format.");
        console.error(e);
    }
};

async function exportData() {
    // 1. Grab everything from local storage
    const data = localStorage.getItem(window.STORAGE_KEY) || "{}";
    const blob = new Blob([data], { type: "application/json" });

    // 2. Format the filename using your Local Time helper
    // Result: DailyGrind-Backup-2026-03-26-2150.json
    const now = new Date();
    const localDate = getDateKey(now); // Uses your existing YYYY-MM-DD logic
    const localTime = now.getHours().toString().padStart(2, "0") + now.getMinutes().toString().padStart(2, "0");

    const fileName = `DailyGrind-Backup-${localDate}-${localTime}.json`;
    const file = new File([blob], fileName, { type: "application/json" });

    // 3. Trigger Native Share
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                files: [file],
                title: "DailyGrind Workout Backup",
                text: `Backup created on ${localDate} at ${now.getHours()}:${now.getMinutes()}`,
            });
            return;
        } catch (err) {
            console.log("Share skipped or blocked, falling back to download.");
        }
    }

    // 4. FALLBACK: Standard Browser Download
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
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
window.getDateKey = getDateKey;
window.getDayTotal = getDayTotal;
window.getTodayId = getTodayId;
window.getYesterdayId = getYesterdayId;
window.getWeekId = getWeekId;
window.getMonthId = getMonthId;
window.getYearId = getYearId;
window.clearAllData = clearAllData;
window.exportData = exportData;
