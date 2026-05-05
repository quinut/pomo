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

// New DOM Elements for Auth & Realtime
const loginOverlay = document.getElementById('login-overlay');
const btnLoginGoogle = document.getElementById('btn-login-google');
const btnLoginDiscord = document.getElementById('btn-login-discord');
const btnContinueGuest = document.getElementById('btn-continue-guest');
const btnLogout = document.getElementById('btn-logout');
const onlineUsersList = document.getElementById('online-users-list');

// Background Orbs
const orb1 = document.querySelector('.orb-1');
const orb2 = document.querySelector('.orb-2');

// Supabase Initialization
const supabaseUrl = 'https://svadigbmwialurcwqeho.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2YWRpZ2Jtd2lhbHVyY3dxZWhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NTQ1NDgsImV4cCI6MjA5MzUzMDU0OH0.Oc2phuXm8Ks1FsNojQ0JS2EAxfsmaiHZVcAVJPjIeUs';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

let currentUser = null;
let realtimeChannel = null;

// Initialization & Auth Flow
async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
        loginOverlay.style.display = 'none';
        btnLogout.style.display = 'block';
        initRealtime();
    } else {
        // Show login overlay
        loginOverlay.style.display = 'flex';
        btnLogout.style.display = 'none';
    }

    // Auth Event Listener
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
            currentUser = session.user;
            loginOverlay.style.display = 'none';
            btnLogout.style.display = 'block';
            initRealtime();
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            loginOverlay.style.display = 'flex';
            btnLogout.style.display = 'none';
            if (realtimeChannel) {
                realtimeChannel.unsubscribe();
                realtimeChannel = null;
            }
            renderOnlineUsers({});
        }
    });

    updateDisplay();
    updateBackgroundColors(currentMode);
}

// Auth Handlers
async function signInWithProvider(provider) {
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: provider,
        options: {
            redirectTo: window.location.origin
        }
    });
    if (error) console.error('Login error:', error.message);
}

btnLoginGoogle.addEventListener('click', () => signInWithProvider('google'));
btnLoginDiscord.addEventListener('click', () => signInWithProvider('discord'));

btnContinueGuest.addEventListener('click', () => {
    loginOverlay.style.display = 'none';
    currentUser = { id: 'guest-' + Math.random().toString(36).substring(7), user_metadata: { full_name: 'Guest' } };
    initRealtime();
});

btnLogout.addEventListener('click', async () => {
    if (currentUser && !currentUser.id.startsWith('guest-')) {
        await supabase.auth.signOut();
    } else {
        currentUser = null;
        loginOverlay.style.display = 'flex';
        btnLogout.style.display = 'none';
        if (realtimeChannel) {
            realtimeChannel.unsubscribe();
            realtimeChannel = null;
        }
        renderOnlineUsers({});
    }
});

// Realtime Presence
function initRealtime() {
    if (realtimeChannel) return;

    realtimeChannel = supabase.channel('pomodoro-room', {
        config: {
            presence: {
                key: currentUser.id,
            },
        },
    });

    realtimeChannel
        .on('presence', { event: 'sync' }, () => {
            const newState = realtimeChannel.presenceState();
            renderOnlineUsers(newState);
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                broadcastState();
            }
        });
}

async function broadcastState() {
    if (!realtimeChannel || !currentUser) return;
    
    const statusData = {
        name: currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || 'Anonymous',
        avatar_url: currentUser.user_metadata?.avatar_url || null,
        mode: currentMode.key,
        isRunning: isRunning,
        timeLeft: timeLeft
    };

    await realtimeChannel.track(statusData);
}

function renderOnlineUsers(presenceState) {
    onlineUsersList.innerHTML = '';
    
    // Convert presence state object to array of users
    const users = [];
    for (const [key, presences] of Object.entries(presenceState)) {
        if (presences.length > 0) {
            // Include user ID to avoid duplicates and map accurately
            users.push({ id: key, ...presences[0] });
        }
    }

    if (users.length === 0) {
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
        
        // Broadcast every 10 seconds to keep clients roughly in sync with time left, or let them compute.
        // For simplicity and to save quota, we won't broadcast every second. The mode/isRunning is enough.
        // If we want exact time sync, we could broadcast periodically.
        
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
    
    resetTimer(); // Reset timer also calls broadcastState
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
