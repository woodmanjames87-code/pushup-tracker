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

        if (!userSnap.exists()) {
            const alias = prompt("Pick a username:", user.displayName);
            const finalAlias = alias || user.displayName || "Anonymous";

            // Run initial sync with the new profile data
            await syncLocalToCloud(user.uid, {
                username: finalAlias,
                createdAt: new Date().toISOString(),
            });

            // Update Local Settings immediately
            const data = JSON.parse(localStorage.getItem("workout-data") || "{}");
            if (!data.settings) data.settings = {};
            data.settings.username = finalAlias;
            localStorage.setItem("workout-data", JSON.stringify(data));

            alert(`Welcome, ${finalAlias}!`);
        } else {
            // Existing user? Pull cloud name down to local storage
            const existingData = userSnap.data();
            if (existingData && existingData.username) {
                const data = JSON.parse(localStorage.getItem("workout-data") || "{}");
                if (!data.settings) data.settings = {};
                data.settings.username = existingData.username;
                localStorage.setItem("workout-data", JSON.stringify(data));
            }
        }

        // Run general sync for everyone (reps, history, etc.)
        await syncLocalToCloud(user.uid);
    } catch (error) {
        console.error("Login failed:", error);
    }
}

async function syncLocalToCloud(userId, extraData = {}) {
    if (!userId || !window.firebaseMethods) return;

    const localData = window.loadData();
    const s = window.computeStats();
    const { doc, setDoc } = window.firebaseMethods;
    const userRef = doc(window.db, "users", userId);

    const payload = {
        uid: userId,
        stats: mapStatsToSchema(s),
        workouts: localData,
        lastUpdated: new Date().toISOString(),
        ...extraData, // Merges in things like 'username' or 'createdAt'
    };

    try {
        await setDoc(userRef, payload, { merge: true });
        console.log("Cloud sync successful.");
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
    const usersRef = collection(window.db, "users");
    const now = new Date();
    let displayLabel = "";

    // 3. Set Display Label (Logic remains the same as your snippet)
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

        // 4. Fetch Logic (Keeping your logic for Map-based daily merging)
        if (filter === "stats.daily") {
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
            const fieldName = filter.split(".")[1];
            const idField = `stats.${fieldName}Id`;

            let idValue;
            if (fieldName === "week") idValue = getWeekId(now);
            else if (fieldName === "month") idValue = getMonthId(now);
            else idValue = getYearId(now);

            const q = query(usersRef, where(idField, "==", idValue), orderBy(filter, "desc"), limit(20));
            const querySnapshot = await getDocs(q);

            querySnapshot.forEach((doc) => {
                leaderboardData.push({
                    uid: doc.id,
                    username: doc.data().username || "Anonymous",
                    score: doc.data().stats[fieldName] || 0,
                });
            });
        }

        // 5. Render
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
