import "server-only";

import {
  calendlyAccounts,
  getCalendlyAccountRuntime,
  getCalendlyBackfillLookbackDays,
  getCalendlyCronLookbackDays,
  type CalendlyAccountId,
} from "@/config/calendly";
import type { CalendlyAccountDefinition } from "@/config/calendly";
import type { CalendlyInvitee, CalendlyScheduledEvent } from "@/lib/calendly/client";
import { getCurrentCalendlyUser, listEventInvitees, listScheduledEvents } from "@/lib/calendly/client";
import {
  getStoredEventUpdatedAtMap,
  recordCalendlySyncRun,
  upsertCalendlyEventBundle,
} from "@/lib/calendly/storage";

type SyncType = "manual" | "cron" | "webhook" | "backfill";

export type CalendlySyncOptions = {
  syncType?: SyncType;
  minStartTime?: string | null;
  maxStartTime?: string | null;
};

export type CalendlySyncResult = {
  accountId: CalendlyAccountId;
  status: "success" | "error";
  eventsProcessed: number;
  inviteesProcessed: number;
  errorMessage: string | null;
};

const DAY_MS = 24 * 60 * 60_000;
const SYNC_WINDOW_FORWARD_DAYS = 90;

function defaultSyncWindow(syncType: SyncType) {
  // New bookings for future meetings always land in the forward window regardless
  // of when they were created, so the forward span stays wide. Past events are
  // stable (their changes arrive via webhook), so the hourly cron only needs a
  // short lookback; manual/backfill runs use the full history window.
  const lookbackDays =
    syncType === "cron" ? getCalendlyCronLookbackDays() : getCalendlyBackfillLookbackDays();

  return {
    minStartTime: new Date(Date.now() - lookbackDays * DAY_MS).toISOString(),
    maxStartTime: new Date(Date.now() + SYNC_WINDOW_FORWARD_DAYS * DAY_MS).toISOString(),
  };
}

function sameTimestamp(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  const left = Date.parse(a);
  const right = Date.parse(b);
  return Number.isFinite(left) && Number.isFinite(right) && left === right;
}

async function resolveAccountIdentity(account: CalendlyAccountDefinition) {
  const runtime = getCalendlyAccountRuntime(account);

  if (!runtime.tokenConfigured) {
    throw new Error(`${account.label} is missing ${account.tokenEnvKey}.`);
  }

  if (runtime.userUri) {
    return {
      userUri: runtime.userUri,
      organizationUri: runtime.organizationUri || undefined,
    };
  }

  const currentUser = (await getCurrentCalendlyUser(account)).resource;

  return {
    userUri: currentUser.uri,
    organizationUri: runtime.organizationUri || currentUser.current_organization || undefined,
  };
}

async function collectAllInvitees(
  account: CalendlyAccountDefinition,
  eventUri: string,
) {
  const inviteesByUri = new Map<string, CalendlyInvitee>();

  for (const status of ["active", "canceled"]) {
    let pageToken: string | null = null;

    do {
      const page = await listEventInvitees(account, eventUri, {
        status,
        count: 100,
        page_token: pageToken,
        sort: "created_at:asc",
      });

      page.collection.forEach((invitee) => inviteesByUri.set(invitee.uri, invitee));
      pageToken = page.pagination.next_page_token ?? null;
    } while (pageToken);
  }

  return Array.from(inviteesByUri.values());
}

export async function syncCalendlyAccount(
  account: CalendlyAccountDefinition,
  options: CalendlySyncOptions = {},
): Promise<CalendlySyncResult> {
  const startedAt = new Date().toISOString();
  const syncType = options.syncType ?? "manual";
  const defaults = defaultSyncWindow(syncType);
  const minStartTime = options.minStartTime ?? defaults.minStartTime;
  const maxStartTime = options.maxStartTime ?? defaults.maxStartTime;
  let eventsProcessed = 0;
  let inviteesProcessed = 0;

  try {
    const identity = await resolveAccountIdentity(account);

    const eventsByUri = new Map<string, CalendlyScheduledEvent>();

    for (const status of ["active", "canceled"]) {
      let pageToken: string | null = null;

      do {
        const page = await listScheduledEvents(account, {
          user: identity.userUri,
          organization: identity.organizationUri,
          status,
          sort: "start_time:asc",
          min_start_time: minStartTime,
          max_start_time: maxStartTime,
          count: 100,
          page_token: pageToken,
        });

        page.collection.forEach((event) => eventsByUri.set(event.uri, event));
        pageToken = page.pagination.next_page_token ?? null;
      } while (pageToken);
    }

    // Cost control: the per-event invitee fetch is the dominant API cost (one
    // paginated call per event, per status). Skip it for UPCOMING events whose
    // Calendly updated_at is unchanged since the last sync — a future meeting
    // can't be no-showed yet, and its reschedule/cancel mutations bump updated_at
    // (or create a new event), so an unchanged upcoming event needs no refetch.
    // Past / in-progress events are always refetched so late no-show and
    // cancellation marks are never missed.
    const storedUpdatedAt = await getStoredEventUpdatedAtMap(account, minStartTime, maxStartTime);
    const now = Date.now();

    for (const event of eventsByUri.values()) {
      const startsInFuture = Date.parse(event.start_time) > now;
      const unchanged = sameTimestamp(storedUpdatedAt.get(event.uri), event.updated_at);

      if (startsInFuture && unchanged) continue;

      const invitees = await collectAllInvitees(account, event.uri);
      const result = await upsertCalendlyEventBundle(account, event, invitees);
      eventsProcessed += result.eventsProcessed;
      inviteesProcessed += result.inviteesProcessed;
    }

    await recordCalendlySyncRun({
      accountId: account.id,
      syncType,
      status: "success",
      startedAt,
      minStartTime,
      maxStartTime,
      eventsProcessed,
      inviteesProcessed,
    });

    return {
      accountId: account.id,
      status: "success",
      eventsProcessed,
      inviteesProcessed,
      errorMessage: null,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unable to sync Calendly meetings.";

    try {
      await recordCalendlySyncRun({
        accountId: account.id,
        syncType,
        status: "error",
        startedAt,
        minStartTime,
        maxStartTime,
        eventsProcessed,
        inviteesProcessed,
        errorMessage,
      });
    } catch {
      // Preserve the original sync failure for the caller.
    }

    return {
      accountId: account.id,
      status: "error",
      eventsProcessed,
      inviteesProcessed,
      errorMessage,
    };
  }
}

export async function syncAllCalendlyAccounts(options: CalendlySyncOptions = {}) {
  const results: CalendlySyncResult[] = [];

  for (const account of calendlyAccounts) {
    results.push(await syncCalendlyAccount(account, options));
  }

  return results;
}
