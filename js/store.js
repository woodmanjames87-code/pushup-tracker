// prettier-ignore
import { auth, db, doc, deleteDoc, collection, query, getDocs, where, syncLocalToCloud } from "./init-firebase.js";
import { showToast, triggerHaptic } from "./ui.js";
import { elements } from "./dom.js";

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
    plank: { name: "Plank", iconId: "#icon-plank", unit: "seconds", minGoal: 60, target: "Core" },
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
    trendChartInstance: null,
};

/*************************************************
 * 3. CORE UTILITIES & DATE GENERATORS
 *************************************************/
export function getDateKey(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);

    // Safety fallback if a bad date argument gets passed in
    if (isNaN(d.getTime())) {
        return getTodayId();
    }

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

export function getTodayId() {
    // 🎯 Kept strictly local! Grabs your real device date right now.
    return getDateKey(new Date());
}

export function getYesterdayId() {
    // 🎯 Kept strictly local! Steps back exactly 24 hours in local time.
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return getDateKey(d);
}

export function getWeekId(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() - d.getDay()); // Snap directly to Sunday locally
    return `${d.getFullYear()}-W-${d.getMonth() + 1}-${d.getDate()}`;
}

export function getMonthId(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function getYearId(date) {
    return String(new Date(date).getFullYear());
}

export function getPreviousPeriodId(type, currentId) {
    const date = new Date();
    const t = type.toLowerCase();

    if (t.includes("week")) {
        date.setDate(date.getDate() - 7);
        return getWeekId(date);
    }
    if (t.includes("month")) {
        date.setDate(1); // Block monthly overflow traps (e.g., Feb 31st bugs)
        date.setMonth(date.getMonth() - 1);
        return getMonthId(date);
    }
    if (t.includes("year")) {
        date.setFullYear(date.getFullYear() - 1);
        return getYearId(date);
    }
    return null;
}

/*************************************************
 * 4. IO PERSISTENCE & DATA MANAGEMENT
 *************************************************/
export function loadData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};

    if (!data.settings) data.settings = {};
    if (!data.settings.goals) data.settings.goals = {};

    state.enabledExercises.forEach((exId) => {
        if (!data.settings.goals[exId]) {
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

export async function saveData(data, exerciseId = state.currentExercise) {
    data.lastUpdated = new Date().toISOString(); 
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

    const user = auth?.currentUser;
    if (user) { 
        try {
            // 🎯 FIX: Pass an empty object for stats, and 'data' as the third argument!
            await syncLocalToCloud(user.uid, {}, data, {}, exerciseId); 
            console.log("🚀 Sync to Cloud pushed successfully.");
        } catch (syncError) {
            console.error("❌ Direct upload sync failed:", syncError);
        }
    }
}

let saveTimeout;
export function debounceSave(callback, delay = 500) {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(callback, delay);
}

export function migrateToMultiExercise(data) {
    if (!data) return {};

    data.settings = data.settings || {};
    data.settings.goals = data.settings.goals || {};

    if (data.settings.hasOwnProperty("manualGoal") && !data.settings.goals.pushups) {
        console.log("🛠 Migrating legacy pushup goals...");

        data.settings.goals.pushups = {
            manualGoal: data.settings.manualGoal ?? 60,
            goalMode: data.settings.goalMode ?? "auto",
            onTrackDays: data.settings.onTrackDays ?? 4,
            thresholdMode: data.settings.thresholdMode ?? "recommended",
        };

        ["manualGoal", "goalMode", "thresholdMode", "onTrackDays"].forEach((key) => delete data.settings[key]);

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
 * 5. DATA ACTIONS & ENTRY MODIFIERS
 *************************************************/
export function prepareModalState() {
    state.selectedEditDate = getTodayId();
}

export function handleModalSubmission(reps, exerciseId = null) {
    const targetDate = state.selectedEditDate || getTodayId();

    // 🎯 Use the specific shortcut context passed in, or fallback to main exercise
    const activeExerciseId = exerciseId || state.currentExercise;

    addSetToDate(targetDate, reps, activeExerciseId);
}

export function addSetToDate(dateKey, reps, exerciseId = state.currentExercise) {
    const data = loadData();

    if (!data[dateKey]) data[dateKey] = {};

    // Legacy fallback check: Converts old array-only days to the multi-exercise object format
    if (Array.isArray(data[dateKey])) {
        const oldSets = data[dateKey];
        data[dateKey] = { pushups: oldSets };
        console.log(`📦 Converted legacy array for ${dateKey} to object format.`);
    }

    if (!data[dateKey][exerciseId]) {
        data[dateKey][exerciseId] = [];
    }

    data[dateKey][exerciseId].push(Number(reps));
    saveData(data, exerciseId);

    console.log(`✅ Added ${reps} ${EXERCISE_LIB[exerciseId].unit} to ${exerciseId}`);
}

export function deleteSet(index, dateKey = state.selectedEditDate, exerciseId = state.currentExercise) {
    const data = loadData();

    if (data[dateKey] && data[dateKey][exerciseId]) {
        data[dateKey][exerciseId].splice(index, 1);

        if (data[dateKey][exerciseId].length === 0) delete data[dateKey][exerciseId];
        if (Object.keys(data[dateKey]).length === 0) delete data[dateKey];

        saveData(data, exerciseId);
        console.log(`🗑️ Deleted set ${index}`);
        return true;
    }
    console.log(`🗑️ Failed to delete set ${index}`);
    return false;
}

/*************************************************
 * 6. STATS METRIC COMPILATION HUB
 *************************************************/
function getDayTotal(data, date, exerciseId) {
    const dateKey = date instanceof Date ? getDateKey(date) : date;
    const dayEntry = data[dateKey];

    if (!dayEntry || !dayEntry[exerciseId]) return 0;

    const sets = dayEntry[exerciseId];
    return Array.isArray(sets) ? sets.reduce((sum, val) => sum + (Number(val) || 0), 0) : Number(sets) || 0;
}

function calculateDailyGoal(data, exerciseId) {
    const libEntry = EXERCISE_LIB[exerciseId] || { minGoal: 10 };
    const exSettings = data.settings?.goals?.[exerciseId] || {};

    if (exSettings.goalMode === "manual") {
        return exSettings.manualGoal || libEntry.minGoal;
    }

    let activeValues = [];
    const today = new Date();

    // Loop back through the last 30 days until we collect up to 14 active workout days
    for (let i = 1; i <= 30 && activeValues.length < 14; i++) {
        const d = new Date();
        d.setDate(today.getDate() - i);

        const v = getDayTotal(data, d, exerciseId);
        if (v > 0) activeValues.push(v);
    }

    if (activeValues.length === 0) return libEntry.minGoal;

    // 🎯 Your custom logic: Compare median vs average to filter out drastic rest day drops
    const sorted = [...activeValues].sort((a, b) => a - b);
    const sum = activeValues.reduce((a, b) => a + b, 0);
    const avg = sum / activeValues.length;

    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

    // Round up to the nearest multiple of 5
    const rounded = Math.ceil(Math.max(avg, median) / 5) * 5;
    return Math.max(libEntry.minGoal, rounded);
}

function getGoals(data, exerciseId = state.currentExercise) {
    const exSettings = data.settings?.goals?.[exerciseId] || {};
    const mode = exSettings.thresholdMode || data.settings?.thresholdMode || "recommended";
    const isRecommended = mode !== "custom";

    const ON_TRACK = isRecommended ? 4 : exSettings.onTrackDays || 4;
    const IMPROVE = ON_TRACK + 1;
    const DAYS_PER_WEEK = 7;

    return {
        DAYS_PER_WEEK,
        ON_TRACK_DAYS: ON_TRACK,
        IMPROVE_DAYS: IMPROVE,
        WINDOW_DAYS: 30,
        onTrackRatio: ON_TRACK / DAYS_PER_WEEK,
        improveRatio: IMPROVE / DAYS_PER_WEEK,
    };
}

export function computeStats(exerciseId = state.currentExercise) {
    if (!exerciseId || !EXERCISE_LIB[exerciseId]) return null;
    const data = loadData();
    
    // 🎯 Grab the config to know if this exercise is tracked in seconds
    const config = EXERCISE_LIB[exerciseId];
    const isSeconds = (config.unit === "seconds" || config.unit === "sec");

    // Normalize today to local midnight to prevent timestamp bleeding
    const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    const todayStr = getDateKey(today);
    const currentYearStr = today.getFullYear().toString();
    const yestStr = getYesterdayId();

    const sunday = new Date(today);
    sunday.setDate(today.getDate() - today.getDay());
    const sundayStr = getDateKey(sunday);

    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(today.getDate() - 13);

    const weekId = getWeekId(today);
    const monthId = getMonthId(today);
    const yearId = getYearId(today);

    // Filter down to cleanly formatted date keys and sort them chronologically
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
    let exerciseFirstDateStr = "";

    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 29);
    const thirtyDaysAgoStr = getDateKey(thirtyDaysAgo);

    // 🎯 Dynamically establish volume tiers based on the type of exercise
    // Reps: 100+ is Elite, 50+ is Solid. Seconds (Planks): 300s (5m) is Elite, 120s (2m) is Solid.
    const eliteThreshold = isSeconds ? 300 : 100;
    const solidThreshold = isSeconds ? 120 : 50;

    // --- THE ONE LOOP ---
    allKeys.forEach((dateKey) => {
        const val = getDayTotal(data, dateKey, exerciseId);
        if (val <= 0) return; // Skip rest days for this specific exercise

        if (!exerciseFirstDateStr) {
            exerciseFirstDateStr = dateKey;
        }

        allTimeTotal += val;
        activeDays++;
        lastActiveDateStr = dateKey;
        if (val > pb) pb = val;

        // Categorize training volume benchmarks using our dynamic thresholds
        if (val >= eliteThreshold) {
            centuryDays++; // Keeps track of "Elite Tier Days"
            eliteVol += val;
        } else if (val >= solidThreshold) {
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

        // STREAK LOGIC
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

        if (dateKey >= getDateKey(fourteenDaysAgo) && dateKey <= todayStr) {
            active14++;
        }
    });

    // Break streak if no activity recorded today or yesterday
    if (lastActiveDateStr !== todayStr && lastActiveDateStr !== yestStr) {
        currentStreakCount = 0;
    }

    // Weekly Chart Data (The 7-Day Array)
    let weeklyData = [];
    let weeklyTotal = 0;
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const v = getDayTotal(data, d, exerciseId);
        weeklyData.push(v);
        weeklyTotal += v;
    }

    // Rolling 30-Day Performance Timeline
    let chart30Values = [];
    let chart30Labels = [];
    for (let i = 29; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        chart30Values.push(getDayTotal(data, d, exerciseId));
        chart30Labels.push("");
    }

    const todayTotal = getDayTotal(data, todayStr, exerciseId);
    const yesterdayTotal = getDayTotal(data, yestStr, exerciseId);
    const dailyGoal = calculateDailyGoal(data, exerciseId);
    const currentGoals = getGoals(data, exerciseId);

    // Monthly Trend Calculation
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

    // Rest Streak Math
    let restStreak = 0;
    if (lastActiveDateStr && todayTotal === 0) {
        const lastDate = new Date(lastActiveDateStr + "T00:00:00");
        restStreak = Math.floor((today - lastDate) / 86400000);
    }

    // Trends & Milestones
    const avg30 = Number((total30 / 30).toFixed(1));
    const trendPct = avg30 / dailyGoal;
    let trend = { label: "Below Target", color: "#ff3b30" };
    if (trendPct >= currentGoals.improveRatio) trend = { label: "Improving", color: "#007aff" };
    else if (trendPct >= currentGoals.onTrackRatio) trend = { label: "On Track", color: "#34c759" };

    const firstDateObj = exerciseFirstDateStr ? new Date(exerciseFirstDateStr + "T00:00:00") : today;
    const firstDateStr = firstDateObj.toLocaleDateString(undefined, { month: "short", year: "numeric" }).toUpperCase();
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const daysInYearSoFar = Math.max(Math.ceil((today - startOfYear) / 86400000), 1);

    // Lifetime Metrics
    const totalDaysElapsed = Math.round(Math.abs(today - firstDateObj) / 86400000) + 1 || 1;
    const lifetimeAvg = Math.round(allTimeTotal / totalDaysElapsed);

    const windowSize = Math.min(14, totalDaysElapsed);
    const rest14 = Math.max(0, windowSize - active14);

    // 🎯 Dynamically scale your lifetime milestones (e.g., milestone every 5,000 reps OR every 10,000 seconds)
    const milestoneInterval = isSeconds ? 10000 : 5000;

    return {
        exerciseId,
        isSeconds, // 🎯 Return this flag so your ui.js file knows how to format the display strings easily!
        weekId,
        monthId,
        yearId,
        todayTotal,
        yesterdayTotal,
        weeklyTotal,
        calendarWeeklyTotal,
        monthlyTotal: monthlyData[currentMonthLabel] || 0,
        total30,
        chart30Labels,
        chart30Values,
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
        nextMilestone: Math.ceil((allTimeTotal + 1) / milestoneInterval) * milestoneInterval,
        projectedYearly: Math.round((ytdTotal / daysInYearSoFar) * 365),
        currentYearStr,
        eliteVol,
        solidVol,
        lightVol,
        firstDateStr,
        activeDays,
    };
}

export function getQuickWeekly(exerciseId) {
    const data = loadData();
    const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

    let weeklyData = [];
    let maxVal = 0;

    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const v = getDayTotal(data, d, exerciseId);
        weeklyData.push(v);
        if (v > maxVal) maxVal = v;
    }

    return { exerciseId, weeklyData, maxVal: maxVal || 10 };
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

export function smartImport(jsonString) {
    try {
        const imported = JSON.parse(jsonString);
        const current = loadData();
        let newEntries = 0;
        let mergedEntries = 0;

        // 1. Filter out metadata keys to focus strictly on valid date tracking items
        const dateKeys = Object.keys(imported).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));

        dateKeys.forEach((date) => {
            const incomingDay = imported[date];

            // Safety fallback check to confirm it's an object structure
            if (!incomingDay || typeof incomingDay !== "object" || Array.isArray(incomingDay)) return;

            // --- CASE 1: BRAND NEW DATE KEY ---
            if (!current[date]) {
                current[date] = incomingDay;
                newEntries++;
            }
            // --- CASE 2: EXISTING DATE KEY (SMART MERGE) ---
            else {
                let dateWasUpdated = false;

                Object.keys(incomingDay).forEach((exId) => {
                    const incomingSets = incomingDay[exId];
                    if (!Array.isArray(incomingSets)) return;

                    // If local data doesn't have this exercise yet, drop the sets right in
                    if (!current[date][exId]) {
                        current[date][exId] = [...incomingSets];
                        dateWasUpdated = true;
                    }
                    // Otherwise, merge individual sets carefully to eliminate duplicates
                    else {
                        incomingSets.forEach((setVolume) => {
                            const numVolume = Number(setVolume);

                            // Find out how many times this exact rep count exists locally vs incoming
                            const localCount = current[date][exId].filter((v) => v === numVolume).length;
                            const incomingCount = incomingSets.filter((v) => v === numVolume).length;

                            // Only push the set if the local data has fewer instances of it than the incoming file
                            if (localCount < incomingCount) {
                                current[date][exId].push(numVolume);
                                dateWasUpdated = true;
                            }
                        });
                    }
                });

                if (dateWasUpdated) mergedEntries++;
            }
        });

        // 2. Commit back to local systems, alert, and refresh layout state
        saveData(current);
        alert(`Import Complete!\nAdded: ${newEntries} new days\nUpdated: ${mergedEntries} existing days.`);
        location.reload();
    } catch (e) {
        alert("Invalid file format.");
        console.error("❌ Import Failed:", e);
    }
}

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
