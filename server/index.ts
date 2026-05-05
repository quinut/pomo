import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";

interface UserState {
  id: string;
  name: string;
  avatar_url?: string;
  mode: string;
  isRunning: boolean;
  timeLeft: number;
}

const users = new Map<string, UserState>();

const app = new Elysia()
  .use(cors())
  // Serve frontend files
  .get("/", () => Bun.file("../index.html"))
  .get("/style.css", () => Bun.file("../style.css"))
  .get("/script.js", () => Bun.file("../script.js"))
  // Mock login endpoint for testing
  .post("/api/mock-login", ({ body }) => {
    const { username } = body;
    const id = `user-${Math.random().toString(36).substring(7)}`;
    return {
      success: true,
      user: {
        id,
        name: username || "Guest",
        avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
      }
    };
  }, {
    body: t.Object({
      username: t.String()
    })
  })
  // WebSocket for Realtime Presence
  .ws("/ws", {
    body: t.Object({
      type: t.String(),
      payload: t.Any()
    }),
    open(ws) {
      console.log(`Connection opened: ${ws.id}`);
    },
    message(ws, message) {
      if (message.type === 'sync' || message.type === 'join') {
        if (message.type === 'join') {
            ws.subscribe('pomodoro-room');
        }
        
        const payload = message.payload as UserState;
        // Keep the original user id from payload, or default to ws.id
        const userId = payload.id || ws.id; 
        users.set(ws.id, { ...payload, id: userId });
        
        // Broadcast all users to everyone
        const allUsers = Array.from(users.values());
        app.server?.publish('pomodoro-room', JSON.stringify({
          type: 'presence',
          payload: allUsers
        }));
        
        // Also send back to the sender since publish doesn't send to self
        ws.send(JSON.stringify({
          type: 'presence',
          payload: allUsers
        }));
      }
    },
    close(ws) {
      console.log(`Connection closed: ${ws.id}`);
      users.delete(ws.id);
      ws.unsubscribe('pomodoro-room');
      
      const allUsers = Array.from(users.values());
      app.server?.publish('pomodoro-room', JSON.stringify({
        type: 'presence',
        payload: allUsers
      }));
    }
  })
  .listen(3000);

console.log(`🦊 Elysia Server is running at ${app.server?.hostname}:${app.server?.port}`);