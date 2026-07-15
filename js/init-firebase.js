// js/init-firebase.js
import { elements } from "./dom.js";
import { refreshStateAndUI, getDisplayUsername, showToast } from "./ui.js";
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
    initializeFirestore,
    persistentLocalCache, // 🚀 Keeps background upload queueing active
    terminate,
    doc,
    setDoc,
    getDoc,
    deleteDoc,
    writeBatch, // 🚀 Preserves your original batch code
    collection,
    query,
    orderBy,
    limit,
    getDocs,
    getDocsFromServer, // 🚀 Added to force leaderboard cloud-bypassing
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

// 1. Core instances created immediately
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

let underlyingDb = null;
let currentMode = null; // 🕵️‍♂️ Track if we are currently 'websocket' or 'long-polling'

export function getDb() {
    if (!underlyingDb) {
        console.log("⏱️ Database accessed before network test finished. Defaulting immediately.");
        underlyingDb = initializeFirestore(app, { localCache: persistentLocalCache() });
        currentMode = 'websocket';
    }
    return underlyingDb;
}

// 🎯 EXPORT THIS: So main.js can call it during a wake-up refresh
export async function determineNetworkAndInit(isWakeUp = false) {
    let forceLongPolling = false;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);

        const testUrl = "https://firestore.googleapis.com/v1/projects/my-pushup-tracker-2367b/databases";
        const response = await fetch(testUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.status !== 401 && response.status !== 200) {
            throw new Error("Network hijacked");
        }
        console.log("🚀 Connection clear. Preferring WebSockets.");
    } catch (err) {
        forceLongPolling = true;
        console.warn("⚠️ Corporate network restriction detected. Preferring HTTPS long-polling.");
    }

    const targetMode = forceLongPolling ? 'long-polling' : 'websocket';

    // 🔄 First boot: create the DB instance with the detected network mode
    if (!underlyingDb) {
        console.log(`🔄 Configuring Firestore instance for environment: ${targetMode}`);
        underlyingDb = initializeFirestore(app, {
            localCache: persistentLocalCache(),
            ...(forceLongPolling && { experimentalForceLongPolling: true })
        });
        currentMode = targetMode;
        return;
    }

    // 🔄 Only reconstruct the DB instance if our network environment actually CHANGED
    if (underlyingDb && currentMode !== targetMode) {
        console.log(`🔄 Reconfiguring Firestore instance for environment: ${targetMode}`);

        // 🚀 SAFETYSNAP: Kill the old instance cleanly so the new settings take hold
        try {
            await terminate(underlyingDb);
        } catch (e) {
            console.warn("Error shutting down previous Firestore instance:", e);
        }

        underlyingDb = initializeFirestore(app, {
            localCache: persistentLocalCache(),
            ...(forceLongPolling && { experimentalForceLongPolling: true })
        });
        currentMode = targetMode;

        if (isWakeUp) {
            reconcileData();
        }
    }
}

// Kick it off on initial boot
determineNetworkAndInit();

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
    writeBatch,
    collection,
    query,
    orderBy,
    limit,
    getDocs,
    getDocsFromServer, // 🎯 Exposed for leaderboard bypass
    where,
};

console.log("Firebase module initialized.");

/*************************************************
 * DATA & CLOUD SYNC
 *************************************************/
export async function initAuthListener() {
    if (onAuthStateChanged) {
        onAuthStateChanged(auth, async (user) => {
            if (!elements.ui?.authBtn) return;

            if (user) {
                elements.ui.authBtn.classList.add("logged-in");
                elements.ui.authBtn.style.backgroundImage = `url('${user.photoURL}')`;
                elements.ui.authBtn.onclick = () => {
                    if (confirm("Sign out?")) auth.signOut();
                };

                const storeModule = await import("./store.js");
                const storageKey = storeModule.STORAGE_KEY || "workout-data";

                const localRaw = localStorage.getItem(storageKey);
                const localData = localRaw ? JSON.parse(localRaw) : {};

                if (Object.keys(localData).length === 0) {
                    const userRef = doc(getDb(), "users", user.uid);

                    try {
                        const userSnap = await getDoc(userRef);

                        if (userSnap.exists() && userSnap.data().workouts) {
                            localStorage.setItem(storageKey, JSON.stringify(userSnap.data().workouts));
                        }
                    } catch (error) {
                        console.warn("⚠️ Could not fetch cloud workout data; falling back to local cached data.", error);
                    }
                }

                if (typeof refreshStateAndUI === "function") {
                    refreshStateAndUI();
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
        const userRef = doc(getDb(), "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            const alias = prompt("Pick a username:", user.displayName);
            const finalAlias = alias || user.displayName || "Anonymous";

            const storeModule = await import("./store.js");
            const storageKey = storeModule.STORAGE_KEY || "workout-data";
            const localRaw = localStorage.getItem(storageKey);
            const localData = localRaw ? JSON.parse(localRaw) : {};

            if (!localData.settings) localData.settings = {};
            localData.settings.username = finalAlias;
            localData.lastUpdated = new Date().toISOString();
            localStorage.setItem(storageKey, JSON.stringify(localData));

            const activeExerciseId = storeModule.state.currentExercise || "pushups";
            const compiledStats = storeModule.computeStats(activeExerciseId);

            await syncLocalToCloud(
                user.uid,
                compiledStats,
                localData,
                {
                    username: finalAlias,
                    createdAt: new Date().toISOString(),
                    isInitialSetup: true,
                },
                activeExerciseId,
            );
        }

        await reconcileData();

        if (typeof refreshStateAndUI === "function") {
            refreshStateAndUI();
        }
    } catch (error) {
        console.error("Login failed:", error);
    }
}

export async function syncLocalToCloud(userId, compiledStats, localData, extraData = {}, targetExerciseId = null) {
    if (!userId) return;

    const storeModule = await import("./store.js");
    const exerciseId = targetExerciseId || storeModule.state.currentExercise || "pushups";

    let stats = compiledStats;
    if (!stats || Object.keys(stats).length === 0) {
        stats = storeModule.computeStats(exerciseId);
    }

    const data = localData && Object.keys(localData).length > 0 ? localData : storeModule.loadData();
    if (!data.lastUpdated && !extraData.isInitialSetup) return;

    // 🚀 BACK TO BATCH WRITING: Reverting to original atomic batch operations
    const batch = writeBatch(getDb());
    const confirmedUsername = data.settings?.username || getDisplayUsername(extraData);

    const userRef = doc(getDb(), "users", userId);
    batch.set(
        userRef,
        {
            uid: userId,
            username: confirmedUsername,
            workouts: data,
            lastUpdated: data.lastUpdated || new Date().toISOString(),
            ...extraData,
        },
        { merge: true },
    );

    const localTodayStr = storeModule.getTodayId();
    const localYesterdayStr = storeModule.getYesterdayId();

    const periods = [
        {
            id: stats.todayTotal ? localTodayStr : "",
            score: stats.todayTotal,
            type: "daily",
            sid: `daily_${exerciseId}_${userId}`,
        },
        {
            id: stats.weekId,
            score: stats.calendarWeeklyTotal,
            type: "weekly",
            sid: `${stats.weekId}_${exerciseId}_${userId}`,
        },
        {
            id: stats.monthId,
            score: stats.monthlyTotal,
            type: "monthly",
            sid: `${stats.monthId}_${exerciseId}_${userId}`,
        },
        { id: stats.yearId, score: stats.ytdTotal, type: "yearly", sid: `${stats.yearId}_${exerciseId}_${userId}` },
    ].filter((p) => p.score && p.score > 0);

    periods.forEach((p) => {
        const ref = doc(getDb(), "standings", p.sid);
        const standingsPayload = {
            uid: userId,
            username: confirmedUsername,
            score: p.score,
            periodId: p.id,
            exerciseId,
            type: p.type,
            lastUpdated: new Date().toISOString(),
            unit: storeModule.EXERCISE_LIB[exerciseId]?.unit || "reps",
        };
        if (p.type === "daily") {
            standingsPayload.yestScore = stats.yesterdayTotal || 0;
            standingsPayload.yestId = localYesterdayStr;
        }
        batch.set(ref, standingsPayload, { merge: true });
    });

    try {
        await batch.commit();
        console.log(`✅ Cloud Synced Coreboard (Batch): ${exerciseId}`);
    } catch (err) {
        console.error("❌ Sync Error:", err);
    }
}

export async function reconcileData() {
    const user = auth.currentUser;
    if (!user) return;

    const storeModule = await import("./store.js");
    if (storeModule.state.isReconciling) return;

    storeModule.state.isReconciling = true;
    console.log("🔄 Reconciling local and cloud data...");

    try {
        const userRef = doc(getDb(), "users", user.uid);
        const cloudSnap = await getDoc(userRef);
        const local = storeModule.loadData();
        const storageKey = storeModule.STORAGE_KEY || "workout-data";

        if (cloudSnap.exists()) {
            const cloud = cloudSnap.data();
            const cloudWorkouts = cloud.workouts || {};

            const localTime = new Date(local.lastUpdated || 0).getTime();
            const cloudTime = new Date(cloud.lastUpdated || 0).getTime();

            if (localTime === 0 || cloudTime > localTime) {
                console.log("☁️ Cloud data is newer. Updating local storage...");
                const merged = mergeWorkouts(local, cloudWorkouts);

                merged.settings = { ...(local.settings || {}), ...(cloud.settings || cloud.workouts?.settings || {}) };
                merged.lastUpdated = cloud.lastUpdated;

                localStorage.setItem(storageKey, JSON.stringify(merged));
                refreshStateAndUI();
            } else if (localTime > cloudTime) {
                console.log("📱 Local data is newer. Syncing up...");
                const currentExerciseId = storeModule.state.currentExercise || "pushups";
                const compiledStats = storeModule.computeStats(currentExerciseId);
                await syncLocalToCloud(user.uid, compiledStats, local, {}, currentExerciseId);
            }
        } else {
            console.log("🆕 Initializing cloud for new account...");
            const currentExerciseId = storeModule.state.currentExercise || "pushups";
            const compiledStats = storeModule.computeStats(currentExerciseId);
            await syncLocalToCloud(user.uid, compiledStats, local, { isInitialSetup: true }, currentExerciseId);
        }
    } catch (err) {
        console.error("❌ Reconciliation failed:", err);
    } finally {
        storeModule.state.isReconciling = false;
    }
}

function mergeWorkouts(local, cloud) {
    const merged = { ...local, ...cloud };

    Object.keys(cloud).forEach((date) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

        if (local[date] && cloud[date]) {
            merged[date] = { ...local[date], ...cloud[date] };

            const allExercises = new Set([...Object.keys(local[date]), ...Object.keys(cloud[date])]);

            allExercises.forEach((ex) => {
                const localSets = local[date][ex] || [];
                const cloudSets = cloud[date][ex] || [];

                if (Array.isArray(cloudSets) && Array.isArray(localSets)) {
                    const localVolume = localSets.reduce((sum, r) => sum + (Number(r) || 0), 0);
                    const cloudVolume = cloudSets.reduce((sum, r) => sum + (Number(r) || 0), 0);

                    if (cloudVolume > localVolume) {
                        merged[date][ex] = cloudSets;
                    } else {
                        merged[date][ex] = localSets;
                    }
                }
            });
        }
    });
    return merged;
}
