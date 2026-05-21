// prettier-ignore
import { auth, db, doc, deleteDoc, collection, query, getDocs, where, syncLocalToCloud } from "./init-firebase.js";
import { showToast, triggerHaptic } from "./ui.js";

/*************************************************
 * 1. CONSTANTS & CONFIG (Immutable)
 *************************************************/
export const STORAGE_KEY = "workout-data";

export const EXERCISE_LIB = {
    pushups: { name: "Pushups", iconId: "#icon-pushups", unit: "reps", minGoal: 60, target: "Chest" },
    pullups: { name: "Pullups", iconId: "#icon-pullups", unit: "reps", minGoal: 10, target: "Back" },
    situps: { name: "Situps", iconId: "#icon-situps", unit: "reps", minGoal: 60, target: "Core" },
    squats: { name: "Squats", iconId: "#icon-squats", unit: "reps", minGoal: 60, target: "Legs" },
    lunges: { name: "Lunges", iconId: "#icon-lunges", unit: "reps", minGoal: 60, target: "Legs" },
    dips: { name: "Dips", iconId: "#icon-dips", unit: "reps", minGoal: 30, target: "Triceps" },
};

/*************************************************
 * 2. GLOBAL STATE (Mutable Object)
 *************************************************/
const savedEnabled = localStorage.getItem("enabled_exercises");

export const state = {
    // Current Selections
    currentExercise: localStorage.getItem("lastExercise") || "pushups",
    enabledExercises: savedEnabled ? JSON.parse(savedEnabled) : Object.keys(EXERCISE_LIB),
    currentPageIndex: 0,
    // UI/App Flow
    selectedEditDate: "",
    lastInitTime: 0,
    appInitialized: false,
    currentLayer: "primary",
    isReconciling: false,
    lastReconcileTime: 0,
    weeklyChartTimeout: null,
    monthlyChartTimeout: null,
};

/*************************************************
 * LOAD AND SAVE
 *************************************************/
export function loadData() {
    let raw = localStorage.getItem(STORAGE_KEY);
    let data = raw ? JSON.parse(raw) : {};

    if (!data.settings) data.settings = {};
    if (!data.settings.goals) data.settings.goals = {};

    state.enabledExercises.forEach((exId) => {
        if (!data.settings.goals[exId]) {
            // 🚩 FIX: Use the library baseline instead of a hardcoded 60
            const libEntry = EXERCISE_LIB[exId] || { minGoal: 10 };
            data.settings.goals[exId] = {
                manualGoal: libEntry.minGoal,
                goalMode: "auto",
                thresholdMode: "recommended",
                onTrackDays: 4,
            };
        }
    });

    return data;
}

// This handles the LOCAL SAVE + triggers the Cloud Push
export async function saveData(data) {
    // 1. Mark the data with the current time
    data.lastUpdated = new Date().toISOString();
    // 2. Save locally (Immediate)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    // 3. Trigger Cloud Sync (Background)
    const user = auth?.currentUser;
    if (user && !state.isReconciling) {
        // We pass the userId to sync
        await syncLocalToCloud(user.uid);
    }
}

//-------- DEBOUNCE UTILITY (for inputs like on-track days) --------
let saveTimeout;
export function debounceSave(callback, delay = 500) {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(callback, delay);
}

export function migrateToMultiExercise(data) {
    // 🛡️ CRITICAL GUARD: If data is null/undefined, return an empty object immediately
    if (!data) return {};

    // Ensure the structure exists without overwriting existing data
    data.settings = data.settings || {};
    data.settings.goals = data.settings.goals || {};

    let needsSave = false;

    // Check for old "Flat" settings (Legacy)
    // We check for 'manualGoal' because it was the anchor of the old system
    if (data.settings.hasOwnProperty("manualGoal") && !data.settings.goals.pushups) {
        console.log("🛠 Migrating legacy pushup goals...");

        // Use ?? instead of || to allow a goal of 0
        data.settings.goals.pushups = {
            manualGoal: data.settings.manualGoal ?? 60,
            goalMode: data.settings.goalMode ?? "auto",
            onTrackDays: data.settings.onTrackDays ?? 4,
            thresholdMode: data.settings.thresholdMode ?? "recommended",
        };

        // Cleanup: Remove legacy keys now that they are safely in the new object
        const legacyKeys = ["manualGoal", "goalMode", "thresholdMode", "onTrackDays"];
        legacyKeys.forEach((key) => delete data.settings[key]);

        needsSave = true;
    }

    if (needsSave) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            console.log("✅ Migration committed to storage.");
        } catch (e) {
            console.error("❌ Migration save failed:", e);
        }
    }

    return data;
}
/*************************************************
 * LOGGING & DATA ACTIONS
 *************************************************/
export function addSetToDate(dateKey, reps, exerciseId = state.currentExercise) {
    const data = loadData();

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
    saveData(data);

    console.log(`✅ Added ${reps} ${EXERCISE_LIB[exerciseId].unit} to ${exerciseId}`);
}

export function deleteSet(index, dateKey = state.selectedEditDate, exerciseId = state.currentExercise) {
    const data = loadData();

    if (data[dateKey] && data[dateKey][exerciseId]) {
        data[dateKey][exerciseId].splice(index, 1);

        // Housekeeping: remove empty dates/exercises
        if (data[dateKey][exerciseId].length === 0) delete data[dateKey][exerciseId];
        if (Object.keys(data[dateKey]).length === 0) delete data[dateKey];

        saveData(data);
        console.log(`🗑️ Deleted set ${index} - Syncing mirror...`);
        return true;
    }
    return false;
}

/*************************************************
 * STATS ENGINE
 *************************************************/
export function getDateKey(date = new Date()) {
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

function getDayTotal(data, date, exerciseId) {
    const dateKey = date instanceof Date ? getDateKey(date) : date;
    const dayEntry = data[dateKey];

    if (!dayEntry || !dayEntry[exerciseId]) return 0;

    const sets = dayEntry[exerciseId];

    // If it's an array of numbers, sum them up
    if (Array.isArray(sets)) {
        return sets.reduce((sum, val) => sum + (Number(val) || 0), 0);
    }

    // Fallback if it's already a single number
    return Number(sets) || 0;
}

export function getTodayId() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function getYesterdayId() {
    const d = new Date();
    d.setDate(d.getDate() - 1); // Subtract one day
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function getWeekId(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    // Find the Sunday of this week
    d.setDate(d.getDate() - d.getDay());
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    // Returns a string like "2026-W-Feb-8"
    return `${year}-W-${month}-${day}`;
}
export function getMonthId(date) {
    const d = new Date(date);
    // Returns "2026-02"
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function getYearId(date) {
    return String(new Date(date).getFullYear());
}

export function getPreviousPeriodId(type, currentId) {
    // We create a fresh date object right here to avoid any scope issues
    const date = new Date();

    // Normalize type to lowercase to avoid "Weekly" vs "weekly" bugs
    const t = type.toLowerCase();

    if (t.includes("week")) {
        date.setDate(date.getDate() - 7);
        return getWeekId(date);
    }

    if (t.includes("month")) {
        // 1. Force the date to the 1st of the month to avoid day-overflow (like Feb 29)
        date.setDate(1);
        date.setMonth(date.getMonth() - 1);
        return getMonthId(date);
    }

    if (t.includes("year")) {
        date.setFullYear(date.getFullYear() - 1);
        return getYearId(date);
    }

    return null;
}

function calculateDailyGoal(data, exerciseId) {
    const libEntry = EXERCISE_LIB[exerciseId] || { minGoal: 10 };
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
        const v = getDayTotal(data, d, exerciseId);
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
}

function getGoals(data, exerciseId = state.currentExercise) {
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
}

export function computeStats(exerciseId = state.currentExercise) {
    if (!exerciseId || !EXERCISE_LIB[exerciseId]) return null;
    const data = loadData ? loadData() : {};
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayStr = getDateKey(today);
    const currentYearStr = today.getFullYear().toString();

    // 1. Contextual Dates & IDs
    const yest = new Date(today);
    yest.setDate(yest.getDate() - 1);
    const yestStr = getDateKey(yest);

    const diffToSunday = today.getDay();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - diffToSunday);
    const sundayStr = getDateKey(sunday);

    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(today.getDate() - 13);
    const fourteenDaysAgoStr = getDateKey(fourteenDaysAgo);

    // IDs for Database Sync/Organization
    const weekId = getWeekId ? getWeekId(today) : null;
    const monthId = getMonthId ? getMonthId(today) : null;
    const yearId = getYearId ? getYearId(today) : null;

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
    const thirtyDaysAgoStr = getDateKey(thirtyDaysAgo);

    // --- THE ONE LOOP ---

    allKeys.forEach((dateKey) => {
        const val = getDayTotal(data, dateKey, exerciseId);
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
        expectedDateStr = getDateKey(nextDay);

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
        const v = getDayTotal(data, d, exerciseId);
        weeklyData.push(v);
        weeklyTotal += v;
    }

    // 4. Specific Totals & Goals
    const todayTotal = getDayTotal(data, todayStr, exerciseId);
    const yesterdayTotal = getDayTotal(data, yestStr, exerciseId);
    const dailyGoal = calculateDailyGoal(data, exerciseId);
    const currentGoals = getGoals(data, exerciseId);

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
            .reduce((s, date) => s + getDayTotal(data, date, exerciseId), 0);
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
        streak: currentStreakCount,
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
}

/**
 * LIGHTWEIGHT OVERVIEW HELPER
 * Returns only the 7-day array for a specific exercise.
 * No historical loops, no streak math.
 */
export function getQuickWeekly(exerciseId) {
    const data = loadData();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let weeklyData = [];
    let maxVal = 0;

    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        
        // Use your existing getDayTotal utility
        const v = getDayTotal(data, d, exerciseId);
        
        weeklyData.push(v);
        if (v > maxVal) maxVal = v;
    }

    return {
        exerciseId,
        weeklyData,
        maxVal: maxVal || 10 // Fallback to avoid division by zero in CSS
    };
}

/*************************************************
 * CLEAR LOCAL DATA - IMPORT - EXPORT
 *************************************************/
window.clearLocalData = function () {
    // 1. Check if the user is logged in
    const user = auth?.currentUser;

    if (user) {
        triggerHaptic("error");
        alert("🔒 Action Blocked: You must sign out before clearing local data to prevent an automatic cloud sync.");
        return;
    }

    // 2. Standard warning for logged-out users
    const warning = "⚠️ This will delete all local workout history on this device. Are you sure?";

    if (confirm(warning)) {
        triggerHaptic("warning");

        // 3. Simple Wipe
        localStorage.clear();
        sessionStorage.clear();

        // Show toast notification and refresh
        showToast("Local database cleared.");
        // location.reload();
    }
};

window.smartImport = function (jsonString) {
    try {
        const imported = JSON.parse(jsonString);
        const current = loadData();
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
        saveData(current);
        alert(`Import Complete! \nAdded: ${newEntries} new days \nUpdated: ${mergedEntries} existing days.`);
        location.reload();
    } catch (e) {
        alert("Invalid file format.");
        console.error(e);
    }
};

export async function exportData() {
    // 1. Grab everything from local storage
    const data = localStorage.getItem(STORAGE_KEY) || "{}";
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

window.nukeCloudData = async function () {
    if (!auth?.currentUser) return (console.error("No user logged in."), showToast("No user logged in."));
    const user = auth?.currentUser;
    if (!user) return;

    const confirm1 = confirm("STOP! This will delete your ENTIRE cloud presence. Are you sure?");
    if (!confirm1) return;

    const confirm2 = prompt("Type 'DELETE' to confirm (All caps):");
    if (confirm2 !== "DELETE") return;

    const uid = auth.currentUser.uid;

    try {
        console.log("🧨 Starting Cloud Nuke for UID:", uid);

        // 1. Delete Main User Doc
        const userRef = doc(db, "users", uid);
        await deleteDoc(userRef);

        // 2. Find and Delete ALL Standings (Daily + Historical)
        // We query by 'uid' field we added to the documents earlier
        const standingsRef = collection(db, "standings");
        const q = query(standingsRef, where("uid", "==", uid));
        const snapshot = await getDocs(q);

        const deletePromises = snapshot.docs.map((d) => deleteDoc(d.ref));
        await Promise.all(deletePromises);
        await auth.signOut();

        console.log(`✅ Cloud wiped. ${snapshot.size + 1} documents removed.`);
        showToast(`✅ Cloud wiped. ${snapshot.size + 1} documents removed.`);

        const confirm3 = confirm("Do you also want to clear local data to stay in sync? (Recommended)");
        // 3. Clear Local as well to stay in sync
        clearLocalData();
    } catch (err) {
        console.error("❌ Nuke failed:", err);
        showToast("❌ Nuke failed:", err);
    }
};

function injectMockLeaderboard() {
    if (!lbList) {
        console.error("❌ Could not find #lb-list");
        return;
    }

    console.log("🚀 Injecting 25 mock competitors...");

    // Create 25 fake users
    let mockHTML = "";
    const names = [
        "Alex",
        "Jordan",
        "Taylor",
        "Casey",
        "Riley",
        "Quinn",
        "Skyler",
        "Charlie",
        "Emerson",
        "Parker",
        "Sloane",
        "Reese",
    ];

    for (let i = 1; i <= 25; i++) {
        const rank = i + 5; // Start after your real top few
        const name = names[i % names.length] + " " + (100 + i);
        const score = (1000 - i * 20).toLocaleString();

        mockHTML += `
            <div class="lb-row">
                <span class="lb-rank">${rank}</span>
                <span class="lb-name">${name} 🤖</span>
                <div style="text-align:right">
                    <span class="lb-score">${score}</span>
                </div>
            </div>
        `;
    }

    // Append to the list
    lbList.insertAdjacentHTML("beforeend", mockHTML);

    showToast("✅ Mock users added to Leaderboard.");
}
// PUSHUPS ONLY TEST DATA SEEDER
window.seedTestData = function seedTestData() {
    const message =
        "Warning: This will overwrite your entire pushup history and settings with test data. Are you sure you want to proceed?";

    if (!window.confirm(message)) {
        console.log("Operation cancelled by user.");
        return; // Exit the function if they click 'Cancel'
    }

    const data = {};
    const today = new Date();

    // We go back 180 days (approx 6 months)
    for (let i = 180; i >= 0; i--) {
        const d = new Date();
        d.setDate(today.getDate() - i);
        const dateKey = d.toISOString().split("T")[0];

        // Leave a 5-day gap leading up to today
        // (Days 1 to 5 ago will be empty)
        if (i > 0 && i <= 5) {
            continue;
        }

        // Randomly skip some days to make the data look real (Rest days)
        if (Math.random() > 0.2) {
            data[dateKey] = {
                // Generate 1 to 3 random sets
                pushups: Array.from(
                    { length: Math.floor(Math.random() * 3) + 1 },
                    () => Math.floor(Math.random() * 20) + 30,
                ),
            };
        }
    }

    // Add necessary metadata
    data.settings = {
        goals: {
            pushups: { manualGoal: 60, goalMode: "auto", onTrackDays: 4 },
        },
        thresholdMode: "recommended",
    };
    data.lastUpdated = new Date().toISOString();

    // Save to LocalStorage
    localStorage.setItem("workout-data", JSON.stringify(data));

    console.log("✅ Test Data Seeded!");
    console.log("Gap: Last 23 days are empty.");
    console.log("Exercise: Pushups (Array format).");
    showToast("✅ Test Data Seeded!\nReload the app to see the results.");
};
