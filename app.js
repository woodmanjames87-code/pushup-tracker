const todayCountDisplay = document.getElementById('today-count');
const inputField = document.getElementById('pushup-input');
const logBtn = document.getElementById('log-btn');

// Load data on startup
function updateDisplay() {
    const today = new Date().toISOString().split('T')[0];
    const data = JSON.parse(localStorage.getItem('pushup-data') || '{}');
    todayCountDisplay.innerText = data[today] || 0;
}

logBtn.addEventListener('click', () => {
    const today = new Date().toISOString().split('T')[0];
    const countToAdd = parseInt(inputField.value);
    
    let data = JSON.parse(localStorage.getItem('pushup-data') || '{}');
    data[today] = (data[today] || 0) + countToAdd;
    
    localStorage.setItem('pushup-data', JSON.stringify(data));
    updateDisplay();
});

// Increment/Decrement buttons
document.getElementById('plus-btn').onclick = () => inputField.value = parseInt(inputField.value) + 5;
document.getElementById('minus-btn').onclick = () => inputField.value = Math.max(0, parseInt(inputField.value) - 5);

updateDisplay();