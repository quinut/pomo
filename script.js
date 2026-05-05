const MODES = {
    POMODORO: { time: 25 * 60, id: 'btn-pomodoro', text: 'Time to focus!', orb1: ['#ff7e67', '#ff5757'], orb2: ['#4facfe', '#00f2fe'], key: 'POMODORO' },
    SHORT_BREAK: { time: 5 * 60, id: 'btn-shortbreak', text: 'Time for a break!', orb1: ['#4facfe', '#00f2fe'], orb2: ['#43e97b', '#38f9d7'], key: 'SHORT_BREAK' },
    LONG_BREAK: { time: 15 * 60, id: 'btn-longbreak', text: 'Time for a long break!', orb1: ['#43e97b', '#38f9d7'], orb2: ['#fa709a', '#fee140'], key: 'LONG_BREAK' }
};

let currentMode = MODES.POMODORO;
let timeLeft = currentMode.time;
let timerId = null;
let isRunning = false;

// DOM Elements
const timeDisplay = document.getElementById('time-left');
const playBtn = document.getElementById('btn-play');
const resetBtn = document.getElementById('btn-reset');
const statusText = document.getElementById('status-text');
const modeBtns = document.querySelectorAll('.mode-btn');
const btnPlus = document.getElementById('btn-plus');
const btnMinus = document.getElementById('btn-minus');

// Auth & Realtime Elements
const loginOverlay = document.getElementById('login-overlay');
const btnCloseLogin = document.getElementById('btn-close-login');
const btnShowLogin = document.getElementById('btn-show-login');
const btnMockLogin = document.getElementById('btn-mock-login');
const usernameInput = document.getElementById('username-input');
const btnLogout = document.getElementById('btn-logout');
const onlineUsersList = document.getElementById('online-users-list');

// Todo Elements
const todoInput = document.getElementById('todo-input');
const btnAddTodo = document.getElementById('btn-add-todo');
const todoList = document.getElementById('todo-list');
const btnClearTodos = document.getElementById('btn-clear-todos');

// Background Orbs
const orb1 = document.querySelector('.orb-1');
const orb2 = document.querySelector('.orb-2');

let currentUser = null;
let ws = null;

function updateAuthState() {
    if (currentUser) {
        loginOverlay.style.display = 'none';
        btnShowLogin.style.display = 'none';
        btnLogout.style.display = 'inline-block';
        initRealtime();
    } else {
        btnShowLogin.style.display = 'inline-block';
        btnLogout.style.display = 'none';
        if (ws) {
            ws.close();
            ws = null;
        }
        renderOnlineUsers([]);
    }
}

// Initialization
function init() {
    // Check if user is in localStorage
    const savedUser = localStorage.getItem('pomodoroUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
    }
    
    updateAuthState();
    updateDisplay();
    updateBackgroundColors(currentMode);
    loadTodos();
}

// Todo Logic
let todos = [];

function loadTodos() {
    const savedTodos = localStorage.getItem('pomodoroTodos');
    if (savedTodos) {
        todos = JSON.parse(savedTodos);
    }
    renderTodos();
}

function saveTodos() {
    localStorage.setItem('pomodoroTodos', JSON.stringify(todos));
}

function renderTodos() {
    todoList.innerHTML = '';
    todos.forEach((todo, index) => {
        const li = document.createElement('li');
        li.className = `todo-item ${todo.completed ? 'completed' : ''}`;
        
        li.innerHTML = `
            <input type="checkbox" class="todo-checkbox" ${todo.completed ? 'checked' : ''}>
            <span class="todo-text">${todo.text}</span>
            <button class="todo-delete"><i class="ri-close-line"></i></button>
        `;

        const checkbox = li.querySelector('.todo-checkbox');
        checkbox.addEventListener('change', () => {
            todos[index].completed = checkbox.checked;
            saveTodos();
            renderTodos();
        });

        const deleteBtn = li.querySelector('.todo-delete');
        deleteBtn.addEventListener('click', () => {
            todos.splice(index, 1);
            saveTodos();
            renderTodos();
        });

        todoList.appendChild(li);
    });
}

function addTodo() {
    const text = todoInput.value.trim();
    if (text) {
        todos.push({ text, completed: false });
        todoInput.value = '';
        saveTodos();
        renderTodos();
    }
}

btnAddTodo.addEventListener('click', addTodo);
todoInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTodo();
});

btnClearTodos.addEventListener('click', () => {
    todos = todos.filter(t => !t.completed);
    saveTodos();
    renderTodos();
});

// Auth Handlers
btnShowLogin.addEventListener('click', () => {
    loginOverlay.style.display = 'flex';
});

btnCloseLogin.addEventListener('click', () => {
    loginOverlay.style.display = 'none';
});

btnMockLogin.addEventListener('click', async () => {
    const username = usernameInput.value.trim() || 'Guest';
    try {
        const response = await fetch('http://localhost:3000/api/mock-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        const data = await response.json();
        if (data.success) {
            currentUser = data.user;
            localStorage.setItem('pomodoroUser', JSON.stringify(currentUser));
            loginOverlay.style.display = 'none';
            updateAuthState();
        }
    } catch (e) {
        console.error('Login failed. Is the server running?', e);
        alert('Could not connect to the backend server. Make sure it is running on port 3000.');
    }
});

btnLogout.addEventListener('click', () => {
    currentUser = null;
    localStorage.removeItem('pomodoroUser');
    updateAuthState();
});

// Realtime Presence via Native WebSocket
function initRealtime() {
    if (ws) return;

    ws = new WebSocket('ws://localhost:3000/ws');

    ws.onopen = () => {
        console.log('Connected to WebSocket server');
        broadcastState('join');
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'presence') {
                renderOnlineUsers(data.payload);
            }
        } catch (e) {
            console.error('Error parsing WebSocket message', e);
        }
    };

    ws.onclose = () => {
        console.log('Disconnected from WebSocket server');
        ws = null;
        // Optionally try to reconnect here
    };
}

function broadcastState(eventType = 'sync') {
    if (!ws || ws.readyState !== WebSocket.OPEN || !currentUser) return;
    
    const statusData = {
        id: currentUser.id,
        name: currentUser.name,
        avatar_url: currentUser.avatar_url,
        mode: currentMode.key,
        isRunning: isRunning,
        timeLeft: timeLeft
    };

    ws.send(JSON.stringify({
        type: eventType,
        payload: statusData
    }));
}

function renderOnlineUsers(users) {
    onlineUsersList.innerHTML = '';
    
    if (!users || users.length === 0) {
        onlineUsersList.innerHTML = '<li style="color: var(--text-secondary); text-align: center; font-size: 0.9rem;">No one is online right now.</li>';
        return;
    }

    users.forEach(user => {
        const li = document.createElement('li');
        li.className = 'user-item';
        
        const avatar = user.avatar_url 
            ? `<img src="${user.avatar_url}" alt="${user.name}">` 
            : user.name.charAt(0).toUpperCase();

        let statusText = '';
        if (user.mode === 'POMODORO') statusText = 'Focusing';
        else if (user.mode === 'SHORT_BREAK') statusText = 'Short Break';
        else if (user.mode === 'LONG_BREAK') statusText = 'Long Break';

        if (user.isRunning) statusText += ' (Running)';
        else statusText += ' (Paused)';

        li.innerHTML = `
            <div class="user-avatar">${avatar}</div>
            <div class="user-info">
                <span class="user-name">${user.name}</span>
                <span class="user-status">
                    <span class="status-indicator ${user.mode}"></span>
                    ${statusText}
                </span>
            </div>
        `;
        onlineUsersList.appendChild(li);
    });
}


// Core Timer Logic
function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function updateDisplay() {
    timeDisplay.textContent = formatTime(timeLeft);
    document.title = `${formatTime(timeLeft)} - Pomodoro`;
}

function stopTimer() {
    clearInterval(timerId);
    timerId = null;
    isRunning = false;
    playBtn.innerHTML = '<i class="ri-play-fill"></i>';
    broadcastState();
}

function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }
}

function playBeep() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 600;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1);
}

function notifyUser(message) {
    playBeep();
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Pomodoro Timer", { body: message });
    } else {
        alert(message);
    }
}

function startTimer() {
    if (isRunning) return;
    
    requestNotificationPermission();
    
    isRunning = true;
    playBtn.innerHTML = '<i class="ri-pause-fill"></i>';
    broadcastState();
    
    timerId = setInterval(() => {
        timeLeft--;
        updateDisplay();
        
        if (timeLeft <= 0) {
            stopTimer();
            notifyUser(`${currentMode.text} time is up!`);
        }
    }, 1000);
}

function toggleTimer() {
    if (isRunning) {
        stopTimer();
    } else {
        startTimer();
    }
}

function resetTimer() {
    stopTimer();
    timeLeft = currentMode.time;
    updateDisplay();
    broadcastState();
}

function updateBackgroundColors(mode) {
    orb1.style.background = `radial-gradient(circle, ${mode.orb1[0]}, ${mode.orb1[1]})`;
    orb2.style.background = `radial-gradient(circle, ${mode.orb2[0]}, ${mode.orb2[1]})`;
}

function setMode(modeName) {
    currentMode = MODES[modeName];
    
    // Update active button
    modeBtns.forEach(btn => btn.classList.remove('active'));
    document.getElementById(currentMode.id).classList.add('active');
    
    statusText.textContent = currentMode.text;
    updateBackgroundColors(currentMode);
    
    resetTimer(); 
}

function adjustTime(amount) {
    if (isRunning) return; // Do not allow adjustment while timer is running
    const newTime = currentMode.time + amount;
    if (newTime >= 60) { // Minimum 1 minute
        currentMode.time = newTime;
        timeLeft = newTime;
        updateDisplay();
        broadcastState();
    }
}

// Event Listeners
playBtn.addEventListener('click', toggleTimer);
resetBtn.addEventListener('click', resetTimer);
btnPlus.addEventListener('click', () => adjustTime(60));
btnMinus.addEventListener('click', () => adjustTime(-60));

document.getElementById('btn-pomodoro').addEventListener('click', () => setMode('POMODORO'));
document.getElementById('btn-shortbreak').addEventListener('click', () => setMode('SHORT_BREAK'));
document.getElementById('btn-longbreak').addEventListener('click', () => setMode('LONG_BREAK'));

// Start app
init();
