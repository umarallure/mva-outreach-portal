// Registers (or reports) Calendly webhook subscriptions for both scheduling
// accounts, attaching the shared signing key so the portal can verify deliveries.
//
// Why a script: the Calendly dashboard cannot attach a signing_key — only the
// API can — and src/lib/calendly/webhooks.ts rejects any delivery without a
// valid signature. This registers each account's org-scoped subscription with
// the signing key and the four invitee events the webhook route handles.
//
// Usage:
//   node scripts/register-calendly-webhooks.mjs https://your-portal.com
//   node scripts/register-calendly-webhooks.mjs https://your-portal.com --dry-run
//
// Reads tokens + signing key from .env.local (or the real process env, which
// takes precedence). Auto-discovers each account's user/organization URI via
// /users/me, so you do NOT need to set the *_USER_URI / *_ORGANIZATION_URI vars.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const API_BASE = "https://api.calendly.com";

const EVENTS = [
  "invitee.created",
  "invitee.canceled",
  "invitee_no_show.created",
  "invitee_no_show.deleted",
];

const ACCOUNTS = [
  { id: "insurance", label: "Insurance Scheduling", tokenEnvKey: "CALENDLY_INSURANCE_API_TOKEN" },
  { id: "mva", label: "MVA Scheduling", tokenEnvKey: "CALENDLY_MVA_API_TOKEN" },
];

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const env = {};
  try {
    const raw = readFileSync(join(__dirname, "..", ".env.local"), "utf8").replace(/^﻿/, "");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  } catch {
    // No .env.local — rely on process.env only.
  }
  return env;
}

const fileEnv = loadEnvLocal();
const readEnv = (key) => (process.env[key]?.trim() || fileEnv[key]?.trim() || "");

async function calendly(token, path, init = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    const detail =
      (payload && typeof payload === "object" && (payload.message || payload.title)) ||
      (typeof payload === "string" ? payload : "") ||
      "";
    throw new Error(`${response.status} ${path} ${detail}`.trim());
  }
  return payload;
}

async function main() {
  const baseUrlArg = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");

  if (!baseUrlArg) {
    console.error("Usage: node scripts/register-calendly-webhooks.mjs <https-base-url> [--dry-run]");
    process.exit(1);
  }

  const baseUrl = baseUrlArg.replace(/\/+$/, "");
  if (!baseUrl.startsWith("https://")) {
    console.error(`Base URL must be https:// (Calendly rejects non-HTTPS callbacks). Got: ${baseUrl}`);
    process.exit(1);
  }

  const signingKey = readEnv("CALENDLY_WEBHOOK_SIGNING_KEY");
  if (!signingKey) {
    console.error("CALENDLY_WEBHOOK_SIGNING_KEY is not set (checked process env and .env.local).");
    process.exit(1);
  }

  let hadError = false;

  for (const account of ACCOUNTS) {
    const token = readEnv(account.tokenEnvKey);
    console.log(`\n=== ${account.label} (${account.id}) ===`);

    if (!token) {
      console.log(`  SKIP: ${account.tokenEnvKey} is not set.`);
      continue;
    }

    const callbackUrl = `${baseUrl}/api/calendly/webhook?account=${account.id}`;

    try {
      const me = await calendly(token, "/users/me");
      const userUri = me?.resource?.uri;
      const organizationUri = me?.resource?.current_organization;
      if (!userUri || !organizationUri) {
        throw new Error("Could not resolve user/organization from /users/me.");
      }
      console.log(`  org:  ${organizationUri}`);
      console.log(`  url:  ${callbackUrl}`);

      const existing = await calendly(
        token,
        `/webhook_subscriptions?organization=${encodeURIComponent(organizationUri)}&scope=organization&count=100`,
      );
      const match = (existing?.collection ?? []).find((sub) => sub.callback_url === callbackUrl);
      if (match) {
        console.log(`  EXISTS: ${match.uri} (state: ${match.state}) — skipping create.`);
        continue;
      }

      if (dryRun) {
        console.log(`  DRY-RUN: would create org-scoped subscription for [${EVENTS.join(", ")}].`);
        continue;
      }

      const created = await calendly(token, "/webhook_subscriptions", {
        method: "POST",
        body: JSON.stringify({
          url: callbackUrl,
          events: EVENTS,
          organization: organizationUri,
          scope: "organization",
          signing_key: signingKey,
        }),
      });
      console.log(`  CREATED: ${created?.resource?.uri} (state: ${created?.resource?.state})`);
    } catch (error) {
      hadError = true;
      console.error(`  ERROR: ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log("");
  process.exit(hadError ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
