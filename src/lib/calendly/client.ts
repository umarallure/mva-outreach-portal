import "server-only";

import type { CalendlyAccountDefinition } from "@/config/calendly";
import { getCalendlyToken } from "@/config/calendly";

const API_BASE = "https://api.calendly.com";

type CalendlyPayload = Record<string, unknown> | unknown[] | string | number | boolean | null;
type QueryValue = string | number | boolean | null | undefined;

export type CalendlyPagination = {
  count?: number;
  next_page?: string | null;
  next_page_token?: string | null;
  previous_page?: string | null;
  previous_page_token?: string | null;
};

export type CalendlyCollectionResponse<T> = {
  collection: T[];
  pagination: CalendlyPagination;
};

export type CalendlyResourceResponse<T> = {
  resource: T;
};

export type CalendlyCancellation = {
  canceled_by: string;
  reason: string | null;
  canceler_type: "host" | "invitee" | string;
  created_at: string;
};

export type CalendlyScheduledEvent = {
  uri: string;
  name: string | null;
  meeting_notes_plain?: string | null;
  meeting_notes_html?: string | null;
  status: "active" | "canceled" | string;
  start_time: string;
  end_time: string;
  event_type: string;
  location: unknown;
  invitees_counter: unknown;
  created_at: string;
  updated_at: string;
  event_memberships?: unknown[];
  event_guests?: unknown[];
  cancellation?: CalendlyCancellation | null;
  calendar_event?: unknown;
  [key: string]: unknown;
};

export type CalendlyInvitee = {
  uri: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  name: string;
  status: "active" | "canceled" | string;
  questions_and_answers: unknown[];
  timezone: string | null;
  event: string;
  created_at: string;
  updated_at: string;
  tracking: unknown;
  text_reminder_number: string | null;
  rescheduled: boolean;
  old_invitee: string | null;
  new_invitee: string | null;
  routing_form_submission: string | null;
  cancellation?: CalendlyCancellation | null;
  payment: unknown;
  no_show: unknown;
  reconfirmation: unknown;
  scheduling_method: string | null;
  invitee_scheduled_by: string | null;
  [key: string]: unknown;
};

export type CalendlyUser = {
  uri: string;
  name: string;
  slug: string;
  email: string;
  scheduling_url: string;
  timezone: string;
  current_organization: string;
  [key: string]: unknown;
};

export type CalendlyOrganizationMembership = {
  uri: string;
  role: string;
  user: string;
  organization: string;
  [key: string]: unknown;
};

export type CalendlyWebhookSubscription = {
  uri: string;
  callback_url: string;
  state: "active" | "disabled" | string;
  events: string[];
  scope: "organization" | "user" | "group" | string;
  organization: string;
  user: string | null;
  group: string | null;
  creator: string | null;
  created_at: string;
  updated_at: string;
  retry_started_at: string | null;
};

export type CreateCalendlyWebhookSubscriptionInput = {
  url: string;
  events: string[];
  organization: string;
  user?: string;
  group?: string;
  scope: "organization" | "user" | "group";
  signing_key?: string;
};

export class CalendlyApiError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "CalendlyApiError";
    this.status = status;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function parsePayload(text: string): CalendlyPayload {
  if (!text) return null;

  try {
    return JSON.parse(text) as CalendlyPayload;
  } catch {
    return text;
  }
}

function payloadMessage(payload: unknown) {
  if (typeof payload === "string") {
    const normalized = payload.replace(/\s+/g, " ").trim();
    return normalized ? normalized.slice(0, 220) : null;
  }

  if (isObject(payload)) {
    const message = payload.message ?? payload.error ?? payload.title;
    if (typeof message === "string" && message.trim()) return message.trim();
  }

  return null;
}

function buildQuery(query?: Record<string, QueryValue>) {
  const params = new URLSearchParams();

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    params.set(key, String(value));
  });

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

const MAX_CALENDLY_RETRIES = 4;
const RETRYABLE_SERVER_STATUS = new Set([500, 502, 503, 504]);
const MAX_RETRY_DELAY_MS = 30_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function retryDelayMs(response: Response | null, attempt: number) {
  const retryAfter = response?.headers.get("retry-after");

  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
    }

    const retryAtMs = Date.parse(retryAfter);
    if (Number.isFinite(retryAtMs)) {
      return Math.min(Math.max(retryAtMs - Date.now(), 0), MAX_RETRY_DELAY_MS);
    }
  }

  // Exponential backoff with jitter when Calendly doesn't send Retry-After.
  const backoff = Math.min(500 * 2 ** attempt, MAX_RETRY_DELAY_MS);
  return backoff + Math.floor(Math.random() * 250);
}

async function requestCalendly<TPayload>(
  account: CalendlyAccountDefinition,
  path: string,
  init: RequestInit = {},
  query?: Record<string, QueryValue>,
): Promise<TPayload> {
  const token = getCalendlyToken(account);

  if (!token) {
    throw new CalendlyApiError(`Calendly token is not configured for ${account.label}.`, 503);
  }

  const url = `${API_BASE}${path}${buildQuery(query)}`;
  const method = (init.method ?? "GET").toUpperCase();
  const isIdempotent = method === "GET" || method === "HEAD";

  for (let attempt = 0; ; attempt++) {
    let response: Response;

    try {
      response = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
        cache: "no-store",
      });
    } catch (networkError) {
      // Only retry transient network failures for safe (idempotent) requests, so
      // a request that may have already mutated state is never re-sent blindly.
      if (isIdempotent && attempt < MAX_CALENDLY_RETRIES) {
        await sleep(retryDelayMs(null, attempt));
        continue;
      }

      const reason = networkError instanceof Error ? networkError.message : "network error";
      throw new CalendlyApiError(`Calendly request failed: ${reason}`, 502);
    }

    // 429 is always safe to retry (rejected, not processed). 5xx is only retried
    // for idempotent requests to avoid duplicate writes on ambiguous failures.
    const retryable =
      response.status === 429 || (isIdempotent && RETRYABLE_SERVER_STATUS.has(response.status));

    if (!response.ok && retryable && attempt < MAX_CALENDLY_RETRIES) {
      await response.text().catch(() => ""); // drain the body before retrying
      await sleep(retryDelayMs(response, attempt));
      continue;
    }

    const text = await response.text();
    const payload = parsePayload(text);

    if (!response.ok) {
      const details = payloadMessage(payload);
      const message = details
        ? `Calendly request failed with status ${response.status}: ${details}`
        : `Calendly request failed with status ${response.status}.`;

      throw new CalendlyApiError(message, response.status);
    }

    return payload as TPayload;
  }
}

export function calendlyUuidFromUri(uri: string) {
  try {
    const segments = new URL(uri).pathname.split("/").filter(Boolean);
    return segments.at(-1) ?? uri;
  } catch {
    return uri.split("/").filter(Boolean).at(-1) ?? uri;
  }
}

export function eventUuidFromInviteeUri(uri: string) {
  try {
    const segments = new URL(uri).pathname.split("/").filter(Boolean);
    const eventIndex = segments.findIndex((segment) => segment === "scheduled_events");
    return eventIndex >= 0 ? segments[eventIndex + 1] ?? null : null;
  } catch {
    const segments = uri.split("/").filter(Boolean);
    const eventIndex = segments.findIndex((segment) => segment === "scheduled_events");
    return eventIndex >= 0 ? segments[eventIndex + 1] ?? null : null;
  }
}

export function inviteeUuidFromUri(uri: string) {
  return calendlyUuidFromUri(uri);
}

export async function getCurrentCalendlyUser(account: CalendlyAccountDefinition) {
  return requestCalendly<CalendlyResourceResponse<CalendlyUser>>(account, "/users/me", {
    method: "GET",
  });
}

export async function listOrganizationMemberships(
  account: CalendlyAccountDefinition,
  query: Record<string, QueryValue>,
) {
  return requestCalendly<CalendlyCollectionResponse<CalendlyOrganizationMembership>>(
    account,
    "/organization_memberships",
    { method: "GET" },
    query,
  );
}

export async function listScheduledEvents(
  account: CalendlyAccountDefinition,
  query: Record<string, QueryValue>,
) {
  return requestCalendly<CalendlyCollectionResponse<CalendlyScheduledEvent>>(
    account,
    "/scheduled_events",
    { method: "GET" },
    query,
  );
}

export async function getScheduledEvent(account: CalendlyAccountDefinition, eventUriOrUuid: string) {
  const eventUuid = eventUriOrUuid.startsWith("http")
    ? calendlyUuidFromUri(eventUriOrUuid)
    : eventUriOrUuid;

  return requestCalendly<CalendlyResourceResponse<CalendlyScheduledEvent>>(
    account,
    `/scheduled_events/${encodeURIComponent(eventUuid)}`,
    { method: "GET" },
  );
}

export async function listEventInvitees(
  account: CalendlyAccountDefinition,
  eventUriOrUuid: string,
  query: Record<string, QueryValue> = {},
) {
  const eventUuid = eventUriOrUuid.startsWith("http")
    ? calendlyUuidFromUri(eventUriOrUuid)
    : eventUriOrUuid;

  return requestCalendly<CalendlyCollectionResponse<CalendlyInvitee>>(
    account,
    `/scheduled_events/${encodeURIComponent(eventUuid)}/invitees`,
    { method: "GET" },
    query,
  );
}

export async function getEventInvitee(
  account: CalendlyAccountDefinition,
  eventUriOrUuid: string,
  inviteeUriOrUuid: string,
) {
  const eventUuid = eventUriOrUuid.startsWith("http")
    ? calendlyUuidFromUri(eventUriOrUuid)
    : eventUriOrUuid;
  const inviteeUuid = inviteeUriOrUuid.startsWith("http")
    ? inviteeUuidFromUri(inviteeUriOrUuid)
    : inviteeUriOrUuid;

  return requestCalendly<CalendlyResourceResponse<CalendlyInvitee>>(
    account,
    `/scheduled_events/${encodeURIComponent(eventUuid)}/invitees/${encodeURIComponent(inviteeUuid)}`,
    { method: "GET" },
  );
}

export async function listWebhookSubscriptions(
  account: CalendlyAccountDefinition,
  query: Record<string, QueryValue>,
) {
  return requestCalendly<CalendlyCollectionResponse<CalendlyWebhookSubscription>>(
    account,
    "/webhook_subscriptions",
    { method: "GET" },
    query,
  );
}

export async function createWebhookSubscription(
  account: CalendlyAccountDefinition,
  input: CreateCalendlyWebhookSubscriptionInput,
) {
  return requestCalendly<CalendlyResourceResponse<CalendlyWebhookSubscription>>(
    account,
    "/webhook_subscriptions",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}
