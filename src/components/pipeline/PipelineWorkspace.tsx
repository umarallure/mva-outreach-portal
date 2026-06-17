"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Clock3,
  ExternalLink,
  Link2,
  Loader2,
  MonitorPlay,
  Power,
  RotateCcw,
  Square,
  UserCircle2,
  Wifi,
} from "lucide-react";
import { CloudBrowserViewer, type CloudBrowserViewerHandle } from "./CloudBrowserViewer";

type AccountWorkspaceView = {
  id: string;
  ownerSlug: string;
  ownerName: string;
  pipelineSlug: string;
  pipelineName: string;
  title: string;
  sidebarLabel: string;
  defaultTargetUrl: string;
  flowchatUrl: string;
  linkedinUrl: string;
  canStartGologin: boolean;
  status: string;
};

type SessionStatus = "starting" | "active" | "stopping" | "stopped" | "error";

type OutreachSession = {
  id: string;
  pipelineId: string;
  status: SessionStatus;
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

type GologinProfileStatus = {
  state: "running" | "stopped" | "unknown";
  rawStatus: string | null;
  profileName: string | null;
  checkedAt: string;
  error?: string;
};

type SessionApiPayload = {
  session?: OutreachSession | null;
  activeSession?: OutreachSession | null;
  profileStatus?: GologinProfileStatus | null;
  setup?: {
    hasGologinProfile: boolean;
    hasTargetUrl: boolean;
  };
  error?: string;
};

type ActionState = "idle" | "starting" | "stopping" | "restarting";

const activeStatuses = new Set<SessionStatus>(["starting", "active", "stopping"]);

function formatRelativeAge(value: string | null) {
  if (!value) return "not recorded";

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "not recorded";

  const diffMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return `${Math.floor(diffHours / 24)}d ago`;
}

function formatDateTime(value: string | null) {
  if (!value) return "not recorded";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function profileStatusLabel(status: GologinProfileStatus | null) {
  if (!status) return "Not checked";
  if (status.rawStatus) return status.rawStatus;
  return status.state;
}

function displayHost(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function statusDot(status: string) {
  if (status === "ready" || status === "active" || status === "running") return "bg-emerald-400";
  if (status === "starting" || status === "stopping" || status === "unknown") return "bg-amber-400";
  return "bg-red-400";
}

function workspaceButton(disabled = false) {
  return `inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-medium transition ${
    disabled
      ? "cursor-not-allowed border-[var(--dash-border)] text-[var(--dash-text-muted)] opacity-50"
      : "border-[var(--dash-border)] text-[var(--dash-text-muted)] hover:border-[#AE4010]/40 hover:bg-[#AE4010]/10 hover:text-[var(--dash-text)]"
  }`;
}

export function PipelineWorkspace({ pipeline }: { pipeline: AccountWorkspaceView }) {
  const [session, setSession] = useState<OutreachSession | null>(null);
  const [profileStatus, setProfileStatus] = useState<GologinProfileStatus | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<ActionState>("idle");
  const [initialLoading, setInitialLoading] = useState(true);
  const viewerRef = useRef<CloudBrowserViewerHandle>(null);
  const [viewerConnected, setViewerConnected] = useState(false);

  const liveViewUrl = session?.liveViewUrl ?? session?.launchUrl ?? null;
  const isBusy = actionState !== "idle";
  const isSessionActive = Boolean(session && activeStatuses.has(session.status));
  const effectiveProfileStatus =
    isSessionActive && profileStatus?.state === "unknown"
      ? ({ ...profileStatus, state: "running", rawStatus: "active session" } satisfies GologinProfileStatus)
      : profileStatus;
  const canStart = pipeline.canStartGologin && !isBusy;
  const canStop = Boolean(session && activeStatuses.has(session.status) && !isBusy);
  const targetUrl = pipeline.defaultTargetUrl || pipeline.flowchatUrl || pipeline.linkedinUrl;

  // When the live browser is embedded + connected, links drive the embedded tab
  // (Page.navigate) instead of opening a new browser tab. Falls back to a new tab
  // when the viewer isn't connected yet.
  const liveControlActive = viewerConnected && isSessionActive;

  const driveOrOpen = useCallback(
    (url: string, event: React.MouseEvent<HTMLAnchorElement>) => {
      if (liveControlActive && url) {
        event.preventDefault();
        viewerRef.current?.navigate(url);
      }
    },
    [liveControlActive],
  );

  const setupWarnings = useMemo(
    () =>
      [
        !pipeline.canStartGologin ? "GoLogin profile ID is not configured for this account." : null,
        !targetUrl ? "No FlowChat, LinkedIn, or default target URL is configured yet." : null,
        session?.secretError ?? null,
      ].filter(Boolean) as string[],
    [pipeline.canStartGologin, session?.secretError, targetUrl],
  );

  const loadSession = useCallback(async () => {
    try {
      const response = await fetch(`/api/gologin/sessions?pipelineId=${encodeURIComponent(pipeline.id)}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as SessionApiPayload;

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load GoLogin session state.");
      }

      setSession(payload.session ?? null);
      setProfileStatus(payload.profileStatus ?? null);
      setSessionError(null);
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : "Unable to load GoLogin session state.");
    } finally {
      setInitialLoading(false);
    }
  }, [pipeline.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSession(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSession]);

  useEffect(() => {
    if (!isSessionActive || !session?.id) return;

    const heartbeat = async () => {
      try {
        const response = await fetch(`/api/gologin/sessions/${session.id}/heartbeat`, {
          method: "POST",
        });
        const payload = (await response.json()) as SessionApiPayload;
        if (response.ok && payload.session) setSession(payload.session);
      } catch {
        // Polling below will surface persistent failures without interrupting the operator.
      }
    };

    const heartbeatTimer = window.setInterval(heartbeat, 30_000);
    const pollTimer = window.setInterval(() => void loadSession(), 20_000);

    return () => {
      window.clearInterval(heartbeatTimer);
      window.clearInterval(pollTimer);
    };
  }, [isSessionActive, loadSession, session?.id]);

  const startSession = async (state: ActionState = "starting") => {
    setActionState(state);
    setSessionError(null);

    try {
      const response = await fetch("/api/gologin/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineId: pipeline.id }),
      });
      const payload = (await response.json()) as SessionApiPayload;

      if (!response.ok || !payload.session) {
        if (payload.activeSession) setSession(payload.activeSession);
        throw new Error(payload.error ?? "Unable to start GoLogin profile.");
      }

      setSession(payload.session);
      await loadSession();
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : "Unable to start GoLogin profile.");
    } finally {
      setActionState("idle");
    }
  };

  const stopSession = async (state: ActionState = "stopping") => {
    if (!session?.id) return false;

    setActionState(state);
    setSessionError(null);

    try {
      const response = await fetch(`/api/gologin/sessions/${session.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as SessionApiPayload;

      if (!response.ok || !payload.session) {
        throw new Error(payload.error ?? "Unable to stop GoLogin profile.");
      }

      setSession(payload.session.status === "stopped" ? null : payload.session);
      await loadSession();
      return true;
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : "Unable to stop GoLogin profile.");
      return false;
    } finally {
      setActionState("idle");
    }
  };

  const restartSession = async () => {
    setActionState("restarting");
    setSessionError(null);

    try {
      if (session?.id) {
        const stopResponse = await fetch(`/api/gologin/sessions/${session.id}`, {
          method: "DELETE",
        });
        const stopPayload = (await stopResponse.json()) as SessionApiPayload;
        if (!stopResponse.ok) {
          throw new Error(stopPayload.error ?? "Unable to stop GoLogin profile.");
        }
      }

      const startResponse = await fetch("/api/gologin/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineId: pipeline.id }),
      });
      const startPayload = (await startResponse.json()) as SessionApiPayload;

      if (!startResponse.ok || !startPayload.session) {
        if (startPayload.activeSession) setSession(startPayload.activeSession);
        throw new Error(startPayload.error ?? "Unable to restart GoLogin profile.");
      }

      setSession(startPayload.session);
      await loadSession();
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : "Unable to restart GoLogin profile.");
    } finally {
      setActionState("idle");
    }
  };

  const sessionAge = useMemo(() => formatRelativeAge(session?.startedAt ?? null), [session?.startedAt]);

  return (
    <div className="dashboard-premium min-h-full px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-[1600px] flex-col gap-5">
        <section className="dash-animate-in rounded-[var(--dash-radius)] border border-[var(--dash-border)] bg-[var(--dash-surface)] px-5 py-4 backdrop-blur-[var(--dash-blur)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--dash-text-muted)]">
                Account Workspace
              </p>
              <h2 className="mt-1 text-xl font-semibold text-[var(--dash-text)]">
                {pipeline.ownerName} · {pipeline.pipelineName}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {pipeline.flowchatUrl ? (
                <a
                  className={workspaceButton()}
                  href={pipeline.flowchatUrl}
                  onClick={(e) => driveOrOpen(pipeline.flowchatUrl, e)}
                  rel="noreferrer"
                  target="_blank"
                  title={liveControlActive ? "Open FlowChat in the live browser" : "Open FlowChat in a new tab"}
                >
                  FlowChat
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
              {pipeline.linkedinUrl ? (
                <a
                  className={workspaceButton()}
                  href={pipeline.linkedinUrl}
                  onClick={(e) => driveOrOpen(pipeline.linkedinUrl, e)}
                  rel="noreferrer"
                  target="_blank"
                  title={liveControlActive ? "Open LinkedIn in the live browser" : "Open LinkedIn in a new tab"}
                >
                  LinkedIn
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
              {liveViewUrl ? (
                <a className={workspaceButton()} href={liveViewUrl} rel="noreferrer" target="_blank">
                  Live View
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
              <button
                className={workspaceButton(!canStart || isSessionActive)}
                disabled={!canStart || isSessionActive}
                onClick={() => void startSession()}
                type="button"
              >
                {actionState === "starting" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Power className="h-3.5 w-3.5" />
                )}
                Start Profile
              </button>
              <button
                className={workspaceButton(!canStop)}
                disabled={!canStop}
                onClick={() => void stopSession()}
                type="button"
              >
                {actionState === "stopping" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Square className="h-3.5 w-3.5" />
                )}
                Stop
              </button>
              <button
                className={workspaceButton(!pipeline.canStartGologin || isBusy)}
                disabled={!pipeline.canStartGologin || isBusy}
                onClick={() => void restartSession()}
                type="button"
              >
                {actionState === "restarting" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                Restart
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-[var(--dash-border)] bg-white/[0.025] p-3">
              <div className="flex items-center gap-2 text-xs text-[var(--dash-text-muted)]">
                <Wifi className="h-3.5 w-3.5" />
                Profile Status
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-[var(--dash-text)]">
                <span className={`h-2 w-2 rounded-full ${statusDot(effectiveProfileStatus?.state ?? "unknown")}`} />
                {initialLoading ? "Checking..." : profileStatusLabel(effectiveProfileStatus)}
              </div>
              {profileStatus?.error ? (
                <p className="mt-1 text-xs text-amber-100">{profileStatus.error}</p>
              ) : null}
            </div>

            <div className="rounded-lg border border-[var(--dash-border)] bg-white/[0.025] p-3">
              <div className="flex items-center gap-2 text-xs text-[var(--dash-text-muted)]">
                <UserCircle2 className="h-3.5 w-3.5" />
                Active Operator
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-[var(--dash-text)]">
                <span className={`h-2 w-2 rounded-full ${statusDot(session?.status ?? "stopped")}`} />
                {session ? session.launchedByLabel : "No active session"}
              </div>
              <p className="mt-1 text-xs text-[var(--dash-text-muted)]">
                {session ? `Started ${sessionAge}` : "Profile lock is available"}
              </p>
            </div>

            <div className="rounded-lg border border-[var(--dash-border)] bg-white/[0.025] p-3">
              <div className="flex items-center gap-2 text-xs text-[var(--dash-text-muted)]">
                <Link2 className="h-3.5 w-3.5" />
                Target
              </div>
              <div className="mt-2 truncate text-sm font-semibold text-[var(--dash-text)]">
                {targetUrl ? displayHost(targetUrl) : "Not configured"}
              </div>
              <p className="mt-1 text-xs text-[var(--dash-text-muted)]">
                {targetUrl ? "Auto-opens in the live browser on start" : "Add a target URL env var"}
              </p>
            </div>
          </div>

          {session && activeStatuses.has(session.status) ? (
            <div className="mt-4 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              This profile is already active by {session.launchedByLabel} since{" "}
              {formatDateTime(session.startedAt)}.
            </div>
          ) : null}

          {[...setupWarnings, sessionError].filter(Boolean).map((warning) => (
            <div
              className="mt-3 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-100"
              key={warning}
            >
              <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{warning}</span>
              </div>
            </div>
          ))}
        </section>

        <section className="dash-animate-in flex min-h-[680px] flex-1 overflow-hidden rounded-[var(--dash-radius)] border border-[var(--dash-border)] bg-[var(--dash-surface)] backdrop-blur-[var(--dash-blur)]">
          {isSessionActive && session ? (
            <CloudBrowserViewer
              key={session.id}
              ref={viewerRef}
              sessionId={session.id}
              autoOpenUrl={pipeline.flowchatUrl}
              onStatusChange={(s) => setViewerConnected(s === "streaming")}
            />
          ) : (
            <div className="flex min-h-[680px] w-full items-center justify-center p-8">
              <div className="max-w-lg text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-[#AE4010]/10">
                  <MonitorPlay className="h-6 w-6 text-[#AE4010]" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-[var(--dash-text)]">
                  GoLogin profile is not running
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--dash-text-muted)]">
                  Start the mapped cloud profile to open this account with its stored cookies,
                  proxy, and browser fingerprint.
                </p>
                <button
                  className={`mt-5 ${workspaceButton(!canStart || isSessionActive)}`}
                  disabled={!canStart || isSessionActive}
                  onClick={() => void startSession()}
                  type="button"
                >
                  {actionState === "starting" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Power className="h-3.5 w-3.5" />
                  )}
                  Start Profile
                </button>
              </div>
            </div>
          )}
        </section>

        <div className="dash-animate-in rounded-[var(--dash-radius)] border border-[var(--dash-border)] bg-[var(--dash-surface)] px-4 py-3 text-sm text-[var(--dash-text-muted)] backdrop-blur-[var(--dash-blur)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-[#AE4010]" />
              <span>
                {session?.lastSeenAt
                  ? `Last heartbeat ${formatRelativeAge(session.lastSeenAt)}`
                  : "No live session heartbeat yet"}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {targetUrl ? (
                <a
                  className={workspaceButton()}
                  href={targetUrl}
                  onClick={(e) => driveOrOpen(targetUrl, e)}
                  rel="noreferrer"
                  target="_blank"
                >
                  Target
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
              {liveViewUrl ? (
                <a className={workspaceButton()} href={liveViewUrl} rel="noreferrer" target="_blank">
                  Open Live View in New Tab
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
