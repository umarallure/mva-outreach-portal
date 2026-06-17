# Production Deployment

This app has **two deployables**, because Vercel's serverless runtime cannot hold the
long-lived WebSocket the embedded cloud browser needs:

| Component | What it is | Where it runs |
| --- | --- | --- |
| **Portal** (this repo root) | Next.js 16 app — UI, auth, session orchestration, issues viewer tickets | **Vercel** |
| **Browser gateway** (`gateway/`) | Tiny Node WS relay: browser ⇄ GoLogin CDP. Holds the GoLogin token. | **Always-on host** (Fly.io / Railway / Render) — **not** Vercel |

```
browser ──wss + 60s ticket──►  gateway (always-on)  ──CDP──►  wss://cloudbrowser.gologin.com
   ▲ ticket from Vercel route        holds GOLOGIN_API_TOKEN + RELAY_JWT_SECRET
```

The single shared secret tying them together is **`RELAY_JWT_SECRET`** — it must be
**identical** on Vercel and the gateway.

---

## 0. One-time secrets

Generate these once and reuse the same values everywhere noted below:

```bash
# RELAY_JWT_SECRET  (must match on Vercel + gateway)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# OUTREACH_SESSION_ENCRYPTION_KEY  (Vercel only; already set in dev — reuse or rotate)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

`GOLOGIN_API_TOKEN` comes from the GoLogin dashboard (Settings → API). Treat it as a
high-value secret: it can launch billable cloud browsers.

---

## 1. Deploy the browser gateway first

The portal needs the gateway's public `wss://` URL, so deploy it first.

**Recommended: Fly.io** (the `gateway/Dockerfile` is ready). Railway/Render work the same way.

```bash
cd gateway
fly launch --no-deploy            # creates fly.toml from the Dockerfile; pick a region near operators
fly secrets set \
  GOLOGIN_API_TOKEN="<token>" \
  RELAY_JWT_SECRET="<the shared secret from step 0>"
fly deploy
```

Then note the URL, e.g. `https://outreach-gateway.fly.dev` → its WebSocket URL is
`wss://outreach-gateway.fly.dev`.

Gateway environment:

| Var | Value | Notes |
| --- | --- | --- |
| `GOLOGIN_API_TOKEN` | GoLogin token | secret |
| `RELAY_JWT_SECRET` | shared secret | **must match Vercel** |
| `ALLOWED_ORIGIN` | `https://your-portal.vercel.app` | set in step 4 once the portal domain exists; locks the relay to your portal |
| `PORT` | injected by host | leave unset on Fly/Railway/Render |
| `KEEPALIVE_MS` | `30000` (default) | ws ping interval |
| `MAX_SESSION_MS` | `14400000` (default 4h) | hard cap per relay connection |

**Why a separate host (best practice):** Vercel/edge functions terminate after a response
or timeout, so they can't keep a relay socket open; and the GoLogin token must never reach
the browser. An always-on Node process is the correct place for both. It is **stateless per
connection** (verify ticket → open upstream → pipe), so it scales horizontally with no
sticky sessions. Keep **min instances ≥ 1** (no scale-to-zero — WebSockets need a live
process). Put it in a region near your operators / GoLogin egress to minimize latency.
The host terminates TLS for you, so you get `wss://` automatically.

*Scalable alternative:* a Cloudflare Worker + Durable Object can replace the Node service
with the same ticket/pipe protocol if you prefer a serverless-native relay.

---

## 2. Apply the Supabase migration (production project)

The session lock/audit table must exist in your **production** Supabase project:

```bash
supabase link --project-ref <prod-ref>
supabase db push        # applies supabase/migrations/20260617_create_outreach_gologin_sessions.sql
```

(or paste that SQL file into the Supabase SQL editor). Also confirm operator rows exist in
`app_users` with `role` = `admin`/`super_admin` (or `is_super_admin = true`) — the portal
denies access otherwise.

---

## 3. Configure Vercel environment variables

In the Vercel project → **Settings → Environment Variables** (Production, and Preview if you
use it). `NEXT_PUBLIC_*` are exposed to the browser (intended); everything else is server-only.

| Var | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | prod Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon key |
| `GOLOGIN_API_TOKEN` | GoLogin token (server REST start/stop) |
| `OUTREACH_SESSION_ENCRYPTION_KEY` | from step 0 |
| `RELAY_JWT_SECRET` | **same value as the gateway** |
| `NEXT_PUBLIC_BROWSER_GATEWAY_URL` | `wss://outreach-gateway.fly.dev` (from step 1) |
| `GOLOGIN_PROFILE_PUBLISHER_KELLER` … (all 8) | the profile ids — **required**, accounts read these from env |
| `OUTREACH_SESSION_STALE_MINUTES` | `120` (optional) |
| `FLOWCHAT_URL_*`, `LINKEDIN_URL_*`, `DEFAULT_TARGET_URL_*` | optional — FlowChat pipeline URLs are already hardcoded in `src/config/pipelines.ts`; env overrides them if set |

> The 8 `GOLOGIN_PROFILE_*` vars are mandatory — without them an account has no profile and
> can't start. The FlowChat pipeline URLs are hardcoded in `FLOWCHAT_PIPELINE_URLS`
> (`src/config/pipelines.ts`), so they don't need env vars unless you want to override.

---

## 4. Deploy the portal, then lock the gateway origin

1. Deploy on Vercel (push to the connected branch, or `vercel --prod`). Standard `next build`;
   no special config. The `gateway/` folder is ignored by the Next build.
2. Once you know the production domain (`https://your-portal.vercel.app` or a custom domain),
   set the gateway's `ALLOWED_ORIGIN` to it and redeploy the gateway:
   ```bash
   cd gateway && fly secrets set ALLOWED_ORIGIN="https://your-portal.com"
   ```
   This rejects relay connections from any other origin.

---

## 5. Smoke test in production

1. Log in as an operator → open an account (e.g. Ben – BPO South Africa).
2. **Start Profile** → the canvas streams, and the cloud tab auto-opens that account's
   FlowChat pipeline.
3. Click into the page, type, scroll, use the address bar / back-forward.
4. DevTools → Network → WS: confirm the connection is `wss://…/cdp?ticket=…` and the GoLogin
   token never appears client-side.
5. Leave the view idle ~3 min → it should stay connected (keepalive), not drop.

---

## Security checklist

- [ ] `RELAY_JWT_SECRET` identical on Vercel + gateway; never `NEXT_PUBLIC_*`.
- [ ] `GOLOGIN_API_TOKEN` only on the gateway + Vercel server env — never in the client bundle or a URL.
- [ ] Gateway `ALLOWED_ORIGIN` = production portal origin(s).
- [ ] Portal served over HTTPS and `NEXT_PUBLIC_BROWSER_GATEWAY_URL` is **`wss://`** (an `ws://` gateway from an `https://` page is blocked as mixed content).
- [ ] Viewer tickets are short-lived (60s) and signed — already enforced.
- [ ] Supabase RLS / `app_users` roles correct; only intended operators have access.
- [ ] Consider rate-limiting `POST /api/gologin/sessions/[id]/viewer-ticket` (host-level or in-route).

## Operational notes

- **Health:** `GET https://<gateway>/healthz` → `{"ok":true,...}` for uptime checks.
- **Costs:** GoLogin bills cloud-browser runtime; the `Stop` button + heartbeat staleness
  (`OUTREACH_SESSION_STALE_MINUTES`) release sessions. The gateway is a small always-on box.
- **One session per GoLogin profile** is enforced (unique index). Accounts that share a
  profile (e.g. the two Keller accounts) can't run simultaneously — start one, stop, start the other.
- **Logs:** the gateway logs `relay open/close` with truncated session/profile ids — useful
  for confirming connections without leaking secrets.
