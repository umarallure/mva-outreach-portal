import http from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

/**
 * Browser-gateway: a stateless CDP relay.
 *
 *   browser  ──wss──►  this gateway  ──wss──►  wss://cloudbrowser.gologin.com/connect
 *
 * The portal (on Vercel) authenticates the operator and issues a short-lived,
 * HMAC-signed ticket. This service verifies the ticket, then opens the upstream
 * GoLogin CDP socket using the GOLOGIN_API_TOKEN (which lives ONLY here + on the
 * Vercel server) and pipes raw CDP frames in both directions. All screencast /
 * input logic lives in the browser client; this process stays a dumb pipe.
 *
 * Required env:
 *   GOLOGIN_API_TOKEN   GoLogin developer token (Bearer)
 *   RELAY_JWT_SECRET    shared secret with the Next app's viewer-ticket signer
 * Optional env:
 *   PORT                default 8787
 *   ALLOWED_ORIGIN      comma-separated allowlist of browser origins (CORS-style)
 *   GOLOGIN_CONNECT_URL default wss://cloudbrowser.gologin.com/connect
 *   KEEPALIVE_MS        ws ping interval to detect dead clients (default 30000)
 *   MAX_SESSION_MS      hard cap per relay connection (default 14400000 = 4h)
 */

const PORT = Number(process.env.PORT ?? 8787);
const GOLOGIN_API_TOKEN = process.env.GOLOGIN_API_TOKEN?.trim();
const RELAY_JWT_SECRET = process.env.RELAY_JWT_SECRET?.trim();
const GOLOGIN_CONNECT_URL = (
  process.env.GOLOGIN_CONNECT_URL ?? "wss://cloudbrowser.gologin.com/connect"
).trim();
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const KEEPALIVE_MS = Number(process.env.KEEPALIVE_MS ?? 30_000);
const MAX_SESSION_MS = Number(process.env.MAX_SESSION_MS ?? 14_400_000);

if (!GOLOGIN_API_TOKEN || !RELAY_JWT_SECRET) {
  console.error("[gateway] FATAL: GOLOGIN_API_TOKEN and RELAY_JWT_SECRET are required.");
  process.exit(1);
}

const log = (...a) => console.log(new Date().toISOString(), "[gateway]", ...a);

// --- Ticket verification (mirrors src/lib/viewer-ticket.ts) ---------------------
function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function verifyTicket(token) {
  if (!token) throw new Error("missing ticket");
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) throw new Error("malformed ticket");

  const expected = b64url(createHmac("sha256", RELAY_JWT_SECRET).update(payloadB64).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("bad signature");

  const claims = JSON.parse(
    Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
  );
  if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) throw new Error("expired");
  if (!claims.pid) throw new Error("no profile in ticket");
  return claims;
}

function originAllowed(origin) {
  if (ALLOWED_ORIGINS.length === 0) return true; // open in dev; set ALLOWED_ORIGIN in prod
  return origin ? ALLOWED_ORIGINS.includes(origin) : false;
}

// --- HTTP server (health) + WS upgrade ------------------------------------------
const server = http.createServer((req, res) => {
  if (req.url === "/healthz" || req.url === "/") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "outreach-browser-gateway" }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  let url;
  try {
    url = new URL(req.url, "http://localhost");
  } catch {
    return reject(socket, 400, "Bad Request");
  }

  if (url.pathname !== "/cdp") return reject(socket, 404, "Not Found");

  const origin = req.headers.origin;
  if (!originAllowed(origin)) return reject(socket, 403, "Forbidden Origin");

  let claims;
  try {
    claims = verifyTicket(url.searchParams.get("ticket"));
  } catch (err) {
    log("ticket rejected:", err.message);
    return reject(socket, 401, "Unauthorized");
  }

  wss.handleUpgrade(req, socket, head, (client) => {
    wss.emit("connection", client, claims);
  });
});

function reject(socket, code, message) {
  socket.write(`HTTP/1.1 ${code} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

// --- Relay logic ----------------------------------------------------------------
wss.on("connection", (client, claims) => {
  const tag = `sid=${claims.sid?.slice(0, 8)} pid=${claims.pid?.slice(0, 8)}`;
  const upstreamUrl =
    `${GOLOGIN_CONNECT_URL}?token=${encodeURIComponent(GOLOGIN_API_TOKEN)}` +
    `&profile=${encodeURIComponent(claims.pid)}`;
  log(`relay open  ${tag}`);

  const upstream = new WebSocket(upstreamUrl, { perMessageDeflate: false });
  const queue = [];
  let closed = false;
  let alive = true;

  const close = (why) => {
    if (closed) return;
    closed = true;
    log(`relay close ${tag} (${why})`);
    try { client.close(); } catch {}
    try { upstream.close(); } catch {}
    clearInterval(kaTimer);
    clearTimeout(maxTimer);
  };

  // WS-level keepalive: detect dead/half-open clients WITHOUT killing an idle-but-live
  // view. A static page emits no screencast frames, so message-silence is not idleness.
  client.on("pong", () => {
    alive = true;
  });
  const kaTimer = setInterval(() => {
    if (!alive) return close("client unresponsive (no pong)");
    alive = false;
    try { client.ping(); } catch {}
  }, KEEPALIVE_MS);
  const maxTimer = setTimeout(() => close("max session duration"), MAX_SESSION_MS);

  // client -> upstream (queue until upstream is open)
  client.on("message", (data, isBinary) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary });
    } else {
      queue.push([data, isBinary]);
    }
  });

  // upstream -> client
  upstream.on("open", () => {
    for (const [data, isBinary] of queue.splice(0)) upstream.send(data, { binary: isBinary });
  });
  upstream.on("message", (data, isBinary) => {
    if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
  });

  client.on("close", () => close("client closed"));
  client.on("error", (e) => close(`client error: ${e.message}`));
  upstream.on("close", () => close("upstream closed"));
  upstream.on("error", (e) => close(`upstream error: ${e.message}`));
});

server.listen(PORT, () => log(`listening on :${PORT}  (origins: ${ALLOWED_ORIGINS.join(", ") || "ANY"})`));

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => { log(`${sig} received, shutting down`); server.close(() => process.exit(0)); });
}
