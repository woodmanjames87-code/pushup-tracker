/*************************************************
 * DOM REFERENCES
 *************************************************/
const floatingLogBtn = document.getElementById('floating-log-btn');
const logModal = document.getElementById('log-modal');
const modalInput = document.getElementById('modal-input');
const cancelBtn = document.getElementById('modal-cancel');
const okBtn = document.getElementById('modal-ok');

const trackerPage = document.getElementById('tracker-page');
const settingsPage = document.getElementById('settings-page');
const goToSettingsBtn = document.getElementById('go-to-settings');
const backToTrackerBtn = document.getElementById('back-to-tracker');
const editSetsList = document.getElementById('edit-sets-list');

/*************************************************
 * CONSTANTS & CONFIG
 *************************************************/
const STORAGE_KEY = 'workout-data';
const currentExercise = 'pushups';

const GOALS = {
    DAYS_PER_WEEK: 7,
    ON_TRACK_DAYS: 4,
    IMPROVE_DAYS: 5, 
    WINDOW_DAYS: 30
};

/*************************************************
 * SERVICE WORKER REGISTRATION
 *************************************************/
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(() => console.log("Offline Mode Active"))
    .catch(err => console.log("Offline Mode Failed", err));
}

/*************************************************
 * STATS ENGINE 
 *************************************************/
function getDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getDayTotal(data, date) {
    const key = getDateKey(date);
    return (data[key] && data[key][currentExercise]) ? data[key][currentExercise].reduce((a, b) => a + b, 0) : 0;
}

function getWeekId(date) {
    const d = new Date(date);
        // Find the Sunday of this week
        d.setDate(d.getDate() - d.getDay());
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    // Returns a string like "2026-W-Feb-8" 
    return `${year}-W-${month}-${day}`;
}
function getMonthId(date) {
    const d = new Date(date);
    // Returns "2026-02" 
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function getYearId(date) {
    return String(new Date(date).getFullYear());
}

function computeStats() {
    const data = loadData();
    const today = new Date();
    const currentYearStr = today.getFullYear().toString();
    
    // Basic Totals
    const todayTotal = getDayTotal(data, today);
    const yest = new Date(); yest.setDate(yest.getDate() - 1);
    const yesterdayTotal = getDayTotal(data, yest);

    // Weekly Data
    let weeklyData = [];
    let weeklyTotal = 0;
    for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(today.getDate() - i);
        const v = getDayTotal(data, d);
        weeklyData.push(v);
        weeklyTotal += v;
    }

    // Calendar Week Total
    const diffToSunday = today.getDay(); 
    
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - diffToSunday);
    sunday.setHours(0, 0, 0, 0); // Start of Sunday morning

    let calendarWeeklyTotal = 0;
    
    // Loop from Sunday until Today
    for (let i = 0; i <= diffToSunday; i++) {
        const d = new Date(sunday);
        d.setDate(sunday.getDate() + i);
        calendarWeeklyTotal += getDayTotal(data, d);
    }
    

    // Daily Goal (Avg/Median of last 14 active days)
    let activeValues = [];
    for (let i = 1; i <= 30 && activeValues.length < 14; i++) {
        const d = new Date(); d.setDate(today.getDate() - i);
        const v = getDayTotal(data, d);
        if (v > 0) activeValues.push(v);
    }

    let dailyGoal = 60; 
    if (activeValues.length > 0) {
        const sum = activeValues.reduce((a, b) => a + b, 0);
        const avg = sum / activeValues.length;
        const sorted = [...activeValues].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        dailyGoal = Math.max(60, Math.ceil(Math.max(avg, median) / 5) * 5);
    }

    // 30-Day Windows
    const thirtyGoal = Math.round(dailyGoal * GOALS.WINDOW_DAYS * (GOALS.ON_TRACK_DAYS / GOALS.DAYS_PER_WEEK));
    const thirtyImprov = Math.round(dailyGoal * GOALS.WINDOW_DAYS * (GOALS.IMPROVE_DAYS / GOALS.DAYS_PER_WEEK));
    
    let total30 = 0;
    for (let i = 0; i < 30; i++) {
        const d = new Date(); d.setDate(today.getDate() - i);
        total30 += getDayTotal(data, d);
    }
    const avg30 = Number((total30 / 30).toFixed(1));

    let active30 = 0;
    for (let i = 0; i <30; i++) {
        const d = new Date(); d.setDate(today.getDate() - i);
        if (getDayTotal(data, d) > 0) active30++;
    }
    // Streaks
    let streak = todayTotal > 0 ? 1 : 0;
    for (let i = 1; i < 30; i++) {
        const d = new Date(); d.setDate(today.getDate() - i);
        if (getDayTotal(data, d) > 0) streak++; else break;
    }

    // Rest Streak (Days since last workout)
    let restStreak = 0;
    // We start checking from "Yesterday" (i = 1) 
    // because we don't want to penalize them for not working out "yet" today.
    for (let i = 1; i < 365; i++) {
        const d = new Date(); 
        d.setDate(today.getDate() - i);
        
        if (getDayTotal(data, d) === 0) {
            restStreak++;
        } else {
            break; // Stop counting as soon as we find a workout day
        }
    }
    // Special case: If they haven't worked out today AND they missed yesterday,
    // we add today to the streak.
    if (restStreak > 0 && todayTotal === 0) {
        restStreak += 1;
    } else if (todayTotal > 0) {
        // If they worked out today, rest streak is always 0
        restStreak = 0;
    }

    // Best Streak (All time)
    const allKeys = Object.keys(data).sort();
    let bestStreak = 0, currentStreak = 0;
    if (allKeys.length) {
        let d = new Date(allKeys[0]);
        while (d <= today) {
            if (getDayTotal(data, d) > 0) currentStreak++; else currentStreak = 0;
            bestStreak = Math.max(bestStreak, currentStreak);
            d.setDate(d.getDate() + 1);
        }
    }

    // Rest Days (Last 14 days)
    const rest14 = Array.from({ length: 14 }, (_, i) => {
        const d = new Date(today); 
        d.setDate(today.getDate() - i);
        return getDayTotal(data, d) === 0 ? 1 : 0;
    }).reduce((a, b) => a + b, 0);

    // Trend
    const trendPct = avg30 / dailyGoal;
    let trend = { label: "Below Target", color: "#ff3b30" };
    if (trendPct >= (GOALS.IMPROVE_DAYS / GOALS.DAYS_PER_WEEK)) {
        trend = { label: "Improving", color: "#007aff" };
    } else if (trendPct >= (GOALS.ON_TRACK_DAYS / GOALS.DAYS_PER_WEEK)) {
        trend = { label: "On Track", color: "#34c759" };
    }

// --- All-Time Data ---
    let allTimeTotal = 0;
    let ytdTotal = 0;
    let pb = 0;
    let centuryDays = 0;
    let activeDays = 0;
    let eliteVol = 0, solidVol = 0, lightVol = 0;
    
    // One loop to rule them all (All-Time Stats)
    allKeys.forEach(dateKey => {
        const val = getDayTotal(data, new Date(dateKey + 'T00:00:00'));
        if (val > 0) {
            allTimeTotal += val;
            activeDays++;
            if (val > pb) pb = val;
            if (val >= 100) { centuryDays++; eliteVol += val; }
            else if (val >= 50) { solidVol += val; }
            else { lightVol += val; }
            
            if (dateKey.startsWith(currentYearStr)) {
                ytdTotal += val;
            }
        }
    });

    // --- Legacy Calculations ---
    const firstDateObj = allKeys.length ? new Date(allKeys[0] + 'T00:00:00') : today;
    const firstDateStr = firstDateObj.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }).toUpperCase();
    
    const diffTime = Math.abs(today - firstDateObj);
    const totalDaysElapsed = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
    const lifetimeAvg = Math.round(allTimeTotal / totalDaysElapsed);

    // Monthly Chart (Last 6 Months)
    const monthlyData = {};
    let currentMonthLabel = ""
    for (let i = 5; i >= 0; i--) {
        let d = new Date(); d.setDate(1); d.setMonth(today.getMonth() - i);
        const label = d.toLocaleString('default', { month: 'short' });

        if (i === 0) currentMonthLabel = label;

        const monthPrefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlyData[label] = allKeys
            .filter(date => date.startsWith(monthPrefix))
            .reduce((s, date) => s + getDayTotal(data, new Date(date + 'T00:00:00')), 0);
    }
    const monthlyTotal = monthlyData[currentMonthLabel];

    const nextMilestone = Math.ceil((allTimeTotal + 1) / 5000) * 5000;
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const daysInYearSoFar = Math.max(Math.ceil((today - startOfYear) / 86400000), 1);
    const projectedYearly = Math.round((ytdTotal / daysInYearSoFar) * 365);


    return { 
        // Leaderboard Helpers
        weekId: getWeekId(today), 
        monthId: getMonthId(today),
        yearId: getYearId(today),
        
        // Core Stats
        todayTotal, yesterdayTotal, weeklyTotal, calendarWeeklyTotal, 
        monthlyTotal, total30, allTimeTotal, ytdTotal,
        
        // Streaks & Goals
        dailyGoal, thirtyGoal, active30, restStreak, streak, bestStreak, 
        
        // Insights & Trends
        rest14, avg30, trend, thirtyImprov, weeklyData, monthlyData,
        pb, centuryDays, lifetimeAvg, nextMilestone, projectedYearly,
        
        // Metadata
        currentYearStr, eliteVol, solidVol, lightVol, firstDateStr, 
        totalDaysElapsed, activeDays 
    };
}

/*************************************************
 * DATA & CLOUD SYNC
 *************************************************/
function loadData() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
}

// This handles the CLOUD PUSH
async function syncLocalToCloud(userId) {
    if (!userId || !window.firebaseMethods) return;

    const localData = loadData();
    
    if (Object.keys(localData).length === 0) {
        console.log("Local storage empty. Skipping cloud push.");
        return;
    }

    const s = computeStats();
    const { doc, setDoc } = window.firebaseMethods;
    const userRef = doc(window.db, "users", userId);

    try {
        await setDoc(userRef, {
            uid: userId, // Good to keep for indexing
            stats: {
                week: s.calendarWeeklyTotal,
                weekId: s.weekId,
                month: s.monthlyTotal,
                monthId: s.monthId,
                year: s.ytdTotal,
                yearId: s.yearId,
                bestStreak: s.bestStreak
            },
            workouts: localData,
            lastUpdated: new Date().toISOString()
        }, { merge: true });
        console.log("Cloud sync successful.");
    } catch (err) {
        console.error("Cloud sync failed:", err);
    }
}

// This handles the LOCAL SAVE + triggers the Cloud Push
async function saveData(data) {
    // Save locally (Immediate)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

    // Trigger Cloud Sync (Background)
    const user = window.auth?.currentUser;
    if (user) {
        await syncLocalToCloud(user.uid);
    }
}

async function startCloudSync() {
    const { signInWithPopup } = window.firebaseMethods;
    
    try {
        const result = await signInWithPopup(window.auth, window.googleProvider);
        const user = result.user;
        
        // Check if this is a brand new user to the database
        const { getDoc, doc, setDoc } = window.firebaseMethods;
        const userRef = doc(window.db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            // NEW USER SETUP:
            const alias = prompt("Pick a username for the leaderboard:", user.displayName);
            const finalAlias = alias || user.displayName || "Anonymous";
            const s = computeStats(); 

            await setDoc(userRef, {
                username: finalAlias,
                uid: user.uid,
                createdAt: new Date().toISOString(),
                stats: {
                    week: s.calendarWeeklyTotal,
                    weekId: s.weekId,
                    month: s.monthlyTotal,
                    monthId: s.monthId,
                    year: s.ytdTotal,
                    yearId: s.yearId
                }
            });
            alert(`Welcome, ${finalAlias}!`);
        }
    } catch (error) {
        console.error("Login failed:", error);
    }
}

function initAuthListener() {
    if (window.firebaseMethods?.onAuthStateChanged) {
        window.firebaseMethods.onAuthStateChanged(window.auth, async (user) => {
            const btn = document.getElementById('auth-button');
            if (!btn) return;

            if (user) {
                // UI Setup
                btn.classList.add('logged-in');
                btn.style.backgroundImage = `url('${user.photoURL}')`;
                btn.onclick = () => { if(confirm("Sign out?")) window.auth.signOut(); };

                // 🛡️ SILENT PULL: Restore data if local is empty
                const localData = loadData();
                if (Object.keys(localData).length === 0) {
                    console.log("Local storage empty, checking cloud for backup...");
                    const { getDoc, doc } = window.firebaseMethods;
                    const userRef = doc(window.db, "users", user.uid);
                    const userSnap = await getDoc(userRef);

                    if (userSnap.exists() && userSnap.data().workouts) {
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(userSnap.data().workouts));
                        console.log("Backup restored successfully.");
                    }
                }
                
                initApp(); 
            } else {
                // Logged out state...
                btn.classList.remove('logged-in');
                btn.style.backgroundImage = 'none';
                btn.onclick = startCloudSync;
                updateDisplay();
            }
        });
    } else {
        setTimeout(initAuthListener, 100);
    }
}

function smartImport(jsonString) {
    try {
        const imported = JSON.parse(jsonString);
        const current = JSON.parse(localStorage.getItem('workout-data') || '{}');
        let newEntries = 0;
        let mergedEntries = 0;

        Object.keys(imported).forEach(date => {
            let incomingSets = [];

            // Detect Old vs New Format
            if (typeof imported[date] === 'number') {
                incomingSets = [imported[date]]; // Normalize old format
            } else if (imported[date].pushups) {
                incomingSets = imported[date].pushups;
            }

            if (!current[date]) {
                // Brand new date
                current[date] = { pushups: incomingSets };
                newEntries++;
            } else {
                // Date exists - check if data is unique before merging
                const currentTotal = current[date].pushups.reduce((a, b) => a + b, 0);
                const importTotal = incomingSets.reduce((a, b) => a + b, 0);

                if (currentTotal !== importTotal) {
                    // Totals differ, add incoming as new sets
                    current[date].pushups.push(...incomingSets);
                    mergedEntries++;
                }
            }
        });

        // Save and Reload
        localStorage.setItem('workout-data', JSON.stringify(current));
        alert(`Import Complete! \nAdded: ${newEntries} new days \nUpdated: ${mergedEntries} existing days.`);
        location.reload(); 

    } catch (e) {
        alert("Invalid file format.");
        console.error(e);
    }
}
function clearAllData() {
    const warning = "⚠️ WARNING: This will permanently delete ALL your push-up sets, streaks, and history. This cannot be undone.\n\nAre you absolutely sure?";
    
    if (confirm(warning)) {
        // Second layer of protection for a "Nuclear" action
        const finalCheck = confirm("Final check: Delete everything?");
        
        if (finalCheck) {
            localStorage.removeItem('workout-data');
            alert("Database cleared. Starting fresh!");
            location.reload(); // Refresh to reset all charts and totals
        }
    }
}
// Listen for file selection
document.getElementById('import-input').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result;
        smartImport(content);
    };
    reader.readAsText(file);
});

// --- PWA VERSION & UPDATE LOGIC ---
async function initPWAUtils() {
    const versionEl = document.getElementById('app-version');
    const updateBtn = document.getElementById('btn-update-app');

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        // 1. Get Version from SW
        const msgChan = new MessageChannel();
        msgChan.port1.onmessage = (event) => {
            if (event.data.version) versionEl.innerText = `Version ${event.data.version}`;
        };
        navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' }, [msgChan.port2]);

        // 2. Force Update Logic
        updateBtn.onclick = async () => {
            updateBtn.innerText = "Checking...";
            
            const registration = await navigator.serviceWorker.getRegistration();
            
            if (registration) {
                // Check the server for a new sw.js file
                await registration.update();
                
                if (registration.waiting) {
                    // New version found and waiting
                    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                    window.location.reload();
                    alert("Updated to newest version!");
                } else {
                    // No new version found
                    updateBtn.innerText = "App is up to date";
                    setTimeout(() => { updateBtn.innerText = "Check for Updates"; }, 3000);
                }
            }
        };
    }
}
/*************************************************
 * NAVIGATION
 *************************************************/
function showPage(pageId) {
    // 1. Hide all pages
    document.getElementById('tracker-page').style.display = 'none';
    document.getElementById('settings-page').style.display = 'none';
    document.getElementById('leaderboard-page').style.display = 'none';
    
    // 2. Show the requested page
    const activePage = document.getElementById(`${pageId}-page`);
    if (activePage) {
        activePage.style.display = 'flex';
    }

    // 3. Update Nav Bar Button Colors
    const navButtons = document.querySelectorAll('.nav-item');
    navButtons.forEach(btn => btn.classList.remove('active'));
    
    // Logic to highlight the correct icon
    const indexMap = { tracker: 0, leaderboard: 1, settings: 2 };
    navButtons[indexMap[pageId]].classList.add('active');

    // 4. Special logic: Refresh leaderboard when entering social page
    if (pageId === 'leaderboard') {
        fetchLeaderboard();
    }
    
    // 5. Special logic: Show/Hide the floating log button
    const floatingBtn = document.getElementById('floating-log-btn');
    if (pageId === 'tracker') {
        floatingBtn.style.display = 'block';
        updateDisplay(); // Refresh home stats
    } else {
        floatingBtn.style.display = 'none';
    }
}

// Pull to refresh
let startY = 0;
let isPulling = false;
const ptr = document.getElementById('pull-to-refresh');

window.addEventListener('touchstart', (e) => {
    // Only trigger if we are at the top and on the tracker page
    if (window.scrollY === 0 && document.getElementById('tracker-page').offsetParent !== null) {
        startY = e.touches[0].pageY;
        isPulling = true;
    }
}, { passive: true });

window.addEventListener('touchmove', (e) => {
    if (!isPulling) return;
    const currentY = e.touches[0].pageY;
    const diff = currentY - startY;

    if (diff > 0) {
        // Tension: makes it feel like pulling a rubber band
        const y = Math.pow(diff, 0.85); 
        ptr.style.transform = `translateY(${y}px)`;
    }
}, { passive: true });

window.addEventListener('touchend', (e) => {
    if (!isPulling) return;
    const diff = e.changedTouches[0].pageY - startY;
    
    if (diff > 70) {
        // Success! Reload or call your refresh function
        ptr.style.transform = 'translateY(60px)';
        location.reload(); 
    } else {
        // Cancelled
        ptr.style.transform = 'translateY(0)';
    }
    isPulling = false;
});

/*************************************************
 * UI RENDERING
 *************************************************/
function updateDisplay() {
    const s = computeStats();

    // --- 1. DAILY STATS & PROGRESS ---
    document.getElementById('today-val').innerText = s.todayTotal;
    document.getElementById('yest-val').innerText = s.yesterdayTotal;
    document.getElementById('goal-text').innerText = `Goal: ${s.dailyGoal}`;
    
    const pct = s.todayTotal / s.dailyGoal;
    document.getElementById('progress-bar-green').style.width = Math.min(pct, 1) * 100 + "%";
    document.getElementById('progress-bar-blue').style.width = pct > 1 ? Math.min(pct - 1, 1) * 100 + "%" : "0%";

    document.getElementById('streak-val').innerText = s.streak;
    const restStreakTag = document.getElementById('rest-streak-tag');
    if (s.restStreak > 0) {
        restStreakTag.style.display = 'inline-flex';
        document.getElementById('rest-streak-val').innerText = s.restStreak;
    } else {
        restStreakTag.style.display = 'none';
    }
    document.getElementById('rest-val').innerText = s.rest14;
    
    // --- 2. 30-DAY PERFORMANCE & TRENDS ---
    document.getElementById('total-30-val').innerText = s.total30;
    document.getElementById('active-30-val').innerText = `${s.active30}/30`;
    document.getElementById('avg-30').innerText = `Avg: ${s.avg30}/day`;
    document.getElementById('thirty-goal-val').innerText = s.thirtyGoal;
    document.getElementById('thirty-improv-val').innerText = s.thirtyImprov;

    const trendPct30 = (s.total30 / s.thirtyImprov) * 100;
    document.getElementById('trend-fill').style.width = Math.min(trendPct30, 100) + "%";
    document.getElementById('trend-label').innerText = s.trend.label;
    document.getElementById('trend-label').style.color = s.trend.color;

    // --- 3. WEEKLY CHART ---
    const chart = document.getElementById('bar-chart');
    const labelContainer = document.getElementById('bar-labels');
    chart.innerHTML = '';
    labelContainer.innerHTML = '';
    const days = ['Su', 'M', 'T', 'W', 'Th', 'F', 'Sa'];
    const maxVal = Math.max(...s.weeklyData, 1);
    const midVal = Math.round(maxVal / 2);
    
    document.getElementById('axis-max-l').innerText = maxVal;
    document.getElementById('axis-max-r').innerText = maxVal;
    document.getElementById('axis-mid-l').innerText = midVal;
    document.getElementById('axis-mid-r').innerText = midVal;

    s.weeklyData.forEach((v, i) => {
        const hPercentage = (v / maxVal) * 100;
        chart.insertAdjacentHTML('beforeend', `<div class="bar-unit" style="height:${hPercentage}%; opacity:${v > 0 ? 1 : 0.2}"></div>`);
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        labelContainer.insertAdjacentHTML('beforeend', `<span class="day-label">${days[d.getDay()]}</span>`);
    });
    document.getElementById('weekly-title').innerText = `Total: ${s.weeklyTotal}`;

    // --- 4. LEGACY INSIGHTS (ALL-TIME) ---
    if (s.allTimeTotal > 0) {
        document.getElementById('legacy-projected').innerText = `${s.currentYearStr} PROJ: ${s.projectedYearly.toLocaleString()}`;
        document.getElementById('legacy-since').innerText = `SINCE ${s.firstDateStr}`;
        document.getElementById('legacy-active-days').innerText = `ACTIVE: ${s.activeDays} / ${s.totalDaysElapsed}`;
        
        document.getElementById('stat-all-time').innerText = s.allTimeTotal.toLocaleString();
        document.getElementById('stat-pb').innerText = s.pb.toLocaleString();
        document.getElementById('stat-ytd').innerText = s.ytdTotal.toLocaleString();
        document.getElementById('stat-century').innerText = s.centuryDays;
        document.getElementById('stat-avg').innerText = `${s.lifetimeAvg}/day`;

        // Milestone Progress
        document.getElementById('label-next-milestone').innerText = `NEXT MILESTONE: ${s.nextMilestone.toLocaleString()}`;
        const milestonePct = (s.allTimeTotal / s.nextMilestone) * 100;
        document.getElementById('milestone-fill').style.width = Math.min(milestonePct, 100) + "%";

        // Intensity Pill
        const total = s.allTimeTotal || 1;
        document.getElementById('pill-elite').style.width = (s.eliteVol / total * 100) + "%";
        document.getElementById('pill-solid').style.width = (s.solidVol / total * 100) + "%";
        document.getElementById('pill-light').style.width = (s.lightVol / total * 100) + "%";

        // Monthly Chart
        const monthlyChart = document.getElementById('monthly-chart');
        monthlyChart.innerHTML = '';
        const monthEntries = Object.entries(s.monthlyData);
        const maxMonth = Math.max(...monthEntries.map(([_, v]) => v), 1);

        monthEntries.forEach(([label, val]) => {
            const hPct = (val / maxMonth) * 100;

            monthlyChart.insertAdjacentHTML('beforeend', `
                <div class="monthly-bar-container">
                    
                    <div style="height: 60px; width: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center;">
                        
                        <span class="label-tiny chart-value" style="font-size: 0.6rem; margin-bottom: 2px; line-height: 1;">
                            ${val > 0 ? val : ''}
                        </span>

                        <div class="bar-unit legacy" style="height:${hPct}%; width: 20px; opacity:${val > 0 ? 1 : 0.2}; background-color: var(--accent-color); border-radius: 2px 2px 0 0;"></div>
                    </div>
                    
                    <span class="month-label" style="font-size: 0.6rem; margin-top: 4px;">
                        ${label.toUpperCase()}
                    </span>
                </div>
            `);
        });
    }
}
/*************************************************
 * LEADERBOARD LOGIC
 *************************************************/
async function fetchLeaderboard() {
    const lbList = document.getElementById('lb-list');
    
    // Determine which filter is active
    const activeBtn = document.querySelector('.seg-btn.active');
    const filter = activeBtn ? activeBtn.getAttribute('data-filter') : 'stats.week'; 
    
    // Destructure tools from our global toolbox (added 'where')
    const { collection, query, where, orderBy, limit, getDocs } = window.firebaseMethods;
    
    try {
        const usersRef = collection(window.db, "users");
        const now = new Date();
        let q;

        // --- Logic: Only fetch users whose ID matches the current time period ---
        if (filter === 'stats.week') {
            q = query(usersRef, 
                where("stats.weekId", "==", getWeekId(now)),
                orderBy("stats.week", "desc"), 
                limit(20)
            );
        } else if (filter === 'stats.month') {
            q = query(usersRef, 
                where("stats.monthId", "==", getMonthId(now)),
                orderBy("stats.month", "desc"), 
                limit(20)
            );
        } else if (filter === 'stats.year') {
            q = query(usersRef, 
                where("stats.yearId", "==", getYearId(now)),
                orderBy("stats.year", "desc"), 
                limit(20)
            );
        }

        const querySnapshot = await getDocs(q);
        lbList.innerHTML = ''; // Clear the loader

        // Handle empty results (e.g., first day of the week)
        if (querySnapshot.empty) {
            lbList.innerHTML = `<p class="h3" style="text-align:center; opacity:0.5; margin-top:40px;">No ranks yet this period. Be the first!</p>`;
            return;
        }

        let rank = 1;
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            // Get the field name (week, month, or year) from the filter string 'stats.week'
            const fieldName = filter.split('.')[1];
            const score = data.stats ? (data.stats[fieldName] || 0) : 0;
            
            const isMe = doc.id === window.auth.currentUser?.uid;

            const row = `
                <div class="lb-row ${isMe ? 'is-me' : ''}">
                    <span class="lb-rank">${rank}</span>
                    <span class="lb-name">${data.username || 'Anonymous'}</span>
                    <span class="lb-score">${score.toLocaleString()}</span>
                </div>
            `;
            lbList.insertAdjacentHTML('beforeend', row);
            rank++;
        });

    } catch (err) {
        console.error("Leaderboard fetch failed:", err);
        // If index is missing, this message helps debug
        lbList.innerHTML = `<p class="h3">Error loading ranks. If this is new, please wait for index building or check console.</p>`;
    }
}

// Button Click Handling
document.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        // UI: Toggle active class
        document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');

        // UI: Show loading state
        document.getElementById('lb-list').innerHTML = 
            '<p class="h3" style="text-align:center; opacity:0.5; margin-top: 40px;">Loading ranks...</p>';
        
        fetchLeaderboard();
    });
});

/*************************************************
 * LOGGING FLOW
 *************************************************/
floatingLogBtn.onclick = (e) => {
     
    logModal.style.display = 'flex';
    selectedEditDate = getDateKey(); 
    modalInput.value = '';
    modalInput.focus();
};

cancelBtn.onclick = () => logModal.style.display = 'none';

const logForm = document.getElementById('log-form');

logForm.onsubmit = (e) => {
    e.preventDefault();
    
    const reps = parseInt(modalInput.value);
    if (isNaN(reps) || reps <= 0) return;

    // 1. Save the data
    addSetToDate(selectedEditDate, reps);
    
    // 2. Close the modal
    logModal.style.display = 'none';
    modalInput.value = ''; 

    // 3. Scroll to the top of the page
    // Using a tiny timeout ensures the UI has updated before it scrolls
    setTimeout(() => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }, 100);
};

/*************************************************
 * SETTINGS LOGIC
 *************************************************/
// 1. Store the "currently selected date" globally
let selectedEditDate = getDateKey(); // Defaults to today

// 2. Setup the Date Picker
const datePicker = document.getElementById('edit-date-picker');
datePicker.value = selectedEditDate;

// 3. Update the view when the date changes
datePicker.addEventListener('change', (e) => {
    selectedEditDate = e.target.value; // e.g., "2024-05-20"
    renderEditList(); 
});

// Date Label
function updateDateLabel(dateKey) {
    const label = document.getElementById('display-date-label');
    const todayKey = getDateKey();
    
    if (dateKey === todayKey) {
        label.innerText = "Today";
    } else {
        // Formats "2026-01-30" into something nicer like "Jan 30, 2026"
        const dateObj = new Date(dateKey + 'T00:00:00'); // T00:00:00 prevents timezone shifts
        label.innerText = dateObj.toLocaleDateString(undefined, { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
        });
    }
}
// 4. Render Function
function renderEditList() {
    updateDateLabel(selectedEditDate);

    const data = loadData();
    // Instead of todayKey, we use the date from the picker
    const sets = data[selectedEditDate]?.[currentExercise] || [];

    editSetsList.innerHTML = '';

    if (sets.length === 0) {
        editSetsList.innerHTML = '<p class="h3" style="text-align:center;">No sets for this date.</p>';
        return;
    }

    sets.forEach((reps, i) => {
        editSetsList.insertAdjacentHTML('beforeend', `
            <div class="edit-item">
                <span>Set ${i + 1}: <strong>${reps}</strong></span>
                <button class="btn-delete" onclick="deleteSet(${i})">Delete</button>
            </div>
        `);
    });
}

// 5. Delete Function
window.deleteSet = (i) => {
    const data = loadData();
    // Use selectedEditDate so we delete from the day we are looking at!
    if (data[selectedEditDate] && data[selectedEditDate][currentExercise]) {
        data[selectedEditDate][currentExercise].splice(i, 1);
        saveData(data);
        renderEditList(); // Refresh the settings list
        updateDisplay();  // Refresh the main dashboard charts/streaks
    }
};
// Listener for the "Add Past Set" button
document.getElementById('btn-add-past').addEventListener('click', () => {
    
    modalInput.value = '';
    logModal.style.display = 'flex';
    modalInput.focus();
});

function addSetToDate(dateKey, reps) {
    const data = loadData();

    // 1. Ensure the date object exists
    if (!data[dateKey]) {
        data[dateKey] = {};
    }

    // 2. Ensure the exercise array exists for that date
    if (!data[dateKey][currentExercise]) {
        data[dateKey][currentExercise] = [];
    }

    // 3. Push the new reps into the array
    data[dateKey][currentExercise].push(reps);

    // 4. Save and Refresh everything
    saveData(data);
    renderEditList(); // Refresh the list you are looking at
    updateDisplay();  // Force the charts and streaks to recalculate
}
/*************************************************
 * Import/Export/Clear Data Functions
 *************************************************/
async function exportData() {
    const data = localStorage.getItem('workout-data') || '{}';
    const blob = new Blob([data], { type: 'application/json' });
    const fileName = `pushups-backup-${new Date().toISOString().slice(0,10)}.json`;
    const file = new File([blob], fileName, { type: 'application/json' });

    // Check if sharing is supported AND allowed
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                files: [file],
                title: 'Push-Up Tracker Backup',
            });
            return; // Success!
        } catch (err) {
            // If user cancels or permission denied, fall through to download
            console.log("Share skipped or blocked, falling back to download.");
        }
    }

    // FALLBACK: Standard Download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a); // Required for some browsers
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}




// Start
updateDisplay();
// Call this for PWA VERSION & UPDATE LOGIC
initPWAUtils();
//Leaderboard sync
initAuthListener();

async function initApp() {
    console.log("Initializing/Refreshing App Data...");
    // Update all UI elements
    updateDisplay();
    console.log("App state is now current.");
}
// A. Run when the page first loads
window.addEventListener('DOMContentLoaded', initApp);
// B. Run whenever the user "switches back" to the app (PWA resume)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        initApp();
    }
});
// C. Run when the window gets focus (extra safety for desktop/laptops)
window.addEventListener('focus', initApp);
