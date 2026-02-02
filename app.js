if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(() => console.log("Offline Mode Active"))
    .catch(err => console.log("Offline Mode Failed", err));
}
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
 * STORAGE HELPERS
 *************************************************/
function loadData() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
}

function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

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

/*************************************************
 * NAVIGATION
 *************************************************/
goToSettingsBtn.onclick = () => {
    trackerPage.style.display = 'none';
    settingsPage.style.display = 'flex';
    floatingLogBtn.style.display = 'none';
    selectedEditDate = getDateKey();
    datePicker.value = selectedEditDate;
    renderEditList();
};

backToTrackerBtn.onclick = () => {
    settingsPage.style.display = 'none';
    trackerPage.style.display = 'flex';
    floatingLogBtn.style.display = 'block';
    updateDisplay();
};

/*************************************************
 * LOGGING FLOW
 *************************************************/
floatingLogBtn.onclick = () => {
    selectedEditDate = getDateKey(); // Reset the date to TODAY
    modalInput.value = '';
    logModal.style.display = 'flex';

    modalInput.inputMode = "decimal";
    setTimeout(() => {
        modalInput.focus();
        // This 'click' simulates a second interaction to force the keyboard
        modalInput.click(); 
    }, 50); 
};

cancelBtn.onclick = () => logModal.style.display = 'none';

const logForm = document.getElementById('log-form');

logForm.onsubmit = (e) => {
    e.preventDefault();
    
    const reps = parseInt(modalInput.value);
    if (isNaN(reps) || reps <= 0) return;

    // Use our universal helper function instead of manual logic
    addSetToDate(selectedEditDate, reps);
    
    logModal.style.display = 'none';
    modalInput.value = ''; // Clean up for next time
};

/*************************************************
 * STATS ENGINE 
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
    // We start from yesterday if today's total is 0
    let startDay = getDayTotal(data, today) > 0 ? -1 : 0; 
    for (let i = startDay === -1 ? 0 : 0; i < 365; i++) {
        const d = new Date(); d.setDate(today.getDate() - i);
        if (getDayTotal(data, d) === 0) restStreak++; else break;
    }
    if (getDayTotal(data, today) > 0) restStreak = 0;

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

    return { todayTotal, yesterdayTotal, weeklyTotal, dailyGoal, thirtyGoal, active30, restStreak, streak, bestStreak, rest14, total30, avg30, trend, thirtyImprov, weeklyData };
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

    document.getElementById('total-30-val').innerText = s.total30;
    document.getElementById('trend-label').innerText = `Trend: ${s.trend.label}`;
    document.getElementById('trend-label').style.color = s.trend.color;

    document.getElementById('active-30-val').innerText = `${s.active30}/30`;
    document.getElementById('avg-30').innerText = `${s.avg30}/day`;

    document.getElementById('thirty-goal-val').innerText = s.thirtyGoal;
    document.getElementById('thirty-improv-val').innerText = s.thirtyImprov;

    const restStreakTag = document.getElementById('rest-streak-tag');
        if (s.restStreak > 0) {
            restStreakTag.style.display = 'inline-flex'; // Changed to inline-flex to match tags
           document.getElementById('rest-streak-val').innerText = s.restStreak;
        } else {
            restStreakTag.style.display = 'none';
        }

    // 3. Weekly Chart, Labels, and Axes
const chart = document.getElementById('bar-chart');
const labelContainer = document.getElementById('bar-labels');
chart.innerHTML = '';
labelContainer.innerHTML = '';

const days = ['Su', 'M', 'T', 'W', 'Th', 'F', 'Sa'];
const maxVal = Math.max(...s.weeklyData, 1);
const midVal = Math.round(maxVal / 2);

// Update Side Numbers
document.getElementById('axis-max-l').innerText = maxVal;
document.getElementById('axis-max-r').innerText = maxVal;
document.getElementById('axis-mid-l').innerText = midVal;
document.getElementById('axis-mid-r').innerText = midVal;

s.weeklyData.forEach((v, i) => {
    // 1. Create Bar
    const hPercentage = (v / maxVal) * 100;
    chart.insertAdjacentHTML('beforeend', `
        <div class="bar-unit" style="height:${hPercentage}%; opacity:${v > 0 ? 1 : 0.2}"></div>
    `);
    
    // 2. Create Day Label
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayLetter = days[d.getDay()];
    labelContainer.insertAdjacentHTML('beforeend', `<span class="day-label">${dayLetter}</span>`);
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
// 1. We need to store the "currently selected date" globally
let selectedEditDate = getDateKey(); // Defaults to today

// 2. Setup the Date Picker
const datePicker = document.getElementById('edit-date-picker');
datePicker.value = selectedEditDate;

// 3. Update the view when the date changes
datePicker.addEventListener('change', (e) => {
    selectedEditDate = e.target.value; // e.g., "2024-05-20"
    renderEditList(); 
});

// Update Date Label
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
// 4. Your updated Render Function
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

// 5. Your updated Delete Function
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
    // 1. Prepare the modal
    modalInput.value = '';
    logModal.style.display = 'flex';
    
    // 2. Set input mode to force the number pad
    modalInput.inputMode = "decimal"; 
    
    // 3. Focus it so the keyboard slides up automatically
    setTimeout(() => {
        modalInput.focus();
        modalInput.click(); 
    }, 50); 
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
// Start
updateDisplay();