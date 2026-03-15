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

async function initAuthListener() {
    // Wait for the Firebase SDK to be injected into the window
    if (window.firebaseMethods?.onAuthStateChanged) {
        window.firebaseMethods.onAuthStateChanged(window.auth, async (user) => {
            const btn = document.getElementById("auth-button");
            if (!btn) return;

            if (user) {
                btn.classList.add("logged-in");
                btn.style.backgroundImage = `url('${user.photoURL}')`;
                btn.onclick = () => {
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
                if (window.initApp) window.initApp();
            } else {
                btn.classList.remove("logged-in");
                btn.style.backgroundImage = "none";
                btn.onclick = startCloudSync;

                // Call UI refreshes from ui.js
                if (window.updateDisplay) window.updateDisplay();
                if (window.updateGoalUI) window.updateGoalUI();
            }
        });
    } else {
        setTimeout(initAuthListener, 100);
    }
}

async function startCloudSync() {
    const { signInWithPopup, getDoc, doc } = window.firebaseMethods;

    try {
        const result = await signInWithPopup(window.auth, window.googleProvider);
        const user = result.user;
        const userRef = doc(window.db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        const localData = window.loadData();
        const isLocalEmpty = Object.keys(localData).length === 0 || !localData.history;

        if (userSnap.exists()) {
            const cloudData = userSnap.data();

            // 🛡️ CRITICAL: If local is empty but cloud has data, PULL instead of pushing
            if (isLocalEmpty && cloudData.workouts) {
                console.log("New device detected. Pulling cloud data...");
                localStorage.setItem(window.STORAGE_KEY, JSON.stringify(cloudData.workouts));

                // Refresh the app state so the UI shows the pulled data
                if (window.initApp) window.initApp();
                return; // STOP HERE. Don't sync back up yet.
            }

            // If not empty, just sync the username
            if (cloudData.username) {
                const data = window.loadData();
                if (!data.settings) data.settings = {};
                data.settings.username = cloudData.username;
                localStorage.setItem(window.STORAGE_KEY, JSON.stringify(data));
            }
        } else {
            // NEW USER logic
            const alias = prompt("Pick a username:", user.displayName);
            const finalAlias = alias || user.displayName || "Anonymous";

            await syncLocalToCloud(user.uid, {
                username: finalAlias,
                createdAt: new Date().toISOString(),
            });
        }

        // Only sync Up if we didn't just perform a critical Pull
        await syncLocalToCloud(user.uid);
    } catch (error) {
        console.error("Login failed:", error);
    }
}

async function syncLocalToCloud(userId, extraData = {}) {
    if (!userId || !window.firebaseMethods) return;

    const localData = window.loadData();
    const s = window.computeStats();
    const exerciseId = window.currentExercise; // 🚀 Pulling your current global
    const { doc, setDoc } = window.firebaseMethods;
 
    const userRef = doc(window.db, "users", userId);

    const payload = {
        uid: userId,
        stats: mapStatsToSchema(s),
        workouts: localData,
        lastUpdated: new Date().toISOString(),
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
                    userName: window.getDisplayUsername(),
                    score: p.score,
                    periodId: p.id,
                    exerciseId: exerciseId, // 🚀 Essential for filtering
                    type: p.type,
                    lastUpdated: new Date().toISOString(),
                },
                { merge: true },
            );
        });

        await Promise.all(historyPromises);
        console.log(`Cloud sync successful for ${exerciseId}.`);
    } catch (err) {
        console.error("Cloud sync failed:", err);
    }
}

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

// EXPOSE TO WINDOW
window.syncLocalToCloud = syncLocalToCloud;
window.startCloudSync = startCloudSync;

// KICKSTART THE LISTENER
initAuthListener();
