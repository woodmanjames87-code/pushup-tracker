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
    persistentLocalCache,
    persistentMultipleTabManager,
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
    where,
    getDocsFromServer,
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
// 🎯 Configure native Firestore offline cache layers
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager() // Keeps sync unified if you open multiple PWA browser tabs
    })
});
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
    where,
    getDocsFromServer,
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

                // 🎯 KEY UNIFICATION FIX: Read storage key dynamically directly from storeModule
                const storeModule = await import("./store.js");
                const storageKey = storeModule.STORAGE_KEY || "workout-data";
                
                const localRaw = localStorage.getItem(storageKey);
                const localData = localRaw ? JSON.parse(localRaw) : {};

                if (Object.keys(localData).length === 0) {
                    const userRef = doc(db, "users", user.uid);
                    const userSnap = await getDoc(userRef);

                    if (userSnap.exists() && userSnap.data().workouts) {
                        localStorage.setItem(storageKey, JSON.stringify(userSnap.data().workouts));
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
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            const alias = prompt("Pick a username:", user.displayName);
            const finalAlias = alias || user.displayName || "Anonymous";

            const storeModule = await import("./store.js");
            const storageKey = storeModule.STORAGE_KEY || "workout-data";
            const localRaw = localStorage.getItem(storageKey);
            const localData = localRaw ? JSON.parse(localRaw) : {};
            const activeExerciseId = storeModule.state.currentExercise || "pushups";
            const compiledStats = storeModule.computeStats(activeExerciseId);

            await syncLocalToCloud(user.uid, compiledStats, localData, {
                username: finalAlias,
                createdAt: new Date().toISOString(),
                isInitialSetup: true
            }, activeExerciseId);
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
    
    const data = (localData && Object.keys(localData).length > 0) ? localData : storeModule.loadData();
    if (!data.lastUpdated && !extraData.isInitialSetup) return;

    const batch = writeBatch(db);
    const confirmedUsername = data.settings?.username || getDisplayUsername(extraData);

    // 1. User Profile Sync
    const userRef = doc(db, "users", userId);
    batch.set(userRef, {
        uid: userId,
        username: confirmedUsername,
        workouts: data,
        lastUpdated: data.lastUpdated || new Date().toISOString(),
        ...extraData,
    });

    const localTodayStr = storeModule.getTodayId();
    const localYesterdayStr = storeModule.getYesterdayId();

    // 2. Leaderboards / Standings Engine
    const periods = [
        { id: stats.todayTotal ? localTodayStr : "", score: stats.todayTotal, type: "daily", sid: `daily_${exerciseId}_${userId}` },
        { id: stats.weekId, score: stats.calendarWeeklyTotal, type: "weekly", sid: `${stats.weekId}_${exerciseId}_${userId}` },
        { id: stats.monthId, score: stats.monthlyTotal, type: "monthly", sid: `${stats.monthId}_${exerciseId}_${userId}` },
        { id: stats.yearId, score: stats.ytdTotal, type: "yearly", sid: `${stats.yearId}_${exerciseId}_${userId}` },
    ];

    periods.forEach((p) => {
        const ref = doc(db, "standings", p.sid);
        if (p.score === undefined || p.score === null || p.score === 0) {
            batch.delete(ref); 
        } else {
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
        }
    });

    try {
        await batch.commit();
        console.log(`✅ Cloud Synced Scoreboard: ${exerciseId}`);
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
        const userRef = doc(db, "users", user.uid);
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

                // 🎯 KEY UNIFICATION FIX: Saved using unified storeModule key reference
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