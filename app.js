const todayCountDisplay = document.getElementById('today-count');
const inputField = document.getElementById('pushup-input');
const logBtn = document.getElementById('log-btn');
const historyList = document.getElementById('history-list');

function updateDisplay() {
    const today = new Date().toISOString().split('T')[0];
    const data = JSON.parse(localStorage.getItem('pushup-data') || '{}');
    
    // Update Today's Big Number
    todayCountDisplay.innerText = data[today] || 0;

    // Update History List
    historyList.innerHTML = ''; // Clear current list
    
    // Generate last 7 days
    for (let i = 0; i < 7; i++) {
        let d = new Date();
        d.setDate(d.getDate() - i);
        let dateStr = d.toISOString().split('T')[0];
        let count = data[dateStr] || 0;

        // Create the list item
        const li = document.createElement('li');
        li.className = 'history-item';
        li.innerHTML = `
            <span class="history-date">${i === 0 ? 'Today' : dateStr}</span>
            <span class="history-val">${count}</span>
        `;
        historyList.appendChild(li);
    }
}

logBtn.addEventListener('click', () => {
    const today = new Date().toISOString().split('T')[0];
    const countToAdd = parseInt(inputField.value);
    
    let data = JSON.parse(localStorage.getItem('pushup-data') || '{}');
    data[today] = (data[today] || 0) + countToAdd;
    
    localStorage.setItem('pushup-data', JSON.stringify(data));
    updateDisplay();
});

document.getElementById('plus-btn').onclick = () => inputField.value = parseInt(inputField.value) + 5;
document.getElementById('minus-btn').onclick = () => inputField.value = Math.max(0, parseInt(inputField.value) - 5);

updateDisplay();