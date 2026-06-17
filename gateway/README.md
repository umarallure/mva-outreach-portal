# Outreach Browser Gateway

A tiny, stateless WebSocket relay that lets the portal embed a **live, interactive
GoLogin cloud browser**. Vercel (serverless) cannot hold a long-lived WebSocket, and
the GoLogin token must never reach the client — so this always-on service sits between
them.

```
browser (canvas + input)
   │  wss://<gateway>/cdp?ticket=<signed-ticket>
   ▼
this gateway   ── holds GOLOGIN_API_TOKEN + RELAY_JWT_SECRET ──►  wss://cloudbrowser.gologin.com/connect?token=…&profile=…
   = transparent CDP pipe (Target / Page / Input / Emulation)
```

The portal issues a short-lived HMAC-signed ticket from
`POST /api/gologin/sessions/[sessionId]/viewer-ticket`. This gateway verifies it with
the **same** `RELAY_JWT_SECRET`, then opens the upstream GoLogin CDP socket for the
profile id named in the ticket. It never decodes screencast frames or input — all of
that lives in the browser client (`src/lib/cdp-screencast.ts` + `CloudBrowserViewer`).

## Run locally

```bash
cd gateway
npm install
cp .env.example .env        # fill in GOLOGIN_API_TOKEN + RELAY_JWT_SECRET
# (RELAY_JWT_SECRET must match the portal's value)
node --env-file=.env src/server.mjs
```

Then in the portal's `.env.local`:

```
NEXT_PUBLIC_BROWSER_GATEWAY_URL=ws://localhost:8787
RELAY_JWT_SECRET=<same value as the gateway>
```

Health check: `curl http://localhost:8787/healthz`.

## Deploy (always-on host required)

Pick any platform that supports persistent WebSockets — **not** Vercel serverless.

- **Fly.io**: `fly launch` (uses the included `Dockerfile`), then
  `fly secrets set GOLOGIN_API_TOKEN=… RELAY_JWT_SECRET=… ALLOWED_ORIGIN=https://your-portal`.
- **Railway / Render**: new service from this folder, set the same env vars. `PORT` is injected.
- **Cloudflare**: a Worker + Durable Object can replace this with the same ticket/pipe
  protocol if you prefer a serverless-native relay (see plan, "scalable alternative").

In production **always** set `ALLOWED_ORIGIN` to your portal origin(s), and point
`NEXT_PUBLIC_BROWSER_GATEWAY_URL` at the gateway's `wss://` URL on Vercel.

## Environment

See [.env.example](./.env.example). `GOLOGIN_API_TOKEN` and `RELAY_JWT_SECRET` are
required; everything else has sane defaults.
