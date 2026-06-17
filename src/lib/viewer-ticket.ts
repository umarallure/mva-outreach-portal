import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

/**
 * Short-lived, signed ticket that authorizes the browser to open a CDP relay
 * connection on the browser-gateway service. The GoLogin API token never leaves
 * the server / gateway — the client only ever holds this opaque, expiring ticket.
 *
 * Token format (compact, dependency-free):  base64url(payload).base64url(hmacSHA256)
 * The gateway verifies it with the SAME RELAY_JWT_SECRET (see gateway/src/server.mjs).
 */

export type ViewerTicketClaims = {
  /** Outreach session id (outreach_gologin_sessions.id). */
  sid: string;
  /** GoLogin profile id the gateway must connect to. */
  pid: string;
  /** Supabase user id that requested the ticket (audit / future per-user scoping). */
  uid: string;
  /** Expiry, unix seconds. */
  exp: number;
};

export class ViewerTicketError extends Error {
  status = 503;

  constructor(message = "RELAY_JWT_SECRET is not configured.") {
    super(message);
    this.name = "ViewerTicketError";
  }
}

const DEFAULT_TTL_SECONDS = 60;

function base64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function getSecret() {
  const secret = process.env.RELAY_JWT_SECRET?.trim();
  if (!secret) throw new ViewerTicketError();
  return secret;
}

export function hasRelaySecret() {
  return Boolean(process.env.RELAY_JWT_SECRET?.trim());
}

export function signViewerTicket(
  claims: Omit<ViewerTicketClaims, "exp">,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): { ticket: string; expiresAt: number } {
  const secret = getSecret();
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload: ViewerTicketClaims = { ...claims, exp };

  const payloadB64 = base64url(JSON.stringify(payload));
  const sig = base64url(createHmac("sha256", secret).update(payloadB64).digest());

  return { ticket: `${payloadB64}.${sig}`, expiresAt: exp };
}

/** Verify + decode. Returns claims or throws ViewerTicketError. (Mirrored in the gateway.) */
export function verifyViewerTicket(token: string): ViewerTicketClaims {
  const secret = getSecret();
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) throw new ViewerTicketError("Malformed ticket.");

  const expected = base64url(createHmac("sha256", secret).update(payloadB64).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ViewerTicketError("Invalid ticket signature.");
  }

  const claims = JSON.parse(
    Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
  ) as ViewerTicketClaims;

  if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) {
    throw new ViewerTicketError("Ticket has expired.");
  }

  return claims;
}
