const MODES = {
    POMODORO: { time: 25 * 60, id: 'btn-pomodoro', text: 'Time to focus!', orb1: ['#ff7e67', '#ff5757'], orb2: ['#4facfe', '#00f2fe'] },
    SHORT_BREAK: { time: 5 * 60, id: 'btn-shortbreak', text: 'Time for a break!', orb1: ['#4facfe', '#00f2fe'], orb2: ['#43e97b', '#38f9d7'] },
    LONG_BREAK: { time: 15 * 60, id: 'btn-longbreak', text: 'Time for a long break!', orb1: ['#43e97b', '#38f9d7'], orb2: ['#fa709a', '#fee140'] }
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

// Background Orbs
const orb1 = document.querySelector('.orb-1');
const orb2 = document.querySelector('.orb-2');

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

// Initialize display
updateDisplay();
updateBackgroundColors(currentMode);
