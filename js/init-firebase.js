// js/init-firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import {
    getAuth,
    signInWithPopup,
    GoogleAuthProvider,
    onAuthStateChanged,
    updateProfile, // Added for the username fix
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    collection,
    query,
    orderBy,
    limit,
    getDocs,
    where,
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCPXMYnQufpyWx6zXznDpJtMukbtLA-Vfo",
    authDomain: "my-pushup-tracker-2367b.firebaseapp.com",
    projectId: "my-pushup-tracker-2367b",
    storageBucket: "my-pushup-tracker-2367b.firebasestorage.app",
    messagingSenderId: "76145599652",
    appId: "1:76145599652:web:c011f6b47120d4a986b231",
    measurementId: "G-R8L7NNJ79M",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Attach to window so main.js and ui.js can use them
window.auth = auth;
window.db = db;
window.googleProvider = provider;
window.firebaseMethods = {
    signInWithPopup,
    onAuthStateChanged,
    updateProfile,
    doc,
    setDoc,
    getDoc,
    collection,
    query,
    orderBy,
    limit,
    getDocs,
    where,
};

console.log("Firebase initialized and methods attached to window.");

/*************************************************
 * DATA & CLOUD SYNC
 *************************************************/

window.initAuthListener = async function initAuthListener() {
    // Wait for the Firebase SDK to be injected into the window
    if (window.firebaseMethods?.onAuthStateChanged) {
        window.firebaseMethods.onAuthStateChanged(window.auth, async (user) => {
            if (!window.authBtn) return;

            if (user) {
                window.authBtn.classList.add("logged-in");
                window.authBtn.style.backgroundImage = `url('${user.photoURL}')`;
                window.authBtn.onclick = () => {
                    if (confirm("Sign out?")) window.auth.signOut();
                };

                // 🛡️ SILENT PULL: Use window.loadData from store.js
                const localData = window.loadData();
                if (Object.keys(localData).length === 0) {
                    const { getDoc, doc } = window.firebaseMethods;
                    const userRef = doc(window.db, "users", user.uid);
                    const userSnap = await getDoc(userRef);

                    if (userSnap.exists() && userSnap.data().workouts) {
                        // Use STORAGE_KEY from window
                        localStorage.setItem(window.STORAGE_KEY, JSON.stringify(userSnap.data().workouts));
                    }
                }
                // Call initApp from main.js
                if (window.initApp) {
                    window.initApp();
                } else {
                    // If main.js isn't loaded yet, it will call initApp itself when it loads
                    console.log("Waiting for main.js to initialize...");
                }
            } else {
                window.authBtn.classList.remove("logged-in");
                window.authBtn.style.backgroundImage = "none";
                window.authBtn.onclick = startCloudSync;

                // Call UI refreshes from ui.js
                if (window.updateDisplay) window.updateDisplay();
                if (window.updateGoalUI) window.updateGoalUI();
            }
        });
    } else {
        setTimeout(initAuthListener, 100);
    }
};

window.startCloudSync = async function startCloudSync() {
    const { signInWithPopup, getDoc, doc } = window.firebaseMethods;

    try {
        const result = await signInWithPopup(window.auth, window.googleProvider);
        const user = result.user;
        const userRef = doc(window.db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            // NEW USER: Setup Profile
            const alias = prompt("Pick a username:", user.displayName);
            const finalAlias = alias || user.displayName || "Anonymous";

            await syncLocalToCloud(user.uid, {
                username: finalAlias,
                createdAt: new Date().toISOString(),
            });
        }

        // 🚀 Hand off to the Smart Merge
        await reconcileData();

        // Refresh UI
        if (window.initApp) window.initApp();
    } catch (error) {
        console.error("Login failed:", error);
    }
};

window.syncLocalToCloud = async function syncLocalToCloud(userId, extraData = {}) {
    if (window.isReconciling) {
        console.warn("🛡️ Sync blocked: App is currently merging data from cloud.");
        return;
    }
    const localData = window.loadData();

    // 🛡️ THE SAFETY VALVE
    if (!localData.lastUpdated && !extraData.isInitialSetup) {
        console.warn("⚠️ Blocked sync: Local data is empty. Waiting for Cloud Heal...");
        return;
    }

    if (!userId || !window.firebaseMethods) return;

    // 1. Contextual Data Gathering
    const exerciseId = window.currentExercise || "pushups"; // Get active exercise
    const s = window.computeStats(exerciseId); // Compute stats for THIS exercise
    const { doc, setDoc } = window.firebaseMethods;
    const confirmedUsername = localData.settings?.username || window.getDisplayUsername(extraData);

    // 2. The User Profile Payload
    const userRef = doc(window.db, "users", userId);

    const payload = {
        uid: userId,
        stats: {
            ...localData.stats, // Keep existing stats for other exercises
            [exerciseId]: mapStatsToSchema(s),
        },
        workouts: localData, // Contains the full nested data object
        lastUpdated: localData.lastUpdated || new Date().toISOString(),
        ...extraData,
    };

    try {
        // 1. Update the Main User Profile
        await setDoc(userRef, payload, { merge: true });

        // 2. Update the Exercise-Specific Standings
        const periods = [
            { id: s.weekId, score: s.calendarWeeklyTotal, type: "weekly" },
            { id: s.monthId, score: s.monthlyTotal, type: "monthly" },
            { id: s.yearId, score: s.ytdTotal, type: "yearly" },
        ];

        const historyPromises = periods.map((p) => {
            // Document ID: "2026-W11_pushups_user123"
            // This prevents different exercises from overwriting each other!
            const standingId = `${p.id}_${exerciseId}_${userId}`;
            const standingsRef = doc(window.db, "standings", standingId);

            return setDoc(
                standingsRef,
                {
                    username: confirmedUsername,
                    score: p.score,
                    periodId: p.id,
                    exerciseId: exerciseId,
                    type: p.type,
                    lastUpdated: new Date().toISOString(),
                    unit: window.EXERCISE_LIB[exerciseId]?.unit || "reps", // 🚀 New: Save units for display
                },
                { merge: true },
            );
        });

        await Promise.all(historyPromises);
        console.log(`Cloud sync successful for ${exerciseId}.`);
    } catch (err) {
        console.error("Cloud sync failed:", err);
    }
};

function mapStatsToSchema(s) {
    return {
        today: s.todayTotal,
        todayId: getTodayId(),
        yest: s.yesterdayTotal,
        yestId: getYesterdayId(),
        week: s.calendarWeeklyTotal,
        weekId: s.weekId,
        month: s.monthlyTotal,
        monthId: s.monthId,
        year: s.ytdTotal,
        yearId: s.yearId,
    };
}

window.isReconciling = false;
window.lastReconcileTime = 0;

window.reconcileData = async function reconcileData() {
    const now = Date.now();
    if (now - (window.lastReconcileTime || 0) < 30000 || window.isReconciling) return;

    window.isReconciling = true;
    const user = window.auth?.currentUser;
    if (!user || !window.firebaseMethods) {
        window.isReconciling = false;
        return;
    }

    const { doc, getDoc } = window.firebaseMethods;
    const userRef = doc(window.db, "users", user.uid);

    try {
        const snap = await getDoc(userRef);
        const localData = JSON.parse(localStorage.getItem(window.STORAGE_KEY)) || {};

        if (snap.exists()) {
            const cloudData = snap.data();

            // 🚀 THE SMART MERGE: Combine both truths
            const finalData = deepMerge(localData, cloudData.workouts || cloudData);

            // Save the "Healed" version locally
            localStorage.setItem(window.STORAGE_KEY, JSON.stringify(finalData));

            // UI Refresh now that data is merged
            if (window.loadCurrentUsername) window.loadCurrentUsername();
            if (window.updateDisplay) window.updateDisplay();
        }

        // 🚀 THE DISTRIBUTION: Now that local is "whole", push it back
        window.isReconciling = false;
        await window.syncLocalToCloud(user.uid);

        window.lastReconcileTime = Date.now();
    } catch (err) {
        console.error("Reconciliation failed:", err);
        window.isReconciling = false;
    }
};

function deepMerge(local, cloud) {
    // Start with a clean clone of local
    const merged = JSON.parse(JSON.stringify(local || {}));

    // 1. Normalize Cloud Structure
    const cloudWorkouts = cloud.workouts || cloud;

    Object.keys(cloudWorkouts).forEach((date) => {
        // Skip metadata keys
        if (date === "settings" || date === "lastUpdated" || date === "username") return;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return; // Only process date keys

        let incomingDay = cloudWorkouts[date];

        // --- STEP A: NORMALIZE CLOUD DAY (Array -> Object) ---
        if (Array.isArray(incomingDay)) {
            incomingDay = { pushups: incomingDay };
        }

        // --- STEP B: MERGE ---
        if (!merged[date]) {
            // Local is missing this date, take normalized cloud version
            merged[date] = incomingDay;
        } else {
            // Local has this date. Ensure LOCAL is also normalized (Object)
            if (Array.isArray(merged[date])) {
                merged[date] = { pushups: merged[date] };
            }

            // Merge exercises one by one
            Object.keys(incomingDay).forEach((ex) => {
                const localSets = merged[date][ex] || [];
                const cloudSets = incomingDay[ex] || [];

                // Standard "Higher Volume Wins" logic per exercise
                // This preserves the most complete set history for that specific activity
                if (cloudSets.length > localSets.length) {
                    merged[date][ex] = cloudSets;
                }
            });
        }
    });

    // 2. Merge Settings (Clock-based 'Last Updated' logic)
    const localTime = new Date(local.lastUpdated || 0).getTime();
    const cloudTime = new Date(cloud.lastUpdated || 0).getTime();
    const cloudSettings = cloud.settings || (cloud.username ? { username: cloud.username } : {});

    if (cloudTime > localTime || localTime === 0) {
        console.log("💎 Healing Settings from Cloud...");
        merged.settings = {
            ...(merged.settings || {}),
            ...cloudSettings,
        };
        // Don't forget to sync the username if it lives in settings now
        if (cloud.username && !merged.settings.username) {
            merged.settings.username = cloud.username;
        }
        merged.lastUpdated = cloud.lastUpdated || new Date().toISOString();
    }

    return merged;
}
