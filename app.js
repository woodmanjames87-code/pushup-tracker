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

let currentExercise = "pushups";

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

function updateDisplay() {
    const data = JSON.parse(localStorage.getItem('workout-data') || '{}');
    const today = new Date().toISOString().split('T')[0];
    
    // --- PORTED SCRIPTABLE STATS ENGINE ---
    const getVal = (dateObj) => {
        const k = dateObj.toISOString().split('T')[0];
        return (data[k] && data[k]["pushups"]) ? data[k]["pushups"].reduce((a,b)=>a+b,0) : 0;
    };

    const todayTotal = getVal(new Date());
    
    // Calculate Daily Goal (Avg/Median of last 14 active days)
    let activeValues = [];
    for (let i = 1; i <= 30 && activeValues.length < 14; i++) {
        let d = new Date(); d.setDate(d.getDate() - i);
        let v = getVal(d);
        if (v > 0) activeValues.push(v);
    }

    let dailyGoal = 70;
    if (activeValues.length > 0) {
        const avg = activeValues.reduce((a,b)=>a+b,0) / activeValues.length;
        const sorted = [...activeValues].sort((a,b)=>a-b);
        const median = sorted[Math.floor(sorted.length/2)];
        dailyGoal = Math.max(60, Math.ceil(Math.max(avg, median) / 5) * 5);
    }

    // --- UPDATE UI ---
    document.getElementById('today-val').innerText = todayTotal;
    document.getElementById('goal-text').innerText = `Goal: ${dailyGoal}`;
    
    // Progress Bar Logic
    const pct = todayTotal / dailyGoal;
    document.getElementById('progress-bar-green').style.width = Math.min(pct, 1) * 100 + "%";
    document.getElementById('progress-bar-blue').style.width = pct > 1 ? Math.min(pct - 1, 1) * 100 + "%" : "0%";

    // Render Weekly Chart (Last 7 Days)
    const chart = document.getElementById('bar-chart');
    chart.innerHTML = '';
    let weekTotal = 0;
    let weekVals = [];
    for (let i = 6; i >= 0; i--) {
        let d = new Date(); d.setDate(d.getDate() - i);
        let v = getVal(d);
        weekVals.push(v);
        weekTotal += v;
    }
    const maxWeek = Math.max(...weekVals, 1);
    weekVals.forEach(v => {
        const h = (v / maxWeek) * 50;
        chart.insertAdjacentHTML('beforeend', `<div class="bar-unit" style="height:${h}px"></div>`);
    });
    document.getElementById('weekly-title').innerText = `Last 7 Days: ${weekTotal}`;
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