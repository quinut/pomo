import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3000/ws');

ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'join',
    payload: { name: 'test', mode: 'POMODORO', isRunning: false, timeLeft: 1500 }
  }));
  setTimeout(() => ws.close(), 100);
});
