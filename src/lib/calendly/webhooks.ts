import "server-only";

import { createHash, createHmac, timingSafeEqual } from "crypto";
import {
  calendlyAccounts,
  getCalendlyAccountById,
  getCalendlyAccountRuntime,
} from "@/config/calendly";
import type { CalendlyAccountDefinition } from "@/config/calendly";
import { getEventInvitee, getScheduledEvent } from "@/lib/calendly/client";
import {
  calendlyStoreErrorResponse,
  insertCalendlyWebhookReceipt,
  inviteeUriFromWebhookPayload,
  markCalendlyWebhookError,
  markCalendlyWebhookProcessed,
  upsertCalendlyEventBundle,
  webhookInviteeEventUuid,
  webhookInviteeUuid,
  webhookPayloadInviteeScheduledBy,
} from "@/lib/calendly/storage";

export type CalendlyWebhookProcessResult = {
  duplicate: boolean;
  accountId: string | null;
  eventName: string;
  refreshed: boolean;
};

type CalendlyWebhookEnvelope = {
  event: string;
  created_at: string;
  created_by: string;
  payload: unknown;
};

export class CalendlyWebhookSignatureError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "CalendlyWebhookSignatureError";
    this.status = status;
  }
}

function parseSignatureHeader(header: string) {
  return header.split(",").reduce(
    (acc, value) => {
      const [key, entryValue] = value.split("=");
      if (key === "t") acc.timestamp = entryValue;
      if (key === "v1") acc.signature = entryValue;
      return acc;
    },
    { timestamp: "", signature: "" },
  );
}

export function verifyCalendlyWebhookSignature(rawBody: string, signatureHeader: string | null) {
  const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY?.trim();

  if (!signingKey) {
    throw new CalendlyWebhookSignatureError("Calendly webhook signing key is not configured.", 503);
  }

  if (!signatureHeader) {
    throw new CalendlyWebhookSignatureError("Missing Calendly webhook signature.");
  }

  const { timestamp, signature } = parseSignatureHeader(signatureHeader);

  if (!timestamp || !signature) {
    throw new CalendlyWebhookSignatureError("Invalid Calendly webhook signature header.");
  }

  const timestampMilliseconds = Number(timestamp) * 1000;
  const toleranceMs = 180_000;

  if (!Number.isFinite(timestampMilliseconds) || Math.abs(Date.now() - timestampMilliseconds) > toleranceMs) {
    throw new CalendlyWebhookSignatureError(
      "Invalid Calendly webhook signature. Timestamp is outside the tolerance window.",
    );
  }

  const expected = createHmac("sha256", signingKey)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(signature, "hex");

  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new CalendlyWebhookSignatureError("Invalid Calendly webhook signature.");
  }

  return { timestamp, signature };
}

function parseWebhookEnvelope(rawBody: string): CalendlyWebhookEnvelope {
  const parsed = JSON.parse(rawBody) as Partial<CalendlyWebhookEnvelope>;

  if (!parsed.event || !parsed.payload) {
    throw new Error("Calendly webhook payload is missing event or payload.");
  }

  return {
    event: parsed.event,
    created_at: parsed.created_at ?? new Date().toISOString(),
    created_by: parsed.created_by ?? "",
    payload: parsed.payload,
  };
}

function hashWebhookBody(rawBody: string) {
  return createHash("sha256").update(rawBody).digest("hex");
}

function accountByScheduledBy(payload: unknown) {
  const scheduledBy = webhookPayloadInviteeScheduledBy(payload);
  if (!scheduledBy) return null;

  return (
    calendlyAccounts.find((account) => {
      const runtime = getCalendlyAccountRuntime(account);
      return runtime.userUri === scheduledBy;
    }) ?? null
  );
}

function resolveWebhookAccount(accountId: string | null, payload: unknown) {
  if (accountId) return getCalendlyAccountById(accountId);
  return accountByScheduledBy(payload);
}

async function refreshEventFromCalendly(
  account: CalendlyAccountDefinition,
  payload: unknown,
) {
  const eventUuid = webhookInviteeEventUuid(payload);

  if (!eventUuid) {
    throw new Error("Unable to resolve the Calendly event from webhook payload.");
  }

  const event = (await getScheduledEvent(account, eventUuid)).resource;
  const inviteeUri = inviteeUriFromWebhookPayload(payload);
  const invitees = [];

  if (inviteeUri) {
    const inviteeUuid = webhookInviteeUuid(payload);
    if (inviteeUuid) {
      invitees.push((await getEventInvitee(account, eventUuid, inviteeUuid)).resource);
    }
  }

  if (!invitees.length) {
    throw new Error("Unable to resolve the Calendly invitee from webhook payload.");
  }

  await upsertCalendlyEventBundle(account, event, invitees);
}

export async function processCalendlyWebhook(
  rawBody: string,
  signatureHeader: string | null,
  accountId: string | null,
): Promise<CalendlyWebhookProcessResult> {
  const verification = verifyCalendlyWebhookSignature(rawBody, signatureHeader);
  const envelope = parseWebhookEnvelope(rawBody);
  const payloadHash = hashWebhookBody(rawBody);
  const account = resolveWebhookAccount(accountId, envelope.payload);

  if (!account) {
    throw new Error(
      "Unable to map Calendly webhook to a scheduling account. Include ?account=insurance or ?account=mva in the webhook URL.",
    );
  }

  const receipt = await insertCalendlyWebhookReceipt({
    accountId: account.id,
    eventName: envelope.event,
    payloadHash,
    signatureTimestamp: new Date(Number(verification.timestamp) * 1000).toISOString(),
    payload: envelope,
  });

  if (receipt.alreadyProcessed) {
    return {
      duplicate: true,
      accountId: account.id,
      eventName: envelope.event,
      refreshed: false,
    };
  }

  try {
    if (
      envelope.event === "invitee.created" ||
      envelope.event === "invitee.canceled" ||
      envelope.event === "invitee_no_show.created" ||
      envelope.event === "invitee_no_show.deleted"
    ) {
      await refreshEventFromCalendly(account, envelope.payload);
    }

    if (receipt.row) await markCalendlyWebhookProcessed(receipt.row.id, account.id);

    return {
      duplicate: false,
      accountId: account.id,
      eventName: envelope.event,
      refreshed: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process Calendly webhook.";
    if (receipt.row) await markCalendlyWebhookError(receipt.row.id, message);
    throw error;
  }
}

export function calendlyWebhookErrorResponse(error: unknown) {
  if (error instanceof CalendlyWebhookSignatureError) {
    return {
      message: error.message,
      status: error.status,
      code: "invalid_calendly_signature",
    };
  }

  return calendlyStoreErrorResponse(error);
}
