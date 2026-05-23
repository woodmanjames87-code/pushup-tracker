// js/init-firebase.js
import { STORAGE_KEY, EXERCISE_LIB, state, computeStats, loadData, getTodayId, getYesterdayId } from "./store.js";
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
    writeBatch,
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

export async function syncLocalToCloud(userId, extraData = {}, targetExerciseId = null) {
    if (state.isReconciling) return;
    const localData = loadData();
    if (!localData.lastUpdated && !extraData.isInitialSetup) return;
    if (!userId) return;

    const batch = writeBatch(db);
    const exerciseId = targetExerciseId || state.currentExercise || "pushups";
    const s = computeStats(exerciseId);
    const confirmedUsername = localData.settings?.username || getDisplayUsername(extraData);

    // 1. User Profile (Full Mirror Overwrite)
    const userRef = doc(db, "users", userId);
    batch.set(userRef, {
        uid: userId,
        username: confirmedUsername,
        workouts: localData,
        lastUpdated: localData.lastUpdated || new Date().toISOString(),
        ...extraData,
    });

    // 2. Standings (Update or Purge 0s)
    const periods = [
        { id: getTodayId(), score: s.todayTotal, type: "daily", sid: `daily_${exerciseId}_${userId}` },
        { id: s.weekId, score: s.calendarWeeklyTotal, type: "weekly", sid: `${s.weekId}_${exerciseId}_${userId}` },
        { id: s.monthId, score: s.monthlyTotal, type: "monthly", sid: `${s.monthId}_${exerciseId}_${userId}` },
        { id: s.yearId, score: s.ytdTotal, type: "yearly", sid: `${s.yearId}_${exerciseId}_${userId}` },
    ];

    periods.forEach((p) => {
        const ref = doc(db, "standings", p.sid);
        if (!p.score || p.score === 0) {
            batch.delete(ref); // Remove from leaderboard if total is 0
        } else {
            const data = {
                uid: userId,
                username: confirmedUsername,
                score: p.score,
                periodId: p.id,
                exerciseId,
                type: p.type,
                lastUpdated: new Date().toISOString(),
                unit: EXERCISE_LIB[exerciseId]?.unit || "reps",
            };
            if (p.type === "daily") {
                data.yestScore = s.yesterdayTotal || 0;
                data.yestId = getYesterdayId();
            }
            batch.set(ref, data, { merge: true });
        }
    });

    try {
        await batch.commit();
        console.log(`✅ Cloud Synced: ${exerciseId}`);
    } catch (err) {
        console.error("❌ Sync Error:", err);
    }
}

export async function reconcileData() {
    const user = auth.currentUser;
    if (!user) return;

    state.isReconciling = true;
    console.log("🔄 Reconciling local and cloud data...");

    try {
        const userRef = doc(db, "users", user.uid);
        const cloudSnap = await getDoc(userRef);
        const local = loadData();

        if (cloudSnap.exists()) {
            const cloud = cloudSnap.data();
            const cloudWorkouts = cloud.workouts || {};

            const localTime = new Date(local.lastUpdated || 0).getTime();
            const cloudTime = new Date(cloud.lastUpdated || 0).getTime();

            // HEAL: If Cloud is newer OR Local has never been updated
            if (localTime === 0 || cloudTime > localTime) {
                console.log("☁️ Cloud data is newer. Updating local storage...");
                const merged = mergeWorkouts(local, cloudWorkouts);

                merged.settings = { ...(local.settings || {}), ...(cloud.settings || cloud.workouts?.settings || {}) };
                merged.lastUpdated = cloud.lastUpdated;

                localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
                refreshStateAndUI();
            } else if (localTime > cloudTime) {
                console.log("📱 Local data is newer. Syncing up...");
                await syncLocalToCloud(user.uid);
            }
        } else {
            console.log("🆕 Initializing cloud for new account...");
            await syncLocalToCloud(user.uid, { isInitialSetup: true });
        }
    } catch (err) {
        console.error("❌ Reconciliation failed:", err);
    } finally {
        state.isReconciling = false;
    }
}

function mergeWorkouts(local, cloud) {
    const merged = { ...local, ...cloud };
    // Simple logic: If both have data for a date, the one with more sets wins
    Object.keys(cloud).forEach((date) => {
        if (local[date] && cloud[date]) {
            Object.keys(cloud[date]).forEach((ex) => {
                if ((cloud[date][ex]?.length || 0) > (local[date][ex]?.length || 0)) {
                    merged[date][ex] = cloud[date][ex];
                }
            });
        }
    });
    return merged;
}
