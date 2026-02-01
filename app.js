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
    const today = new Date().toISOString().split('T')[0];
    const data = JSON.parse(localStorage.getItem('workout-data') || '{}');
    const todaySets = (data[today] && data[today][currentExercise]) ? data[today][currentExercise] : [];
    
    const totalReps = todaySets.reduce((a, b) => a + b, 0);
    todayCountDisplay.innerHTML = `${totalReps} <div style="font-size: 1rem; color: #888;">${todaySets.length} Sets</div>`;

    historyList.innerHTML = ''; 
    for (let i = 0; i < 7; i++) {
        let d = new Date();
        d.setDate(d.getDate() - i);
        let dateStr = d.toISOString().split('T')[0];
        const dayData = data[dateStr] && data[dateStr][currentExercise] ? data[dateStr][currentExercise] : [];
        const dayTotal = dayData.reduce((a, b) => a + b, 0);

        const li = document.createElement('li');
        li.className = 'history-item';
        li.innerHTML = `<span>${i === 0 ? 'Today' : dateStr}</span><strong>${dayTotal}</strong>`;
        historyList.appendChild(li);
    }
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