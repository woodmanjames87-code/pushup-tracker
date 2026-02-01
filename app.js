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