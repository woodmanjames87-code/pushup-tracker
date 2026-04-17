// js/init-firebase.js
import { STORAGE_KEY, EXERCISE_LIB, state, computeStats, loadData, getTodayId, getYesterdayId } from "./store.js";
import { elements } from "./dom.js";
import { refreshStateAndUI, getDisplayUsername } from "./ui.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import {
    getAuth,
    signInWithPopup,
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    updateProfile,
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    deleteDoc,
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

// 1. Initialize Instances
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// 2. Export methods directly so other files can import them
export {
    signInWithPopup,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    updateProfile,
    doc,
    setDoc,
    getDoc,
    deleteDoc,
    collection,
    query,
    orderBy,
    limit,
    getDocs,
    where,
};

console.log("Firebase module initialized.");

/*************************************************
 * DATA & CLOUD SYNC
 *************************************************/
export async function initAuthListener() {
    // Wait for the Firebase SDK to be injected
    if (onAuthStateChanged) {
        onAuthStateChanged(auth, async (user) => {
            if (!elements.ui.authBtn) return;

            if (user) {
                elements.ui.authBtn.classList.add("logged-in");
                elements.ui.authBtn.style.backgroundImage = `url('${user.photoURL}')`;
                elements.ui.authBtn.onclick = () => {
                    if (confirm("Sign out?")) auth.signOut();
                };

                // 🛡️ SILENT PULL: Use loadData from store.js
                const localData = loadData();
                if (Object.keys(localData).length === 0) {
                    const userRef = doc(db, "users", user.uid);
                    const userSnap = await getDoc(userRef);

                    if (userSnap.exists() && userSnap.data().workouts) {
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(userSnap.data().workouts));
                    }
                }
                // Call initApp from main.js
                if (typeof refreshStateAndUI === "function") {
                    refreshStateAndUI();
                } else {
                    // If main.js isn't loaded yet, it will call initApp itself when it loads
                    console.log("Waiting for main.js to initialize...");
                }
            } else {
                elements.ui.authBtn.classList.remove("logged-in");
                elements.ui.authBtn.style.backgroundImage = "none";
                elements.ui.authBtn.onclick = startCloudSync;
            }
        });
    } else {
        setTimeout(initAuthListener, 100);
    }
}

async function startCloudSync() {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        const userRef = doc(db, "users", user.uid);
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
        if (typeof refreshStateAndUI === "function") {
            refreshStateAndUI();
        }
    } catch (error) {
        console.error("Login failed:", error);
    }
}

export async function syncLocalToCloud(userId, extraData = {}) {
    if (state.isReconciling) {
        console.warn("🛡️ Sync blocked: App is currently merging data from cloud.");
        return;
    }
    const localData = loadData();

    // 🛡️ THE SAFETY VALVE
    if (!localData.lastUpdated && !extraData.isInitialSetup) {
        console.warn("⚠️ Blocked sync: Local data is empty. Waiting for Cloud Heal...");
        return;
    }

    if (!userId) return;

    // 1. Contextual Data Gathering
    const exerciseId = state.currentExercise || "pushups"; // Get active exercise
    const s = computeStats(exerciseId); // Compute stats for THIS exercise
    const confirmedUsername = localData.settings?.username || getDisplayUsername(extraData);

    // 2. The User Profile Payload
    const userRef = doc(db, "users", userId);

    const payload = {
        uid: userId,
        username: confirmedUsername,
        workouts: localData, // Contains the full nested data object
        lastUpdated: localData.lastUpdated || new Date().toISOString(),
        ...extraData,
    };

    try {
        // 1. Update the Main User Profile
        await setDoc(userRef, payload, { merge: true });

        // 2. Prepare all Standing Updates (Daily + Historical)
        const periods = [
            // --- ADD THE DAILY ENTRY HERE ---
            {
                id: getTodayId(),
                score: s.todayTotal,
                type: "daily",
                standingId: `daily_${exerciseId}_${userId}`,
            },

            {
                id: s.weekId,
                score: s.calendarWeeklyTotal,
                type: "weekly",
                standingId: `${s.weekId}_${exerciseId}_${userId}`,
            },
            {
                id: s.monthId,
                score: s.monthlyTotal,
                type: "monthly",
                standingId: `${s.monthId}_${exerciseId}_${userId}`,
            },
            {
                id: s.yearId,
                score: s.ytdTotal,
                type: "yearly",
                standingId: `${s.yearId}_${exerciseId}_${userId}`,
            },
        ];

        const historyPromises = periods.map((p) => {
            const standingsRef = doc(db, "standings", p.standingId);

            // Base Payload
            const data = {
                uid: userId, // Ensure UID is saved for the leaderboard filter
                username: confirmedUsername,
                score: p.score || 0,
                periodId: p.id,
                exerciseId: exerciseId,
                type: p.type,
                lastUpdated: new Date().toISOString(),
                unit: EXERCISE_LIB[exerciseId]?.unit || "reps",
            };

            // --- ADD EXTRA FIELDS ONLY FOR DAILY ---
            if (p.type === "daily") {
                data.yestScore = s.yesterdayTotal || 0;
                data.yestId = getYesterdayId();
            }

            return setDoc(standingsRef, data, { merge: true });
        });

        await Promise.all(historyPromises);
        console.log(`✅ Cloud sync (Daily + History) successful for ${exerciseId}.`);
    } catch (err) {
        console.error("❌ Cloud sync failed:", err);
    }
}

export async function reconcileData() {
    const now = Date.now();
    if (now - (state.lastReconcileTime || 0) < 30000 || state.isReconciling) return;

    state.isReconciling = true;
    const user = auth?.currentUser;
    if (!user) {
        state.isReconciling = false;
        return;
    }

    const userRef = doc(db, "users", user.uid);

    try {
        const snap = await getDoc(userRef);
        const localData = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};

        if (snap.exists()) {
            const cloudData = snap.data();

            // 🚀 THE SMART MERGE: Combine both truths
            const finalData = deepMerge(localData, cloudData.workouts || cloudData);

            // Save the "Healed" version locally
            localStorage.setItem(STORAGE_KEY, JSON.stringify(finalData));

            // UI Refresh now that data is merged
            refreshStateAndUI();
        }

        // 🚀 THE DISTRIBUTION: Now that local is "whole", push it back
        state.isReconciling = false;
        await syncLocalToCloud(user.uid);

        state.lastReconcileTime = Date.now();
    } catch (err) {
        console.error("Reconciliation failed:", err);
        state.isReconciling = false;
    }
}

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
