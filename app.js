const todayCountDisplay = document.getElementById('today-count');
const inputField = document.getElementById('pushup-input');
const logBtn = document.getElementById('log-btn');
const historyList = document.getElementById('history-list');
const editSetsList = document.getElementById('edit-sets-list');

// Page Elements
const trackerPage = document.getElementById('tracker-page');
const settingsPage = document.getElementById('settings-page');

// Nav Buttons
const goToSettingsBtn = document.getElementById('go-to-settings');
const backToTrackerBtn = document.getElementById('back-to-tracker');

// NAVIGATION LOGIC
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

let currentExercise = "pushups";

const GOALS = {
    DAYS_PER_WEEK: 7,
    ON_TRACK_DAYS: 4,
    IMPROVE_DAYS: 5, 
    WINDOW_DAYS: 30
};

function computeStats() {
    const data = JSON.parse(localStorage.getItem('workout-data') || '{}');
    const today = new Date();
    
    const getVal = (dateObj) => {
        const k = dateObj.toISOString().split('T')[0];
        return (data[k] && data[k][currentExercise]) ? data[k][currentExercise].reduce((a, b) => a + b, 0) : 0;
    };

    const getDateKey = (date) => date.toISOString().split('T')[0];

    // Basic Totals
    const todayTotal = getVal(today);
    const yest = new Date(); yest.setDate(yest.getDate() - 1);
    const yesterdayTotal = getVal(yest);

    // Weekly Data & Total
    let weeklyData = [];
    let weeklyTotal = 0;
    for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const v = getVal(d);
        weeklyData.push(v);
        weeklyTotal += v;
    }

    // Daily Goal Logic (Avg/Median of last 14 active days)
    let activeValues = [];
    for (let i = 1; i <= 30 && activeValues.length < 14; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const v = getVal(d);
        if (v > 0) activeValues.push(v);
    }

    let dailyGoal = 60; // Your floor
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
        const d = new Date(); d.setDate(d.getDate() - i);
        total30 += getVal(d);
    }
    const avg30 = Number((total30 / 30).toFixed(1));

    // Streaks
    let streak = todayTotal > 0 ? 1 : 0;
    for (let i = 1; i < 30; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        if (getVal(d) > 0) streak++; else break;
    }

    // Best Streak
    const allKeys = Object.keys(data).sort();
    let bestStreak = 0, currentStreak = 0;
    if (allKeys.length) {
        let d = new Date(allKeys[0]);
        const last = new Date();
        while (d <= last) {
            if (getVal(d) > 0) currentStreak++; else currentStreak = 0;
            bestStreak = Math.max(bestStreak, currentStreak);
            d.setDate(d.getDate() + 1);
        }
    }

    // Rest Days
    let restStreak = 0;
    for (let i = 0; i < 30; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        if (getVal(d) === 0) restStreak++; else break;
    }

    const rest14 = Array.from({ length: 14 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - i);
        return getVal(d) === 0 ? 1 : 0;
    }).reduce((a, b) => a + b, 0);

    const active30 = Object.keys(data).filter(k => {
        const d = new Date(); d.setDate(d.getDate() - 29);
        return k >= getDateKey(d) && k <= getDateKey(today) && (data[k][currentExercise] || []).length > 0;
    }).length;

    // Trend Label
    const trendPct = avg30 / dailyGoal;
    let trend = { label: "Below Target", color: "#ff3b30" };
    if (trendPct >= (GOALS.IMPROVE_DAYS / GOALS.DAYS_PER_WEEK)) {
        trend = { label: "Improving", color: "#007aff" };
    } else if (trendPct >= (GOALS.ON_TRACK_DAYS / GOALS.DAYS_PER_WEEK)) {
        trend = { label: "On Track", color: "#34c759" };
    }

    return {
        todayTotal, yesterdayTotal, weeklyTotal, dailyGoal, thirtyGoal,
        thirtyImprov, streak, bestStreak, restStreak, rest14,
        total30, avg30, active30, trend, weeklyData
    };
}

function updateDisplay() {
    const s = computeStats();

    // 1. Daily Progress Section
    document.getElementById('today-val').innerText = s.todayTotal;
    document.getElementById('yest-val').innerText = s.yesterdayTotal;
    document.getElementById('goal-text').innerText = `Goal: ${s.dailyGoal}`;
    
    const pct = s.todayTotal / s.dailyGoal;
    document.getElementById('progress-bar-green').style.width = Math.min(pct, 1) * 100 + "%";
    document.getElementById('progress-bar-blue').style.width = pct > 1 ? Math.min(pct - 1, 1) * 100 + "%" : "0%";

    // 2. Streaks & Rest
    document.getElementById('streak-val').innerText = s.streak;
    document.getElementById('rest-val').innerText = s.rest14;

    // 3. Weekly Chart
    const chart = document.getElementById('bar-chart');
    chart.innerHTML = '';
    const maxWeek = Math.max(...s.weeklyData, 1);
    s.weeklyData.forEach(v => {
        const h = (v / maxWeek) * 50;
        chart.insertAdjacentHTML('beforeend', `<div class="bar-unit" style="height:${h}px; opacity:${v > 0 ? 1 : 0.3}"></div>`);
    });
    document.getElementById('weekly-title').innerText = `Last 7 Days: ${s.weeklyTotal}`;

    // 4. 30-Day Trend
    const trendFill = document.getElementById('trend-fill');
    const trendPct30 = (s.total30 / s.thirtyImprov) * 100;
    trendFill.style.width = Math.min(trendPct30, 100) + "%";
    
    document.getElementById('trend-label').innerText = s.trend.label;
    document.getElementById('trend-label').style.color = s.trend.color;
    document.getElementById('avg-30').innerText = `Avg: ${s.avg30}/day`;
}

function renderEditList() {
    const today = new Date().toISOString().split('T')[0];
    const data = JSON.parse(localStorage.getItem('workout-data') || '{}');
    const todaySets = (data[today] && data[today][currentExercise]) ? data[today][currentExercise] : [];

    editSetsList.innerHTML = '';
    todaySets.forEach((reps, index) => {
        const div = document.createElement('div');
        div.className = 'edit-item';
        div.innerHTML = `
            <span>Set ${index + 1}: <strong>${reps}</strong></span>
            <button class="btn-delete" onclick="deleteSet(${index})">Delete</button>
        `;
        editSetsList.appendChild(div);
    });
}

window.deleteSet = (index) => {
    const today = new Date().toISOString().split('T')[0];
    let data = JSON.parse(localStorage.getItem('workout-data') || '{}');
    data[today][currentExercise].splice(index, 1);
    localStorage.setItem('workout-data', JSON.stringify(data));
    renderEditList();
};

logBtn.addEventListener('click', () => {
    const today = new Date().toISOString().split('T')[0];
    let data = JSON.parse(localStorage.getItem('workout-data') || '{}');
    if (!data[today]) data[today] = {};
    if (!data[today][currentExercise]) data[today][currentExercise] = [];
    data[today][currentExercise].push(parseInt(inputField.value));
    localStorage.setItem('workout-data', JSON.stringify(data));
    updateDisplay();
});

document.getElementById('plus-btn').onclick = () => inputField.value = parseInt(inputField.value) + 1;
document.getElementById('minus-btn').onclick = () => inputField.value = Math.max(0, parseInt(inputField.value) - 1);

updateDisplay();