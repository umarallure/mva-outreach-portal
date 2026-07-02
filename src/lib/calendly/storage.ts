import "server-only";

import type { CalendlyAccountDefinition } from "@/config/calendly";
import {
  getCalendlyAccountRuntime,
  getCalendlyBackfillLookbackDays,
} from "@/config/calendly";
import type { CalendlyInvitee, CalendlyScheduledEvent } from "@/lib/calendly/client";
import {
  calendlyUuidFromUri,
  eventUuidFromInviteeUri,
  inviteeUuidFromUri,
} from "@/lib/calendly/client";
import type {
  CalendlyCancellationView,
  CalendlyMeetingState,
  CalendlyMeetingView,
  CalendlyQuestionAnswerView,
  CalendlyTrackingView,
  CalendlyWorkspaceHealth,
  CalendlyWorkspaceSummary,
  CalendlyWorkspaceView,
} from "@/lib/calendly/types";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type DatabaseError = {
  code?: string;
  message?: string;
  details?: string;
};

type SupabaseQueryResult = {
  data: unknown;
  error: unknown;
};

type SupabaseQueryBuilder = PromiseLike<SupabaseQueryResult> & {
  select(columns?: string): SupabaseQueryBuilder;
  eq(column: string, value: unknown): SupabaseQueryBuilder;
  gte(column: string, value: unknown): SupabaseQueryBuilder;
  lte(column: string, value: unknown): SupabaseQueryBuilder;
  in(column: string, values: readonly unknown[]): SupabaseQueryBuilder;
  order(column: string, options?: { ascending?: boolean }): SupabaseQueryBuilder;
  limit(count: number): SupabaseQueryBuilder;
  maybeSingle(): Promise<SupabaseQueryResult>;
  single(): Promise<SupabaseQueryResult>;
  insert(values: unknown): SupabaseMutationBuilder;
  update(values: unknown): SupabaseFilterBuilder;
  upsert(values: unknown, options?: unknown): Promise<SupabaseQueryResult>;
};

type SupabaseMutationBuilder = PromiseLike<SupabaseQueryResult> & {
  select(columns?: string): SupabaseQueryBuilder;
};

type SupabaseFilterBuilder = {
  eq(column: string, value: unknown): Promise<SupabaseQueryResult>;
};

type UntypedSupabaseClient = {
  from(table: string): SupabaseQueryBuilder;
};

type CalendlyEventRow = {
  id: string;
  account_id: string;
  event_uri: string;
  event_uuid: string;
  name: string | null;
  status: string;
  start_time: string;
  end_time: string;
  event_type_uri: string | null;
  location: unknown;
  invitees_counter: unknown;
  cancellation: unknown;
  calendar_event: unknown;
  calendly_created_at: string | null;
  calendly_updated_at: string | null;
  raw_payload: unknown;
  synced_at: string;
};

type CalendlyInviteeRow = {
  id: string;
  account_id: string;
  event_uri: string;
  invitee_uri: string;
  invitee_uuid: string;
  email: string | null;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  status: string;
  timezone: string | null;
  questions_and_answers: unknown;
  tracking: unknown;
  cancellation: unknown;
  payment: unknown;
  no_show: unknown;
  reconfirmation: unknown;
  rescheduled: boolean;
  old_invitee_uri: string | null;
  new_invitee_uri: string | null;
  routing_form_submission_uri: string | null;
  scheduling_method: string | null;
  invitee_scheduled_by_uri: string | null;
  calendly_created_at: string | null;
  calendly_updated_at: string | null;
  raw_payload: unknown;
  synced_at: string;
};

type SyncRunRow = {
  id: string;
  account_id: string;
  sync_type: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  events_processed: number;
  invitees_processed: number;
  error_message: string | null;
};

type WebhookEventRow = {
  id: string;
  account_id: string | null;
  event_name: string;
  payload_hash: string;
  status: string;
  received_at: string;
  processed_at: string | null;
  error_message: string | null;
};

type WebhookReceiptInput = {
  accountId: string | null;
  eventName: string;
  payloadHash: string;
  signatureTimestamp: string | null;
  payload: unknown;
};

type SyncRunInput = {
  accountId: string;
  syncType: "manual" | "cron" | "webhook" | "backfill";
  status: "success" | "error";
  startedAt: string;
  minStartTime: string | null;
  maxStartTime: string | null;
  eventsProcessed: number;
  inviteesProcessed: number;
  errorMessage?: string | null;
};

const EVENTS_TABLE: string = "outreach_calendly_events";
const INVITEES_TABLE: string = "outreach_calendly_invitees";
const WEBHOOK_EVENTS_TABLE: string = "outreach_calendly_webhook_events";
const SYNC_RUNS_TABLE: string = "outreach_calendly_sync_runs";

const EVENT_COLUMNS = [
  "id",
  "account_id",
  "event_uri",
  "event_uuid",
  "name",
  "status",
  "start_time",
  "end_time",
  "event_type_uri",
  "location",
  "invitees_counter",
  "cancellation",
  "calendar_event",
  "calendly_created_at",
  "calendly_updated_at",
  "raw_payload",
  "synced_at",
].join(",");

const INVITEE_COLUMNS = [
  "id",
  "account_id",
  "event_uri",
  "invitee_uri",
  "invitee_uuid",
  "email",
  "name",
  "first_name",
  "last_name",
  "status",
  "timezone",
  "questions_and_answers",
  "tracking",
  "cancellation",
  "payment",
  "no_show",
  "reconfirmation",
  "rescheduled",
  "old_invitee_uri",
  "new_invitee_uri",
  "routing_form_submission_uri",
  "scheduling_method",
  "invitee_scheduled_by_uri",
  "calendly_created_at",
  "calendly_updated_at",
  "raw_payload",
  "synced_at",
].join(",");

const WEBHOOK_EVENT_RETURN_COLUMNS =
  "id,account_id,event_name,payload_hash,status,received_at,processed_at,error_message";

function asUntypedSupabaseClient(client: unknown): UntypedSupabaseClient {
  return client as UntypedSupabaseClient;
}

export class CalendlyStoreError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "calendly_store_error") {
    super(message);
    this.name = "CalendlyStoreError";
    this.status = status;
    this.code = code;
  }
}

const isDatabaseError = (error: unknown): error is DatabaseError =>
  Boolean(error) && typeof error === "object";

function isMissingCalendlyTableError(error: unknown) {
  if (!isDatabaseError(error)) return false;

  return (
    error.code === "42P01" ||
    Boolean(error.message?.includes("outreach_calendly")) ||
    Boolean(error.details?.includes("outreach_calendly"))
  );
}

function isUniqueViolation(error: unknown) {
  if (!isDatabaseError(error)) return false;
  return error.code === "23505" || Boolean(error.message?.includes("duplicate key"));
}

function normalizeStoreError(error: unknown) {
  if (isMissingCalendlyTableError(error)) {
    return new CalendlyStoreError(
      "Calendly scheduling storage is not ready. Apply the outreach_calendly migration.",
      503,
      "missing_calendly_tables",
    );
  }

  const message =
    isDatabaseError(error) && error.message
      ? error.message
      : "Unable to read Calendly scheduling storage.";

  return new CalendlyStoreError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toJson(value: unknown) {
  return value === undefined ? null : value;
}

function noShowUri(value: unknown) {
  return isRecord(value) ? asString(value.uri) : null;
}

function noShowCreatedAt(value: unknown) {
  return isRecord(value) ? asString(value.created_at) : null;
}

function normalizeCancellation(value: unknown): CalendlyCancellationView | null {
  if (!isRecord(value)) return null;

  const canceledBy = asString(value.canceled_by);
  const cancelerType = asString(value.canceler_type);
  const createdAt = asString(value.created_at);

  if (!canceledBy || !cancelerType || !createdAt) return null;

  return {
    canceledBy,
    reason: asString(value.reason),
    cancelerType,
    createdAt,
  };
}

function normalizeQuestionAnswers(value: unknown): CalendlyQuestionAnswerView[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!isRecord(entry)) return null;

      const question = asString(entry.question) ?? asString(entry.name);
      const rawAnswer = entry.answer;
      const answer = Array.isArray(rawAnswer)
        ? rawAnswer.map((item) => String(item)).join(", ")
        : asString(rawAnswer);

      if (!question && !answer) return null;

      return {
        question: question ?? "Question",
        answer: answer ?? "",
      };
    })
    .filter((entry): entry is CalendlyQuestionAnswerView => Boolean(entry));
}

function normalizeTracking(value: unknown): CalendlyTrackingView {
  const tracking = isRecord(value) ? value : {};

  return {
    utmCampaign: asString(tracking.utm_campaign),
    utmSource: asString(tracking.utm_source),
    utmMedium: asString(tracking.utm_medium),
    utmContent: asString(tracking.utm_content),
    utmTerm: asString(tracking.utm_term),
    salesforceUuid: asString(tracking.salesforce_uuid),
  };
}

function locationLabel(value: unknown) {
  if (!isRecord(value)) return "Not specified";

  const kind = asString(value.kind) ?? asString(value.type);
  const location =
    asString(value.location) ??
    asString(value.join_url) ??
    asString(value.phone_number) ??
    asString(value.additional_info);

  if (kind && location) return `${kind.replaceAll("_", " ")} - ${location}`;
  if (location) return location;
  if (kind) return kind.replaceAll("_", " ");

  return "Not specified";
}

function deriveMeetingState(event: CalendlyEventRow, invitee: CalendlyInviteeRow | null) {
  if (invitee?.no_show) return "no_show" satisfies CalendlyMeetingState;
  if (invitee?.rescheduled || invitee?.old_invitee_uri || invitee?.new_invitee_uri) {
    return "rescheduled" satisfies CalendlyMeetingState;
  }
  if (event.status === "canceled" || invitee?.status === "canceled") {
    return "canceled" satisfies CalendlyMeetingState;
  }

  const now = Date.now();
  const start = new Date(event.start_time).getTime();
  const end = new Date(event.end_time).getTime();

  if (Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end) {
    return "in_progress" satisfies CalendlyMeetingState;
  }
  if (Number.isFinite(end) && now > end) return "completed" satisfies CalendlyMeetingState;

  return "scheduled" satisfies CalendlyMeetingState;
}

function isToday(value: string) {
  const date = new Date(value);
  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function toMeetingView(
  event: CalendlyEventRow,
  invitee: CalendlyInviteeRow | null,
): CalendlyMeetingView {
  const state = deriveMeetingState(event, invitee);
  const eventCancellation = normalizeCancellation(event.cancellation);
  const inviteeCancellation = normalizeCancellation(invitee?.cancellation);

  return {
    eventUri: event.event_uri,
    eventUuid: event.event_uuid,
    inviteeUri: invitee?.invitee_uri ?? null,
    inviteeUuid: invitee?.invitee_uuid ?? null,
    eventName: event.name ?? "Calendly event",
    state,
    eventStatus: event.status,
    inviteeStatus: invitee?.status ?? null,
    startTime: event.start_time,
    endTime: event.end_time,
    inviteeName: invitee?.name ?? null,
    inviteeEmail: invitee?.email ?? null,
    timezone: invitee?.timezone ?? null,
    locationLabel: locationLabel(event.location),
    questionsAndAnswers: normalizeQuestionAnswers(invitee?.questions_and_answers),
    tracking: normalizeTracking(invitee?.tracking),
    cancellation: inviteeCancellation ?? eventCancellation,
    rescheduled: Boolean(invitee?.rescheduled || invitee?.old_invitee_uri || invitee?.new_invitee_uri),
    oldInviteeUri: invitee?.old_invitee_uri ?? null,
    newInviteeUri: invitee?.new_invitee_uri ?? null,
    noShowUri: noShowUri(invitee?.no_show),
    noShowCreatedAt: noShowCreatedAt(invitee?.no_show),
    eventTypeUri: event.event_type_uri,
    createdAt: invitee?.calendly_created_at ?? event.calendly_created_at,
    updatedAt: invitee?.calendly_updated_at ?? event.calendly_updated_at,
  };
}

function buildSummary(meetings: CalendlyMeetingView[]): CalendlyWorkspaceSummary {
  return meetings.reduce<CalendlyWorkspaceSummary>(
    (summary, meeting) => {
      summary.total += 1;
      if (meeting.state === "scheduled" || meeting.state === "in_progress") summary.upcoming += 1;
      if (isToday(meeting.startTime)) summary.today += 1;
      if (meeting.state === "completed") summary.completed += 1;
      if (meeting.state === "canceled" || meeting.state === "rescheduled") {
        summary.canceledOrRescheduled += 1;
      }
      if (meeting.state === "no_show") summary.noShow += 1;
      return summary;
    },
    {
      total: 0,
      upcoming: 0,
      today: 0,
      completed: 0,
      canceledOrRescheduled: 0,
      noShow: 0,
    },
  );
}

export async function upsertCalendlyEventBundle(
  account: CalendlyAccountDefinition,
  event: CalendlyScheduledEvent,
  invitees: CalendlyInvitee[],
) {
  const supabase = asUntypedSupabaseClient(createServiceClient());
  const now = new Date().toISOString();

  const eventRow = {
    account_id: account.id,
    event_uri: event.uri,
    event_uuid: calendlyUuidFromUri(event.uri),
    name: event.name,
    status: event.status,
    start_time: event.start_time,
    end_time: event.end_time,
    event_type_uri: event.event_type,
    location: toJson(event.location),
    invitees_counter: toJson(event.invitees_counter),
    cancellation: toJson(event.cancellation ?? null),
    calendar_event: toJson(event.calendar_event ?? null),
    calendly_created_at: event.created_at,
    calendly_updated_at: event.updated_at,
    raw_payload: toJson(event),
    synced_at: now,
    updated_at: now,
  };

  const { error: eventError } = await supabase
    .from(EVENTS_TABLE)
    .upsert(eventRow, { onConflict: "event_uri" });

  if (eventError) throw normalizeStoreError(eventError);

  if (!invitees.length) return { eventsProcessed: 1, inviteesProcessed: 0 };

  const inviteeRows = invitees.map((invitee) => ({
    account_id: account.id,
    event_uri: event.uri,
    invitee_uri: invitee.uri,
    invitee_uuid: inviteeUuidFromUri(invitee.uri),
    email: invitee.email,
    name: invitee.name,
    first_name: invitee.first_name,
    last_name: invitee.last_name,
    status: invitee.status,
    timezone: invitee.timezone,
    questions_and_answers: toJson(invitee.questions_and_answers),
    tracking: toJson(invitee.tracking),
    cancellation: toJson(invitee.cancellation ?? null),
    payment: toJson(invitee.payment ?? null),
    no_show: toJson(invitee.no_show ?? null),
    reconfirmation: toJson(invitee.reconfirmation ?? null),
    rescheduled: Boolean(invitee.rescheduled),
    old_invitee_uri: invitee.old_invitee,
    new_invitee_uri: invitee.new_invitee,
    routing_form_submission_uri: invitee.routing_form_submission,
    scheduling_method: invitee.scheduling_method,
    invitee_scheduled_by_uri: invitee.invitee_scheduled_by,
    calendly_created_at: invitee.created_at,
    calendly_updated_at: invitee.updated_at,
    raw_payload: toJson(invitee),
    synced_at: now,
    updated_at: now,
  }));

  const { error: inviteeError } = await supabase
    .from(INVITEES_TABLE)
    .upsert(inviteeRows, { onConflict: "invitee_uri" });

  if (inviteeError) throw normalizeStoreError(inviteeError);

  return { eventsProcessed: 1, inviteesProcessed: invitees.length };
}

export type CalendlyWebhookReceipt = {
  row: WebhookEventRow | null;
  alreadyProcessed: boolean;
};

export async function insertCalendlyWebhookReceipt(
  input: WebhookReceiptInput,
): Promise<CalendlyWebhookReceipt> {
  const supabase = asUntypedSupabaseClient(createServiceClient());
  const { data, error } = await supabase
    .from(WEBHOOK_EVENTS_TABLE)
    .insert({
      account_id: input.accountId,
      event_name: input.eventName,
      payload_hash: input.payloadHash,
      signature_timestamp: input.signatureTimestamp,
      payload: toJson(input.payload),
      status: "received",
    })
    .select(WEBHOOK_EVENT_RETURN_COLUMNS)
    .single();

  if (!error) {
    return { row: data as WebhookEventRow, alreadyProcessed: false };
  }

  if (!isUniqueViolation(error)) {
    throw normalizeStoreError(error);
  }

  // A prior delivery of this exact payload already created a receipt. Re-run the
  // work unless it previously completed, so Calendly's retry of a delivery that
  // failed mid-processing is not silently dropped by the idempotency guard.
  const existing = await supabase
    .from(WEBHOOK_EVENTS_TABLE)
    .select(WEBHOOK_EVENT_RETURN_COLUMNS)
    .eq("payload_hash", input.payloadHash)
    .maybeSingle();

  if (existing.error) throw normalizeStoreError(existing.error);

  const row = (existing.data as WebhookEventRow | null) ?? null;
  return { row, alreadyProcessed: row?.status === "processed" };
}

export async function markCalendlyWebhookProcessed(id: string, accountId: string | null) {
  const supabase = asUntypedSupabaseClient(createServiceClient());
  const now = new Date().toISOString();
  const { error } = await supabase
    .from(WEBHOOK_EVENTS_TABLE)
    .update({
      account_id: accountId,
      status: "processed",
      processed_at: now,
      error_message: null,
      updated_at: now,
    })
    .eq("id", id);

  if (error) throw normalizeStoreError(error);
}

export async function markCalendlyWebhookError(id: string, message: string) {
  const supabase = asUntypedSupabaseClient(createServiceClient());
  const now = new Date().toISOString();
  const { error } = await supabase
    .from(WEBHOOK_EVENTS_TABLE)
    .update({
      status: "error",
      error_message: message,
      processed_at: now,
      updated_at: now,
    })
    .eq("id", id);

  if (error) throw normalizeStoreError(error);
}

export async function recordCalendlySyncRun(input: SyncRunInput) {
  const supabase = asUntypedSupabaseClient(createServiceClient());
  const finishedAt = new Date().toISOString();
  const { error } = await supabase.from(SYNC_RUNS_TABLE).insert({
    account_id: input.accountId,
    sync_type: input.syncType,
    status: input.status,
    started_at: input.startedAt,
    finished_at: finishedAt,
    min_start_time: input.minStartTime,
    max_start_time: input.maxStartTime,
    events_processed: input.eventsProcessed,
    invitees_processed: input.inviteesProcessed,
    error_message: input.errorMessage ?? null,
  });

  if (error) throw normalizeStoreError(error);
}

export async function getStoredEventUpdatedAtMap(
  account: CalendlyAccountDefinition,
  minStartTime: string,
  maxStartTime: string,
): Promise<Map<string, string>> {
  const supabase = asUntypedSupabaseClient(createServiceClient());
  const { data, error } = await supabase
    .from(EVENTS_TABLE)
    .select("event_uri,calendly_updated_at")
    .eq("account_id", account.id)
    .gte("start_time", minStartTime)
    .lte("start_time", maxStartTime);

  if (error) throw normalizeStoreError(error);

  const map = new Map<string, string>();
  ((data as Array<{ event_uri: string; calendly_updated_at: string | null }> | null) ?? []).forEach(
    (row) => {
      if (row.calendly_updated_at) map.set(row.event_uri, row.calendly_updated_at);
    },
  );

  return map;
}

export async function getCalendlyWorkspace(
  account: CalendlyAccountDefinition,
): Promise<CalendlyWorkspaceView> {
  const runtime = getCalendlyAccountRuntime(account);
  const baseHealth: CalendlyWorkspaceHealth = {
    tokenConfigured: runtime.tokenConfigured,
    userUriConfigured: Boolean(runtime.userUri),
    organizationUriConfigured: Boolean(runtime.organizationUri),
    webhookSigningKeyConfigured: runtime.webhookSigningKeyConfigured,
    lastSyncAt: null,
    lastSyncStatus: null,
    lastWebhookAt: null,
    lastWebhookEventName: null,
    setupRequired: !runtime.tokenConfigured,
    errorMessage: null,
  };

  const emptyWorkspace: CalendlyWorkspaceView = {
    account: {
      id: account.id,
      label: account.label,
      href: account.href,
      userUri: runtime.userUri,
      organizationUri: runtime.organizationUri,
    },
    health: baseHealth,
    summary: buildSummary([]),
    meetings: [],
  };

  try {
    const supabase = asUntypedSupabaseClient(await createClient());
    const lookbackDays = getCalendlyBackfillLookbackDays();
    const minStart = new Date(Date.now() - lookbackDays * 24 * 60 * 60_000).toISOString();
    const maxStart = new Date(Date.now() + 90 * 24 * 60 * 60_000).toISOString();

    const [eventsResult, syncResult, webhookResult] = await Promise.all([
      supabase
        .from(EVENTS_TABLE)
        .select(EVENT_COLUMNS)
        .eq("account_id", account.id)
        .gte("start_time", minStart)
        .lte("start_time", maxStart)
        .order("start_time", { ascending: true }),
      supabase
        .from(SYNC_RUNS_TABLE)
        .select("id,account_id,sync_type,status,started_at,finished_at,events_processed,invitees_processed,error_message")
        .eq("account_id", account.id)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from(WEBHOOK_EVENTS_TABLE)
        .select("id,account_id,event_name,payload_hash,status,received_at,processed_at,error_message")
        .eq("account_id", account.id)
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (eventsResult.error) throw eventsResult.error;
    if (syncResult.error) throw syncResult.error;
    if (webhookResult.error) throw webhookResult.error;

    const events = ((eventsResult.data as CalendlyEventRow[] | null) ?? []).sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    );
    const eventUris = events.map((event) => event.event_uri);
    let invitees: CalendlyInviteeRow[] = [];

    if (eventUris.length) {
      const inviteesResult = await supabase
        .from(INVITEES_TABLE)
        .select(INVITEE_COLUMNS)
        .eq("account_id", account.id)
        .in("event_uri", eventUris)
        .order("calendly_created_at", { ascending: true });

      if (inviteesResult.error) throw inviteesResult.error;
      invitees = (inviteesResult.data as CalendlyInviteeRow[] | null) ?? [];
    }

    const inviteesByEvent = new Map<string, CalendlyInviteeRow[]>();
    invitees.forEach((invitee) => {
      const existing = inviteesByEvent.get(invitee.event_uri) ?? [];
      existing.push(invitee);
      inviteesByEvent.set(invitee.event_uri, existing);
    });

    const meetings = events.flatMap((event) => {
      const eventInvitees = inviteesByEvent.get(event.event_uri) ?? [];
      if (!eventInvitees.length) return [toMeetingView(event, null)];
      return eventInvitees.map((invitee) => toMeetingView(event, invitee));
    });
    const syncRun = (syncResult.data as SyncRunRow | null) ?? null;
    const webhook = (webhookResult.data as WebhookEventRow | null) ?? null;

    return {
      ...emptyWorkspace,
      health: {
        ...baseHealth,
        lastSyncAt: syncRun?.finished_at ?? syncRun?.started_at ?? null,
        lastSyncStatus: syncRun?.status ?? null,
        lastWebhookAt: webhook?.received_at ?? null,
        lastWebhookEventName: webhook?.event_name ?? null,
      },
      summary: buildSummary(meetings),
      meetings,
    };
  } catch (error) {
    if (isMissingCalendlyTableError(error)) {
      return {
        ...emptyWorkspace,
        health: {
          ...baseHealth,
          setupRequired: true,
          errorMessage: "Calendly scheduling storage is not ready. Apply the outreach_calendly migration.",
        },
      };
    }

    return {
      ...emptyWorkspace,
      health: {
        ...baseHealth,
        errorMessage:
          error instanceof Error ? error.message : "Unable to load Calendly scheduling data.",
      },
    };
  }
}

export function accountMatchesInviteePayload(
  account: CalendlyAccountDefinition,
  payload: unknown,
) {
  const runtime = getCalendlyAccountRuntime(account);
  if (!runtime.userUri || !isRecord(payload)) return false;

  if (payload.invitee_scheduled_by === runtime.userUri) return true;

  const memberships = payload.event_memberships;
  if (!Array.isArray(memberships)) return false;

  return memberships.some((membership) => isRecord(membership) && membership.user === runtime.userUri);
}

export function eventUuidFromWebhookPayload(payload: unknown) {
  if (!isRecord(payload)) return null;

  const eventUri = asString(payload.event);
  if (eventUri) return calendlyUuidFromUri(eventUri);

  const inviteeUri = asString(payload.invitee);
  if (inviteeUri) return eventUuidFromInviteeUri(inviteeUri);

  const uri = asString(payload.uri);
  return uri?.includes("/scheduled_events/") ? eventUuidFromInviteeUri(uri) : null;
}

export function inviteeUriFromWebhookPayload(payload: unknown) {
  if (!isRecord(payload)) return null;
  const uri = asString(payload.uri);
  return asString(payload.invitee) ?? (uri?.includes("/invitees/") ? uri : null);
}

export function hasNoShowPayload(payload: unknown) {
  return isRecord(payload) && Boolean(payload.invitee || payload.uri);
}

export function webhookPayloadEventUri(payload: unknown) {
  if (!isRecord(payload)) return null;
  return asString(payload.event);
}

export function webhookPayloadInviteeScheduledBy(payload: unknown) {
  if (!isRecord(payload)) return null;
  return asString(payload.invitee_scheduled_by);
}

export function webhookPayloadIsInvitee(payload: unknown) {
  return isRecord(payload) && Boolean(payload.event && payload.email && payload.uri);
}

export function webhookPayloadIsNoShow(payload: unknown) {
  return isRecord(payload) && Boolean(payload.invitee && payload.created_at);
}

export function webhookInviteeEventUuid(payload: unknown) {
  const eventUri = webhookPayloadEventUri(payload);
  return eventUri ? calendlyUuidFromUri(eventUri) : eventUuidFromWebhookPayload(payload);
}

export function webhookInviteeUuid(payload: unknown) {
  const inviteeUri = inviteeUriFromWebhookPayload(payload);
  return inviteeUri ? inviteeUuidFromUri(inviteeUri) : null;
}

export function calendlyStoreErrorResponse(error: unknown) {
  if (error instanceof CalendlyStoreError) {
    return {
      message: error.message,
      status: error.status,
      code: error.code,
    };
  }

  return {
    message: error instanceof Error ? error.message : "Unable to complete Calendly storage operation.",
    status: 500,
    code: "calendly_store_error",
  };
}
