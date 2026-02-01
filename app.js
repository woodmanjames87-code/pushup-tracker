const todayCountDisplay = document.getElementById('today-count');
const inputField = document.getElementById('pushup-input');
const logBtn = document.getElementById('log-btn');
const historyList = document.getElementById('history-list');

// We'll define the current exercise here so we can easily change it later
let currentExercise = "pushups";

function updateDisplay() {
    const today = new Date().toISOString().split('T')[0];
    const data = JSON.parse(localStorage.getItem('workout-data') || '{}');
    
    // Get the array of sets for today, e.g., [10, 10, 12]
    const todaySets = (data[today] && data[today][currentExercise]) ? data[today][currentExercise] : [];
    
    // Calculate Total Reps and Total Sets
    const totalReps = todaySets.reduce((a, b) => a + b, 0);
    const setCount = todaySets.length;
    
    // Display total reps and set count
    todayCountDisplay.innerHTML = `${totalReps} <div style="font-size: 1rem; color: #888;">${setCount} Sets</div>`;

    // Update History List
    historyList.innerHTML = ''; 
    for (let i = 0; i < 7; i++) {
        let d = new Date();
        d.setDate(d.getDate() - i);
        let dateStr = d.toISOString().split('T')[0];
        
        const dayData = data[dateStr] && data[dateStr][currentExercise] ? data[dateStr][currentExercise] : [];
        const dayTotal = dayData.reduce((a, b) => a + b, 0);
        const daySets = dayData.length;

        const li = document.createElement('li');
        li.className = 'history-item';
        li.innerHTML = `
            <span class="history-date">${i === 0 ? 'Today' : dateStr}</span>
            <span class="history-val">${dayTotal} <small>(${daySets}s)</small></span>
        `;
        historyList.appendChild(li);
    }
}

logBtn.addEventListener('click', () => {
    const today = new Date().toISOString().split('T')[0];
    const repsInSet = parseInt(inputField.value);
    
    let data = JSON.parse(localStorage.getItem('workout-data') || '{}');
    
    // Ensure the date object and the exercise array exist
    if (!data[today]) data[today] = {};
    if (!data[today][currentExercise]) data[today][currentExercise] = [];
    
    // Push the new set into the array
    data[today][currentExercise].push(repsInSet);
    
    localStorage.setItem('workout-data', JSON.stringify(data));
    updateDisplay();
});

document.getElementById('plus-btn').onclick = () => inputField.value = parseInt(inputField.value) + 1;
document.getElementById('minus-btn').onclick = () => inputField.value = Math.max(0, parseInt(inputField.value) - 1);

updateDisplay();

// Navigation Elements
const trackerPage = document.getElementById('tracker-page');
const settingsPage = document.getElementById('settings-page');
const goToSettingsBtn = document.getElementById('go-to-settings');
const backToTrackerBtn = document.getElementById('back-to-tracker');
const editSetsList = document.getElementById('edit-sets-list');

// Navigation Logic
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

// Render the list of sets with Delete buttons
function renderEditList() {
    const today = new Date().toISOString().split('T')[0];
    const data = JSON.parse(localStorage.getItem('workout-data') || '{}');
    const todaySets = (data[today] && data[today][currentExercise]) ? data[today][currentExercise] : [];

    editSetsList.innerHTML = '';
    
    todaySets.forEach((reps, index) => {
        const div = document.createElement('div');
        div.className = 'edit-item';
        div.innerHTML = `
            <span>Set ${index + 1}: <strong>${reps}</strong> reps</span>
            <button class="btn-delete" onclick="deleteSet(${index})">Delete</button>
        `;
        editSetsList.appendChild(div);
    });
}

// Global function to delete a specific set
window.deleteSet = (index) => {
    const today = new Date().toISOString().split('T')[0];
    let data = JSON.parse(localStorage.getItem('workout-data') || '{}');
    
    // Remove the set at the given index
    data[today][currentExercise].splice(index, 1);
    
    localStorage.setItem('workout-data', JSON.stringify(data));
    renderEditList(); // Refresh the settings list
};