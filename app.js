/*************************************************
 * DOM REFERENCES
 *************************************************/
const logBtn = document.getElementById('log-btn');
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
 * STORAGE HELPERS
 *************************************************/
function loadData() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
}

function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getDateKey(date = new Date()) {
    return date.toISOString().split('T')[0];
}

function getDayTotal(data, date) {
    const key = getDateKey(date);
    return (data[key] && data[key][currentExercise]) ? data[key][currentExercise].reduce((a, b) => a + b, 0) : 0;
}

/*************************************************
 * NAVIGATION
 *************************************************/
goToSettingsBtn.onclick = () => {
    trackerPage.style.display = 'none';
    settingsPage.style.display = 'flex';
    renderEditList();
};

backToTrackerBtn.onclick = () => {
    settingsPage.style.display = 'none';
    trackerPage.style.display = 'flex';
    updateDisplay();
};

/*************************************************
 * LOGGING FLOW
 *************************************************/
logBtn.onclick = () => {
    modalInput.value = '';
    logModal.style.display = 'flex';
    setTimeout(() => modalInput.focus(), 50);
};

cancelBtn.onclick = () => logModal.style.display = 'none';

okBtn.onclick = () => {
    const reps = parseInt(modalInput.value);
    if (isNaN(reps) || reps <= 0) return;

    const data = loadData();
    const todayKey = getDateKey();
    
    if (!data[todayKey]) data[todayKey] = {};
    if (!data[todayKey][currentExercise]) data[todayKey][currentExercise] = [];
    
    data[todayKey][currentExercise].push(reps);
    saveData(data);
    
    logModal.style.display = 'none';
    updateDisplay();
};

/*************************************************
 * STATS ENGINE (Merged & Complete)
 *************************************************/
function computeStats() {
    const data = loadData();
    const today = new Date();
    
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
    const thirtyImprov = Math.round(dailyGoal * GOALS.WINDOW_DAYS * (GOALS.IMPROVE_DAYS / GOALS.DAYS_PER_WEEK));
    let total30 = 0;
    for (let i = 0; i < 30; i++) {
        const d = new Date(); d.setDate(today.getDate() - i);
        total30 += getDayTotal(data, d);
    }
    const avg30 = Number((total30 / 30).toFixed(1));

    // Streaks
    let streak = todayTotal > 0 ? 1 : 0;
    for (let i = 1; i < 30; i++) {
        const d = new Date(); d.setDate(today.getDate() - i);
        if (getDayTotal(data, d) > 0) streak++; else break;
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

    // Rest Days (Last 14)
    const rest14 = Array.from({ length: 14 }, (_, i) => {
        const d = new Date(); d.setDate(today.getDate() - i);
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

    return { todayTotal, yesterdayTotal, weeklyTotal, dailyGoal, streak, bestStreak, rest14, total30, avg30, trend, thirtyImprov, weeklyData };
}

/*************************************************
 * UI RENDERING
 *************************************************/
function updateDisplay() {
    const s = computeStats();

    document.getElementById('today-val').innerText = s.todayTotal;
    document.getElementById('yest-val').innerText = s.yesterdayTotal;
    document.getElementById('goal-text').innerText = `Goal: ${s.dailyGoal}`;
    
    const pct = s.todayTotal / s.dailyGoal;
    document.getElementById('progress-bar-green').style.width = Math.min(pct, 1) * 100 + "%";
    document.getElementById('progress-bar-blue').style.width = pct > 1 ? Math.min(pct - 1, 1) * 100 + "%" : "0%";

    document.getElementById('streak-val').innerText = s.streak;
    document.getElementById('rest-val').innerText = s.rest14;

    const chart = document.getElementById('bar-chart');
    chart.innerHTML = '';
    const maxWeek = Math.max(...s.weeklyData, 1);
    s.weeklyData.forEach(v => {
        const h = (v / maxWeek) * 50;
        chart.insertAdjacentHTML('beforeend', `<div class="bar-unit" style="height:${h}px; opacity:${v > 0 ? 1 : 0.3}"></div>`);
    });
    document.getElementById('weekly-title').innerText = `Last 7 Days: ${s.weeklyTotal}`;

    const trendPct30 = (s.total30 / s.thirtyImprov) * 100;
    document.getElementById('trend-fill').style.width = Math.min(trendPct30, 100) + "%";
    document.getElementById('trend-label').innerText = s.trend.label;
    document.getElementById('trend-label').style.color = s.trend.color;
    document.getElementById('avg-30').innerText = `Avg: ${s.avg30}/day`;
}

/*************************************************
 * SETTINGS LOGIC
 *************************************************/
function renderEditList() {
    const data = loadData();
    const todayKey = getDateKey();
    const sets = data[todayKey]?.[currentExercise] || [];

    editSetsList.innerHTML = '';
    sets.forEach((reps, i) => {
        editSetsList.insertAdjacentHTML('beforeend', `
            <div class="edit-item">
                <span>Set ${i + 1}: <strong>${reps}</strong></span>
                <button class="btn-delete" onclick="deleteSet(${i})">Delete</button>
            </div>
        `);
    });
}

window.deleteSet = (i) => {
    const data = loadData();
    const todayKey = getDateKey();
    data[todayKey][currentExercise].splice(i, 1);
    saveData(data);
    renderEditList();
    updateDisplay();
};

// Start
updateDisplay();