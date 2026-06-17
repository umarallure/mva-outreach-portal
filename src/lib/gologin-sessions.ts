import "server-only";

import type { User } from "@supabase/supabase-js";
import type { AppUserProfile } from "@/lib/access";
import type { OutreachAccountDefinition } from "@/config/pipelines";
import { createClient } from "@/lib/supabase/server";
import { decryptSecret, encryptSecret, hasSessionEncryptionKey, SessionEncryptionError } from "@/lib/encryption";
import { GologinApiError, startCloudProfile, stopCloudProfile } from "@/lib/gologin";

export type OutreachSessionStatus = "starting" | "active" | "stopping" | "stopped" | "error";

export type SanitizedOutreachSession = {
  id: string;
  pipelineId: string;
  status: OutreachSessionStatus;
  launchedBy: string;
  launchedByLabel: string;
  startedAt: string;
  lastSeenAt: string | null;
  stoppedAt: string | null;
  errorMessage: string | null;
  liveViewUrl: string | null;
  launchUrl: string | null;
  secretError?: string;
};

type SessionRow = {
  id: string;
  pipeline_id: string;
  gologin_profile_id: string;
  status: OutreachSessionStatus;
  launched_by: string;
  started_at: string;
  last_seen_at: string | null;
  stopped_at: string | null;
  error_message: string | null;
  live_view_url: string | null;
  launch_url: string | null;
  created_at?: string;
  updated_at?: string;
};

type DatabaseError = {
  code?: string;
  message?: string;
  details?: string;
};

const TABLE = "outreach_gologin_sessions";
const ACTIVE_STATUSES: OutreachSessionStatus[] = ["starting", "active", "stopping"];
const DEFAULT_STALE_SESSION_MINUTES = 120;
const SESSION_COLUMNS = [
  "id",
  "pipeline_id",
  "gologin_profile_id",
  "status",
  "launched_by",
  "started_at",
  "last_seen_at",
  "stopped_at",
  "error_message",
  "live_view_url",
  "launch_url",
  "created_at",
  "updated_at",
].join(",");

export class OutreachSessionError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "session_error") {
    super(message);
    this.name = "OutreachSessionError";
    this.status = status;
    this.code = code;
  }
}

export class OutreachSessionConflictError extends OutreachSessionError {
  activeSession: SanitizedOutreachSession | null;

  constructor(activeSession: SanitizedOutreachSession | null) {
    super("This GoLogin profile is already active.", 409, "profile_active");
    this.name = "OutreachSessionConflictError";
    this.activeSession = activeSession;
  }
}

const isDatabaseError = (error: unknown): error is DatabaseError =>
  Boolean(error) && typeof error === "object";

function isMissingTableError(error: unknown) {
  if (!isDatabaseError(error)) return false;

  return (
    error.code === "42P01" ||
    error.message?.includes(TABLE) ||
    error.details?.includes(TABLE)
  );
}

function isUniqueViolation(error: unknown) {
  if (!isDatabaseError(error)) return false;

  return error.code === "23505" || Boolean(error.message?.includes("duplicate key"));
}

function normalizeStoreError(error: unknown) {
  if (isMissingTableError(error)) {
    return new OutreachSessionError(
      "GoLogin session storage is not ready. Apply the outreach_gologin_sessions migration.",
      503,
      "missing_session_table",
    );
  }

  const message =
    isDatabaseError(error) && error.message
      ? error.message
      : "Unable to read GoLogin session storage.";

  return new OutreachSessionError(message, 500, "session_store_error");
}

function staleSessionCutoff() {
  const raw = Number(process.env.OUTREACH_SESSION_STALE_MINUTES ?? DEFAULT_STALE_SESSION_MINUTES);
  const minutes = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_STALE_SESSION_MINUTES;

  return new Date(Date.now() - minutes * 60_000).toISOString();
}

async function releaseStaleSessions(supabase: Awaited<ReturnType<typeof createClient>>) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from(TABLE)
    .update({
      status: "error",
      error_message: "Session heartbeat timed out.",
      stopped_at: now,
      live_view_url: null,
      launch_url: null,
      updated_at: now,
    })
    .in("status", ACTIVE_STATUSES)
    .lt("last_seen_at", staleSessionCutoff());

  if (error) throw normalizeStoreError(error);
}

function operatorLabel(profile: AppUserProfile) {
  return profile?.display_name || profile?.email || "Operator";
}

async function getLauncherLabel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  currentProfile?: AppUserProfile,
) {
  if (currentProfile?.user_id === userId) return operatorLabel(currentProfile);

  const { data } = await supabase
    .from("app_users")
    .select("display_name,email")
    .eq("user_id", userId)
    .maybeSingle();

  const launcher = data as { display_name?: string | null; email?: string | null } | null;
  return launcher?.display_name || launcher?.email || "another operator";
}

async function toSanitizedSession(
  row: SessionRow,
  supabase: Awaited<ReturnType<typeof createClient>>,
  currentProfile?: AppUserProfile,
): Promise<SanitizedOutreachSession> {
  let liveViewUrl: string | null = null;
  let launchUrl: string | null = null;
  let secretError: string | undefined;

  try {
    liveViewUrl = decryptSecret(row.live_view_url);
    launchUrl = decryptSecret(row.launch_url);
  } catch (error) {
    secretError =
      error instanceof Error
        ? error.message
        : "Unable to decrypt the stored GoLogin session URL.";
  }

  return {
    id: row.id,
    pipelineId: row.pipeline_id,
    status: row.status,
    launchedBy: row.launched_by,
    launchedByLabel: await getLauncherLabel(supabase, row.launched_by, currentProfile),
    startedAt: row.started_at,
    lastSeenAt: row.last_seen_at,
    stoppedAt: row.stopped_at,
    errorMessage: row.error_message,
    liveViewUrl,
    launchUrl,
    ...(secretError ? { secretError } : {}),
  };
}

async function fetchActiveSessionByProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(SESSION_COLUMNS)
    .eq("gologin_profile_id", profileId)
    .in("status", ACTIVE_STATUSES)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw normalizeStoreError(error);
  return (data as unknown as SessionRow | null) ?? null;
}

async function fetchSessionById(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(SESSION_COLUMNS)
    .eq("id", sessionId)
    .maybeSingle();

  if (error) throw normalizeStoreError(error);
  return (data as unknown as SessionRow | null) ?? null;
}

export async function getActiveSessionForAccount(
  account: OutreachAccountDefinition,
  currentProfile?: AppUserProfile,
) {
  const supabase = await createClient();
  await releaseStaleSessions(supabase);

  const { data, error } = await supabase
    .from(TABLE)
    .select(SESSION_COLUMNS)
    .eq("pipeline_id", account.id)
    .in("status", ACTIVE_STATUSES)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw normalizeStoreError(error);
  if (!data) return null;

  return toSanitizedSession(data as unknown as SessionRow, supabase, currentProfile);
}

export async function startAccountSession(
  account: OutreachAccountDefinition,
  user: User,
  profile: AppUserProfile,
) {
  if (!account.gologinProfileId) {
    throw new OutreachSessionError("GoLogin profile is not configured for this account.", 409, "missing_profile");
  }

  if (!hasSessionEncryptionKey()) {
    throw new SessionEncryptionError();
  }

  const supabase = await createClient();
  await releaseStaleSessions(supabase);

  const existing = await fetchActiveSessionByProfile(supabase, account.gologinProfileId);

  if (existing) {
    throw new OutreachSessionConflictError(await toSanitizedSession(existing, supabase, profile));
  }

  const now = new Date().toISOString();
  const { data: inserted, error: insertError } = await supabase
    .from(TABLE)
    .insert({
      pipeline_id: account.id,
      gologin_profile_id: account.gologinProfileId,
      status: "starting",
      launched_by: user.id,
      started_at: now,
      last_seen_at: now,
    })
    .select(SESSION_COLUMNS)
    .single();

  if (insertError) {
    if (isUniqueViolation(insertError)) {
      const active = await fetchActiveSessionByProfile(supabase, account.gologinProfileId);
      throw new OutreachSessionConflictError(
        active ? await toSanitizedSession(active, supabase, profile) : null,
      );
    }

    throw normalizeStoreError(insertError);
  }

  const row = inserted as unknown as SessionRow;

  try {
    const launch = await startCloudProfile(account.gologinProfileId);
    const updateAt = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from(TABLE)
      .update({
        status: "active",
        live_view_url: encryptSecret(launch.liveViewUrl),
        launch_url: encryptSecret(launch.launchUrl),
        response_shape: launch.responseShape,
        last_seen_at: updateAt,
        updated_at: updateAt,
      })
      .eq("id", row.id)
      .select(SESSION_COLUMNS)
      .single();

    if (updateError) throw normalizeStoreError(updateError);

    return toSanitizedSession(updated as unknown as SessionRow, supabase, profile);
  } catch (error) {
    const failedAt = new Date().toISOString();
    await supabase
      .from(TABLE)
      .update({
        status: "error",
        error_message: error instanceof Error ? error.message : "Unable to start GoLogin profile.",
        stopped_at: failedAt,
        updated_at: failedAt,
      })
      .eq("id", row.id);

    throw error;
  }
}

export async function stopAccountSession(sessionId: string, currentProfile?: AppUserProfile) {
  const supabase = await createClient();
  const row = await fetchSessionById(supabase, sessionId);

  if (!row) {
    throw new OutreachSessionError("GoLogin session was not found.", 404, "session_not_found");
  }

  if (row.status === "stopped" || row.status === "error") {
    return toSanitizedSession(row, supabase, currentProfile);
  }

  await supabase
    .from(TABLE)
    .update({ status: "stopping", updated_at: new Date().toISOString() })
    .eq("id", row.id);

  try {
    await stopCloudProfile(row.gologin_profile_id);
    const stoppedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from(TABLE)
      .update({
        status: "stopped",
        stopped_at: stoppedAt,
        last_seen_at: stoppedAt,
        live_view_url: null,
        launch_url: null,
        updated_at: stoppedAt,
      })
      .eq("id", row.id)
      .select(SESSION_COLUMNS)
      .single();

    if (error) throw normalizeStoreError(error);
    return toSanitizedSession(data as unknown as SessionRow, supabase, currentProfile);
  } catch (error) {
    const failedAt = new Date().toISOString();
    await supabase
      .from(TABLE)
      .update({
        status: "error",
        error_message: error instanceof Error ? error.message : "Unable to stop GoLogin profile.",
        stopped_at: failedAt,
        live_view_url: null,
        launch_url: null,
        updated_at: failedAt,
      })
      .eq("id", row.id);

    if (error instanceof GologinApiError) throw error;
    throw new OutreachSessionError("Unable to stop GoLogin profile.", 502, "stop_failed");
  }
}

/**
 * Resolve the raw connection target for an active session so a viewer ticket can be
 * issued. Returns null when the session is missing or no longer active. Intentionally
 * does NOT decrypt the live-view URL — only the gateway needs the profile id.
 */
export async function getViewerSessionTarget(sessionId: string) {
  const supabase = await createClient();
  const row = await fetchSessionById(supabase, sessionId);
  if (!row) return null;

  return {
    pipelineId: row.pipeline_id,
    gologinProfileId: row.gologin_profile_id,
    status: row.status,
    isActive: ACTIVE_STATUSES.includes(row.status),
  };
}

export async function heartbeatAccountSession(sessionId: string, currentProfile?: AppUserProfile) {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .update({ last_seen_at: now, updated_at: now })
    .eq("id", sessionId)
    .in("status", ACTIVE_STATUSES)
    .select(SESSION_COLUMNS)
    .maybeSingle();

  if (error) throw normalizeStoreError(error);
  if (!data) {
    throw new OutreachSessionError("Active GoLogin session was not found.", 404, "session_not_found");
  }

  return toSanitizedSession(data as unknown as SessionRow, supabase, currentProfile);
}
