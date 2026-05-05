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

const getBaseUrl = (request: Request) => {
  const url = new URL(request.url);
  const protocol = request.headers.get('x-forwarded-proto') || (url.hostname === 'localhost' ? 'http' : 'https');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
  return `${protocol}://${host}`;
};

// Helper function to render callback HTML
const renderCallbackHtml = (userData: any) => `
<!DOCTYPE html>
<html>
<head><title>Logging in...</title></head>
<body>
    <script>
        localStorage.setItem('pomodoroUser', JSON.stringify(${JSON.stringify(userData)}));
        window.location.href = '/';
    </script>
</body>
</html>
`;

const app = new Elysia()
  .use(cors())
  // Serve frontend files
  .get("/", () => Bun.file("../index.html"))
  .get("/style.css", () => Bun.file("../style.css"))
  .get("/script.js", () => Bun.file("../script.js"))
  
  // --- MOCK LOGIN ---
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

  // --- GOOGLE OAUTH ---
  .group("/api/auth/google", (app) => app
    .get("/login", ({ request, set }) => {
      const clientId = Bun.env.GOOGLE_CLIENT_ID;
      if (!clientId || clientId === 'your_google_client_id_here') {
          return new Response("Google Client ID not configured in .env", { status: 500 });
      }
      const baseUrl = getBaseUrl(request);
      const redirectUri = encodeURIComponent(`${baseUrl}/api/auth/google/callback`);
      const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=profile email`;
      set.redirect = url;
    })
    .get("/callback", async ({ request, query }) => {
      const { code } = query;
      if (!code) return new Response("No code provided", { status: 400 });

      const clientId = Bun.env.GOOGLE_CLIENT_ID!;
      const clientSecret = Bun.env.GOOGLE_CLIENT_SECRET!;
      const baseUrl = getBaseUrl(request);
      const redirectUri = `${baseUrl}/api/auth/google/callback`;

      try {
        // Exchange code for token
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: "authorization_code"
            })
        });
        const tokenData = await tokenRes.json() as any;
        
        if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error);

        // Get user profile
        const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        const userData = await userRes.json() as any;

        const sessionUser = {
            id: `google-${userData.id}`,
            name: userData.name,
            avatar_url: userData.picture
        };

        return new Response(renderCallbackHtml(sessionUser), {
            headers: { 'Content-Type': 'text/html' }
        });
      } catch (err: any) {
        return new Response(`OAuth Error: ${err.message}`, { status: 500 });
      }
    })
  )

  // --- DISCORD OAUTH ---
  .group("/api/auth/discord", (app) => app
    .get("/login", ({ request, set }) => {
      const clientId = Bun.env.DISCORD_CLIENT_ID;
      if (!clientId || clientId === 'your_discord_client_id_here') {
          return new Response("Discord Client ID not configured in .env", { status: 500 });
      }
      const baseUrl = getBaseUrl(request);
      const redirectUri = encodeURIComponent(`${baseUrl}/api/auth/discord/callback`);
      const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=identify`;
      set.redirect = url;
    })
    .get("/callback", async ({ request, query }) => {
      const { code } = query;
      if (!code) return new Response("No code provided", { status: 400 });

      const clientId = Bun.env.DISCORD_CLIENT_ID!;
      const clientSecret = Bun.env.DISCORD_CLIENT_SECRET!;
      const baseUrl = getBaseUrl(request);
      const redirectUri = `${baseUrl}/api/auth/discord/callback`;

      try {
        // Exchange code for token
        const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: "authorization_code",
                code,
                redirect_uri: redirectUri
            })
        });
        const tokenData = await tokenRes.json() as any;
        
        if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error);

        // Get user profile
        const userRes = await fetch("https://discord.com/api/users/@me", {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        const userData = await userRes.json() as any;

        const avatarUrl = userData.avatar 
            ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png` 
            : `https://cdn.discordapp.com/embed/avatars/${parseInt(userData.discriminator) % 5}.png`;

        const sessionUser = {
            id: `discord-${userData.id}`,
            name: userData.global_name || userData.username,
            avatar_url: avatarUrl
        };

        return new Response(renderCallbackHtml(sessionUser), {
            headers: { 'Content-Type': 'text/html' }
        });
      } catch (err: any) {
        return new Response(`OAuth Error: ${err.message}`, { status: 500 });
      }
    })
  )
  // --- WEBSOCKET FOR REALTIME PRESENCE ---
  .ws("/ws", {
    body: t.Object({
      type: t.String(),
      payload: t.Optional(t.Any())
    }),
    open(ws) {
      console.log(`Connection opened: ${ws.id}`);
    },
    message(ws, message) {
      try {
        if (message.type === 'sync' || message.type === 'join') {
          if (message.type === 'join') {
              ws.subscribe('pomodoro-room');
          }
          
          const payload = message.payload as UserState | undefined;
          if (!payload) return;
          
          const userId = payload.id || ws.id; 
          users.set(ws.id, { ...payload, id: userId });
          
          const allUsers = Array.from(users.values());
          app.server?.publish('pomodoro-room', JSON.stringify({
            type: 'presence',
            payload: allUsers
          }));
          
          ws.send(JSON.stringify({
            type: 'presence',
            payload: allUsers
          }));
        }
      } catch (err) {
        console.error("WS Message Error:", err);
      }
    },
    close(ws) {
      try {
        console.log(`Connection closed: ${ws.id}`);
        users.delete(ws.id);
        ws.unsubscribe('pomodoro-room');
        
        const allUsers = Array.from(users.values());
        app.server?.publish('pomodoro-room', JSON.stringify({
          type: 'presence',
          payload: allUsers
        }));
      } catch (err) {
        console.error("WS Close Error:", err);
      }
    }
  })
  .listen(3000);

console.log(`🦊 Elysia Server is running at ${app.server?.hostname}:${app.server?.port}`);