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
            { id: s.yearId, score: s.ytdTotal, type: "yearly" }
        ];

        const historyPromises = periods.map(p => {
            // Document ID: "2026-W11_pushups_user123"
            // This prevents different exercises from overwriting each other!
            const standingId = `${p.id}_${exerciseId}_${userId}`;
            const standingsRef = doc(window.db, "standings", standingId);
            
            return setDoc(standingsRef, {
                userName: payload.username || "Anonymous",
                score: p.score,
                periodId: p.id,
                exerciseId: exerciseId, // 🚀 Essential for filtering
                type: p.type,
                lastUpdated: new Date().toISOString()
            }, { merge: true });
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

/*************************************************
 * LEADERBOARD LOGIC
 *************************************************/
async function fetchPreviousPodium(type, currentPeriodId) {
    const { collection, query, where, orderBy, limit, getDocs } = window.firebaseMethods;
    const prevId = window.getPreviousPeriodId(type, currentPeriodId);
    const exerciseId = window.currentExercise;

    const q = query(
        collection(window.db, "standings"),
        where("periodId", "==", prevId),
        where("exerciseId", "==", exerciseId),
        orderBy("score", "desc"),
        limit(3)
    );

    const snap = await getDocs(q);
    return snap.docs.map(doc => doc.data());
}

async function fetchLeaderboard(passedFilter = null) {
    const lbList = document.getElementById("lb-list");
    const rangeText = document.getElementById("lb-date-range-text");
    if (!lbList) return;

    // 1. Determine Filter
    const filterContainer = document.getElementById("leaderboard-filter");
    const activeBtn = filterContainer ? filterContainer.querySelector(".seg-btn.active") : null;
    const filter = passedFilter || (activeBtn ? activeBtn.getAttribute("data-filter") : "stats.daily");

    // 2. Safety Guard
    if (!window.firebaseMethods || !window.db) {
        lbList.innerHTML = "<p style='text-align:center; opacity:0.5;'>Connecting to cloud...</p>";
        return;
    }

    const { collection, query, where, orderBy, limit, getDocs } = window.firebaseMethods;
    const now = new Date();
    const exerciseId = window.currentExercise || "pushups"; // 🚀 Added context
    let displayLabel = "";

    // 3. Set Display Label (No changes here)
    if (filter === "stats.daily") displayLabel = "Today & Yesterday";
    else if (filter === "stats.week") {
        const sun = new Date(now);
        sun.setDate(now.getDate() - now.getDay());
        displayLabel = `Week of ${sun.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    } else if (filter === "stats.month") {
        displayLabel = now.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    } else if (filter === "stats.year") {
        displayLabel = now.getFullYear();
    }
    if (rangeText) rangeText.innerText = displayLabel;

    try {
        lbList.innerHTML = '<div class="loader"></div>';
        let leaderboardData = [];

        // 4. Fetch Logic
        if (filter === "stats.daily") {
            // --- KEEPING YOUR ORIGINAL DAILY LOGIC (Users Collection) ---
            const usersRef = collection(window.db, "users");
            const qToday = query(usersRef, where("stats.todayId", "==", window.getTodayId()), limit(30));
            const qYest = query(usersRef, where("stats.todayId", "==", window.getYesterdayId()), limit(30));

            const [snapToday, snapYest] = await Promise.all([getDocs(qToday), getDocs(qYest)]);
            const userMap = new Map();

            snapYest.forEach((doc) => {
                const s = doc.data().stats;
                userMap.set(doc.id, {
                    uid: doc.id,
                    username: doc.data().username || "Anonymous",
                    todayScore: 0,
                    yesterdayScore: s.today || 0,
                });
            });

            snapToday.forEach((doc) => {
                const s = doc.data().stats;
                if (userMap.has(doc.id)) {
                    userMap.get(doc.id).todayScore = s.today;
                } else {
                    userMap.set(doc.id, {
                        uid: doc.id,
                        username: doc.data().username || "Anonymous",
                        todayScore: s.today,
                        yesterdayScore: s.yest || 0,
                    });
                }
            });

            leaderboardData = Array.from(userMap.values());
            leaderboardData.sort((a, b) => b.todayScore - a.todayScore || b.yesterdayScore - a.yesterdayScore);

        } else {
            // --- 🚀 NEW HISTORICAL LOGIC (Standings Collection) ---
            const podiumData = await fetchPreviousPodium(fieldName === "week" ? "weekly" : fieldName === "month" ? "monthly" : "yearly", idValue);
            renderPodiumUI(podiumData, fieldName);
            
            const fieldName = filter.split(".")[1]; // "week", "month", or "year"
            
            // Generate the Period ID for "Now"
            let idValue;
            if (fieldName === "week") idValue = getWeekId(now);
            else if (fieldName === "month") idValue = getMonthId(now);
            else idValue = getYearId(now);

            // Query the 'standings' collection instead of 'users'
            const standingsRef = collection(window.db, "standings");
            const q = query(
                standingsRef, 
                where("periodId", "==", idValue), 
                where("exerciseId", "==", exerciseId), // 🚀 Exercise-aware!
                orderBy("score", "desc"), 
                limit(20)
            );

            const querySnapshot = await getDocs(q);

            querySnapshot.forEach((doc) => {
                const d = doc.data();
                leaderboardData.push({
                    uid: doc.id.split("_").pop(), // Extract UID from end of doc ID
                    username: d.userName || "Anonymous",
                    score: d.score || 0,
                });
            });
        }

        // 5. Render (No changes here)
        lbList.innerHTML = "";
        if (leaderboardData.length === 0) {
            lbList.innerHTML = `<p class='h3' style="text-align:center; opacity:0.5; margin-top:40px;">No ranks yet.</p>`;
            return;
        }

        leaderboardData.forEach((user, index) => {
            const isMe = user.uid === window.auth?.currentUser?.uid;
            const displayScore = filter === "stats.daily" ? user.todayScore : user.score;

            const row = `
                <div class="lb-row ${isMe ? "is-me" : ""}">
                    <span class="lb-rank">${index + 1}</span>
                    <span class="lb-name">${user.username}</span>
                    <div style="text-align:right">
                        <span class="lb-score">${displayScore.toLocaleString()}</span>
                        ${filter === "stats.daily" ? `<span style="font-size:0.75rem; opacity:0.6; display:block;">Yest: ${user.yesterdayScore}</span>` : ""}
                    </div>
                </div>
            `;
            lbList.insertAdjacentHTML("beforeend", row);
        });
    } catch (err) {
        console.error("Leaderboard failed:", err);
        lbList.innerHTML = `<p style="text-align:center; opacity:0.5; margin-top:40px;">Failed to load leaderboard.</p>`;
    }
}


// EXPOSE TO WINDOW
window.syncLocalToCloud = syncLocalToCloud;
window.fetchLeaderboard = fetchLeaderboard;
window.startCloudSync = startCloudSync;

// KICKSTART THE LISTENER
initAuthListener();
