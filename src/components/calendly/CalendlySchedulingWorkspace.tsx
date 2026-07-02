"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  Clock3,
  MapPin,
  PlugZap,
  RefreshCw,
  Search,
} from "lucide-react";
import type {
  CalendlyMeetingState,
  CalendlyMeetingView,
  CalendlyWorkspaceSummary,
  CalendlyWorkspaceView,
} from "@/lib/calendly/types";

type SchedulingWorkspaceProps = {
  workspace: CalendlyWorkspaceView;
};

type StatusFilter = "all" | CalendlyMeetingState;
type StateCounts = Record<CalendlyMeetingState, number>;

const statusMeta: Record<CalendlyMeetingState, { label: string; hex: string; badge: string }> = {
  scheduled: {
    label: "Scheduled",
    hex: "#4aa3e0",
    badge: "border-[#4aa3e0]/25 bg-[#4aa3e0]/10 text-[#bfe0f5]",
  },
  in_progress: {
    label: "In progress",
    hex: "#f5a524",
    badge: "border-[#f5a524]/25 bg-[#f5a524]/10 text-[#f7d59a]",
  },
  completed: {
    label: "Completed",
    hex: "#3fb871",
    badge: "border-[#3fb871]/25 bg-[#3fb871]/10 text-[#a9e6c4]",
  },
  rescheduled: {
    label: "Rescheduled",
    hex: "#a78bfa",
    badge: "border-[#a78bfa]/25 bg-[#a78bfa]/10 text-[#d6cbfb]",
  },
  canceled: {
    label: "Canceled",
    hex: "#e0685f",
    badge: "border-[#e0685f]/25 bg-[#e0685f]/10 text-[#f2b6b0]",
  },
  no_show: {
    label: "No-show",
    hex: "#e8843a",
    badge: "border-[#e8843a]/25 bg-[#e8843a]/10 text-[#f5c298]",
  },
};

const STATE_ORDER: CalendlyMeetingState[] = [
  "scheduled",
  "in_progress",
  "completed",
  "rescheduled",
  "canceled",
  "no_show",
];

const filterOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "canceled", label: "Canceled" },
  { value: "rescheduled", label: "Rescheduled" },
  { value: "no_show", label: "No-show" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function meetingId(meeting: CalendlyMeetingView) {
  return meeting.inviteeUri ?? meeting.eventUri;
}

function safeDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatTimeRange(meeting: CalendlyMeetingView) {
  const start = safeDate(meeting.startTime);
  const end = safeDate(meeting.endTime);
  if (!start || !end) return "—";

  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).formatRange(
    start,
    end,
  );
}

function formatFullRange(meeting: CalendlyMeetingView) {
  const start = safeDate(meeting.startTime);
  const end = safeDate(meeting.endTime);
  if (!start || !end) return "Time unavailable";

  const day = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(start);
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).formatRange(start, end);

  return `${day} · ${time}`;
}

function formatDateTime(value: string | null) {
  const date = safeDate(value);
  if (!date) return "—";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatRelative(value: string | null) {
  const date = safeDate(value);
  if (!date) return null;

  const diff = Math.abs(Date.now() - date.getTime());
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < DAY_MS) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / DAY_MS)}d ago`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function formatDayLabel(date: Date) {
  const delta = Math.round((startOfDay(date) - startOfDay(new Date())) / DAY_MS);
  if (delta === 0) return "Today";
  if (delta === 1) return "Tomorrow";
  if (delta === -1) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date);
}

function formatDayDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function inviteeLabel(meeting: CalendlyMeetingView) {
  return meeting.inviteeName?.trim() ? meeting.inviteeName : "Unknown invitee";
}

// Turn a Calendly invitee URI into a short, readable reference code (the leading
// block of its UUID) instead of surfacing the raw API link.
function shortInviteeRef(uri: string | null | undefined) {
  if (!uri?.trim()) return null;
  const lastSegment = uri.split("/").filter(Boolean).pop();
  const head = lastSegment?.split("-")[0];
  return head ? head.toUpperCase() : null;
}

function describeReschedule(meeting: CalendlyMeetingView): {
  message: string;
  refLabel: string | null;
  ref: string | null;
} {
  const newRef = shortInviteeRef(meeting.newInviteeUri);
  if (newRef) {
    return { message: "This booking was moved to a new time.", refLabel: "New booking", ref: newRef };
  }

  const oldRef = shortInviteeRef(meeting.oldInviteeUri);
  if (oldRef) {
    return { message: "Rescheduled from an earlier booking.", refLabel: "Previous booking", ref: oldRef };
  }

  return { message: "This booking was rescheduled.", refLabel: null, ref: null };
}

type DayGroup = { key: string; date: Date | null; meetings: CalendlyMeetingView[] };

function groupByDay(meetings: CalendlyMeetingView[]): DayGroup[] {
  const groups: DayGroup[] = [];
  const index = new Map<string, DayGroup>();

  for (const meeting of meetings) {
    const date = safeDate(meeting.startTime);
    const key = date ? String(startOfDay(date)) : "undated";
    let group = index.get(key);

    if (!group) {
      group = { key, date, meetings: [] };
      index.set(key, group);
      groups.push(group);
    }

    group.meetings.push(meeting);
  }

  return groups;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--dash-text-muted)]">
      {children}
    </p>
  );
}

function StatusBadge({ state }: { state: CalendlyMeetingState }) {
  const meta = statusMeta[state];

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.badge}`}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.hex }} />
      {meta.label}
    </span>
  );
}

function StatRibbon({
  summary,
  counts,
}: {
  summary: CalendlyWorkspaceSummary;
  counts: StateCounts;
}) {
  const stats: Array<{ label: string; value: number }> = [
    { label: "Total", value: summary.total },
    { label: "Upcoming", value: summary.upcoming },
    { label: "Today", value: summary.today },
    { label: "Completed", value: summary.completed },
    { label: "Canceled / resched", value: summary.canceledOrRescheduled },
    { label: "No-show", value: summary.noShow },
  ];

  const present = STATE_ORDER.filter((state) => counts[state] > 0);
  const total = summary.total;

  return (
    <section
      className="dash-animate-in rounded-[var(--dash-radius)] border border-[var(--dash-border)] bg-[var(--dash-surface)] p-5 backdrop-blur-[var(--dash-blur)]"
      style={{ animationDelay: "60ms" }}
    >
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--dash-text-muted)]">
              {stat.label}
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[var(--dash-text)]">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <div
          className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]"
          role="img"
          aria-label={`Meeting distribution across ${total} total`}
        >
          {total > 0
            ? present.map((state) => (
                <div
                  key={state}
                  title={`${statusMeta[state].label}: ${counts[state]}`}
                  style={{
                    width: `${(counts[state] / total) * 100}%`,
                    backgroundColor: statusMeta[state].hex,
                  }}
                />
              ))
            : null}
        </div>

        {present.length ? (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {present.map((state) => (
              <span
                key={state}
                className="inline-flex items-center gap-1.5 text-[11px] text-[var(--dash-text-muted)]"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: statusMeta[state].hex }}
                />
                {statusMeta[state].label}
                <span className="font-mono tabular-nums text-[var(--dash-text)]">
                  {counts[state]}
                </span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function MeetingRow({
  meeting,
  selected,
  onSelect,
}: {
  meeting: CalendlyMeetingView;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = statusMeta[meeting.state];

  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={`group relative flex w-full items-center gap-3 py-3 pl-5 pr-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#AE4010]/50 ${
          selected ? "bg-[#AE4010]/10" : "hover:bg-white/[0.03]"
        }`}
      >
        <span
          className={`absolute inset-y-0 left-0 w-[3px] transition-opacity ${
            selected ? "opacity-100" : "opacity-40 group-hover:opacity-80"
          }`}
          style={{ backgroundColor: meta.hex }}
        />

        <span className="w-[5.5rem] shrink-0 font-mono text-xs tabular-nums text-[var(--dash-text)]">
          {formatTimeRange(meeting)}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-[var(--dash-text)]">
            {inviteeLabel(meeting)}
          </span>
          <span className="mt-0.5 block truncate text-xs text-[var(--dash-text-muted)]">
            {meeting.eventName}
          </span>
        </span>

        <span className="hidden min-w-0 flex-1 lg:block">
          <span className="block truncate text-xs text-[var(--dash-text-muted)]">
            {meeting.inviteeEmail ?? "No email"}
          </span>
          <span className="mt-0.5 flex items-center gap-1 text-xs text-[var(--dash-text-muted)]">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{meeting.locationLabel}</span>
          </span>
        </span>

        <StatusBadge state={meeting.state} />
      </button>
    </li>
  );
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--dash-text-muted)]">
        {label}
      </p>
      <p className="mt-1 break-words text-sm text-[var(--dash-text)]">
        {value?.trim() ? value : "—"}
      </p>
    </div>
  );
}

function Callout({
  title,
  hex,
  border,
  bg,
  text,
  children,
}: {
  title: string;
  hex: string;
  border: string;
  bg: string;
  text: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border ${border} ${bg} p-3`}>
      <p className={`flex items-center gap-1.5 text-xs font-semibold ${text}`}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: hex }} />
        {title}
      </p>
      <div className="mt-1.5 space-y-1">{children}</div>
    </div>
  );
}

function MeetingDetail({
  meeting,
  mounted,
}: {
  meeting: CalendlyMeetingView | null;
  mounted: boolean;
}) {
  if (!meeting) {
    return (
      <div className="flex min-h-[18rem] flex-col items-center justify-center gap-3 rounded-[var(--dash-radius)] border border-dashed border-[var(--dash-border)] bg-[var(--dash-surface)] p-8 text-center backdrop-blur-[var(--dash-blur)]">
        <CalendarClock className="h-6 w-6 text-[var(--dash-text-muted)]" />
        <p className="max-w-[15rem] text-sm text-[var(--dash-text-muted)]">
          Select a meeting to see invitee, questions, and campaign details.
        </p>
      </div>
    );
  }

  const trackingRows = (
    [
      ["Source", meeting.tracking.utmSource],
      ["Medium", meeting.tracking.utmMedium],
      ["Campaign", meeting.tracking.utmCampaign],
      ["Content", meeting.tracking.utmContent],
      ["Term", meeting.tracking.utmTerm],
      ["Salesforce", meeting.tracking.salesforceUuid],
    ] as const
  ).filter(([, value]) => Boolean(value?.trim()));

  const reschedule = meeting.rescheduled ? describeReschedule(meeting) : null;

  return (
    <div className="overflow-hidden rounded-[var(--dash-radius)] border border-[var(--dash-border)] bg-[var(--dash-surface)] backdrop-blur-[var(--dash-blur)]">
      <div className="border-b border-[var(--dash-border)] p-5">
        <div className="flex items-center justify-between gap-2">
          <StatusBadge state={meeting.state} />
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--dash-text-muted)]">
            {meeting.eventStatus}
          </span>
        </div>
        <h3 className="mt-3 break-words text-lg font-semibold leading-tight text-[var(--dash-text)]">
          {meeting.eventName}
        </h3>
        <p className="mt-2 flex items-center gap-1.5 font-mono text-xs text-[var(--dash-text-muted)]">
          <Clock3 className="h-3.5 w-3.5 shrink-0" />
          {mounted ? formatFullRange(meeting) : "—"}
        </p>
      </div>

      <div className="space-y-6 p-5">
        <section>
          <SectionTitle>Invitee</SectionTitle>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4">
            <DetailField label="Name" value={meeting.inviteeName} />
            <DetailField label="Email" value={meeting.inviteeEmail} />
            <DetailField label="Timezone" value={meeting.timezone} />
            <DetailField label="Location" value={meeting.locationLabel} />
          </div>
        </section>

        <section>
          <SectionTitle>Questions</SectionTitle>
          <div className="mt-3 space-y-2">
            {meeting.questionsAndAnswers.length ? (
              meeting.questionsAndAnswers.map((entry, index) => (
                <div
                  className="rounded-lg border border-[var(--dash-border)] bg-white/[0.02] p-3"
                  key={`${entry.question}-${index}`}
                >
                  <p className="text-xs font-medium text-[var(--dash-text)]">{entry.question}</p>
                  <p className="mt-1 break-words text-sm text-[var(--dash-text-muted)]">
                    {entry.answer?.trim() ? entry.answer : "—"}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-[var(--dash-text-muted)]">No questions on this booking.</p>
            )}
          </div>
        </section>

        {trackingRows.length ? (
          <section>
            <SectionTitle>Campaign</SectionTitle>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4">
              {trackingRows.map(([label, value]) => (
                <DetailField key={label} label={label} value={value} />
              ))}
            </div>
          </section>
        ) : null}

        {meeting.cancellation ? (
          <Callout
            title="Canceled"
            hex={statusMeta.canceled.hex}
            border="border-[#e0685f]/25"
            bg="bg-[#e0685f]/10"
            text="text-[#f2b6b0]"
          >
            <p className="text-xs text-[#f2b6b0]/85">
              {meeting.cancellation.canceledBy} ·{" "}
              {meeting.cancellation.reason?.trim() ? meeting.cancellation.reason : "No reason given"}
            </p>
            <p className="font-mono text-[11px] text-[#f2b6b0]/60">
              {mounted ? formatDateTime(meeting.cancellation.createdAt) : "—"}
            </p>
          </Callout>
        ) : null}

        {reschedule ? (
          <Callout
            title="Rescheduled"
            hex={statusMeta.rescheduled.hex}
            border="border-[#a78bfa]/25"
            bg="bg-[#a78bfa]/10"
            text="text-[#d6cbfb]"
          >
            <p className="text-xs text-[#d6cbfb]/85">{reschedule.message}</p>
            {reschedule.ref ? (
              <p className="text-[11px] text-[#d6cbfb]/60">
                {reschedule.refLabel}{" "}
                <span className="font-mono tracking-wide text-[#d6cbfb]/80">{reschedule.ref}</span>
              </p>
            ) : null}
          </Callout>
        ) : null}

        {meeting.noShowUri ? (
          <Callout
            title="No-show"
            hex={statusMeta.no_show.hex}
            border="border-[#e8843a]/25"
            bg="bg-[#e8843a]/10"
            text="text-[#f5c298]"
          >
            <p className="font-mono text-[11px] text-[#f5c298]/60">
              Marked {mounted ? formatDateTime(meeting.noShowCreatedAt) : "—"}
            </p>
          </Callout>
        ) : null}
      </div>
    </div>
  );
}

function AgendaEmptyState({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--dash-border)] bg-white/[0.02] text-[var(--dash-text-muted)]">
        {icon}
      </span>
      <p className="text-sm font-medium text-[var(--dash-text)]">{title}</p>
      <p className="max-w-sm text-xs text-[var(--dash-text-muted)]">{hint}</p>
    </div>
  );
}

function AgendaSkeleton() {
  return (
    <div className="divide-y divide-[var(--dash-border)]" aria-hidden>
      {Array.from({ length: 6 }).map((_, index) => (
        <div className="flex items-center gap-3 py-3 pl-5 pr-4" key={index}>
          <div className="h-3 w-[4.5rem] animate-pulse rounded bg-white/[0.06] motion-reduce:animate-none" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-40 animate-pulse rounded bg-white/[0.06] motion-reduce:animate-none" />
            <div className="h-2.5 w-28 animate-pulse rounded bg-white/[0.04] motion-reduce:animate-none" />
          </div>
          <div className="h-5 w-20 animate-pulse rounded-full bg-white/[0.05] motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

// Dates are formatted in the viewer's timezone/locale, which the server can't
// know — grouping and time labels must render on the client to stay consistent.
// useSyncExternalStore returns the server snapshot (false) during SSR and
// hydration, then re-renders with the client value (true) — no effect needed.
const subscribeNoop = () => () => {};
function useMounted() {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

export function CalendlySchedulingWorkspace({ workspace }: SchedulingWorkspaceProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Presentation order: newest meetings first (storage returns them ascending).
  const orderedMeetings = useMemo(
    () =>
      [...workspace.meetings].sort(
        (a, b) => (safeDate(b.startTime)?.getTime() ?? 0) - (safeDate(a.startTime)?.getTime() ?? 0),
      ),
    [workspace.meetings],
  );

  const [selectedMeetingId, setSelectedMeetingId] = useState(() =>
    orderedMeetings[0] ? meetingId(orderedMeetings[0]) : null,
  );
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const mounted = useMounted();

  const stateCounts = useMemo(() => {
    const counts: StateCounts = {
      scheduled: 0,
      in_progress: 0,
      completed: 0,
      rescheduled: 0,
      canceled: 0,
      no_show: 0,
    };
    for (const meeting of workspace.meetings) counts[meeting.state] += 1;
    return counts;
  }, [workspace.meetings]);

  const filteredMeetings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return orderedMeetings.filter((meeting) => {
      const matchesStatus = statusFilter === "all" || meeting.state === statusFilter;
      const haystack = [
        meeting.eventName,
        meeting.inviteeName,
        meeting.inviteeEmail,
        meeting.locationLabel,
        meeting.timezone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesStatus && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [query, statusFilter, orderedMeetings]);

  const dayGroups = useMemo(() => groupByDay(filteredMeetings), [filteredMeetings]);

  const selectedMeeting =
    orderedMeetings.find((meeting) => meetingId(meeting) === selectedMeetingId) ??
    filteredMeetings[0] ??
    null;

  const runSync = () => {
    setSyncMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/calendly/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId: workspace.account.id }),
        });
        const payload = (await response.json().catch(() => null)) as {
          results?: Array<{ errorMessage?: string | null }>;
        } | null;

        if (!response.ok) {
          const errorMessage = payload?.results?.[0]?.errorMessage ?? "Calendly sync failed.";
          setSyncMessage(errorMessage);
          return;
        }

        setSyncMessage("Sync complete.");
        router.refresh();
      } catch (error) {
        setSyncMessage(error instanceof Error ? error.message : "Calendly sync failed.");
      }
    });
  };

  const connected = workspace.health.tokenConfigured;
  const syncFailed = workspace.health.lastSyncStatus === "error";
  const lastSynced = formatRelative(workspace.health.lastSyncAt);
  const lastBooking = formatRelative(workspace.health.lastWebhookAt);
  const statusDotHex = connected ? (syncFailed ? "#f5a524" : "#3fb871") : "#6b6660";
  const statusLabel = connected ? (syncFailed ? "Sync error" : "Connected") : "Not connected";

  return (
    <div className="dashboard-premium min-h-full px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header
          className="dash-animate-in rounded-[var(--dash-radius)] border border-[var(--dash-border)] bg-[var(--dash-surface)] px-5 py-5 backdrop-blur-[var(--dash-blur)]"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#f4a261]">
                  Scheduling
                </span>
                <span className="h-1 w-1 rounded-full bg-white/20" />
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--dash-text-muted)]">
                  {workspace.account.id}
                </span>
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--dash-text)]">
                {workspace.account.label}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--dash-text-muted)]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    {connected && !syncFailed ? (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#3fb871]/50 motion-reduce:animate-none" />
                    ) : null}
                    <span
                      className="relative inline-flex h-2 w-2 rounded-full"
                      style={{ backgroundColor: statusDotHex }}
                    />
                  </span>
                  {statusLabel}
                </span>
                {connected && mounted ? (
                  <>
                    <span className="h-1 w-1 rounded-full bg-white/15" />
                    <span className="font-mono">
                      {lastSynced ? `Synced ${lastSynced}` : "Not synced yet"}
                    </span>
                    {lastBooking ? (
                      <>
                        <span className="h-1 w-1 rounded-full bg-white/15" />
                        <span className="font-mono">Last booking {lastBooking}</span>
                      </>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {syncMessage ? (
                <span className="rounded-lg border border-[var(--dash-border)] bg-white/[0.03] px-3 py-1.5 text-xs text-[var(--dash-text-muted)]">
                  {syncMessage}
                </span>
              ) : null}
              <button
                type="button"
                disabled={isPending}
                onClick={runSync}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#AE4010]/40 bg-[#AE4010]/15 px-3.5 text-xs font-medium text-[#f4a261] transition hover:border-[#AE4010]/60 hover:bg-[#AE4010]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AE4010]/50 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
                {isPending ? "Syncing…" : "Sync now"}
              </button>
            </div>
          </div>
        </header>

        {workspace.health.errorMessage ? (
          <div className="dash-animate-in flex items-start gap-3 rounded-[var(--dash-radius)] border border-[#f5a524]/25 bg-[#f5a524]/10 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#f5a524]" />
            <p className="text-sm text-[#f7d59a]">{workspace.health.errorMessage}</p>
          </div>
        ) : null}

        <StatRibbon summary={workspace.summary} counts={stateCounts} />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section
            className="dash-animate-in overflow-hidden rounded-[var(--dash-radius)] border border-[var(--dash-border)] bg-[var(--dash-surface)] backdrop-blur-[var(--dash-blur)]"
            style={{ animationDelay: "120ms" }}
          >
            <div className="flex flex-col gap-3 border-b border-[var(--dash-border)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[var(--dash-text)]">Meetings</h2>
                <p className="mt-0.5 font-mono text-[11px] text-[var(--dash-text-muted)]">
                  {filteredMeetings.length} shown
                </p>
              </div>
              <div className="relative sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--dash-text-muted)]" />
                <input
                  aria-label="Search meetings"
                  className="h-9 w-full rounded-lg border border-[var(--dash-border)] bg-white/[0.03] pl-9 pr-3 text-sm text-[var(--dash-text)] outline-none transition placeholder:text-[var(--dash-text-muted)] focus:border-[#AE4010]/50"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name, email, or event"
                  value={query}
                />
              </div>
            </div>

            <div className="dash-scrollbar flex gap-1 overflow-x-auto border-b border-[var(--dash-border)] px-3 py-2">
              {filterOptions.map((option) => {
                const active = statusFilter === option.value;
                return (
                  <button
                    aria-pressed={active}
                    className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AE4010]/50 ${
                      active
                        ? "bg-[#AE4010]/20 text-[#f4a261]"
                        : "text-[var(--dash-text-muted)] hover:bg-white/[0.04] hover:text-[var(--dash-text)]"
                    }`}
                    key={option.value}
                    onClick={() => setStatusFilter(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="dash-scrollbar max-h-[70vh] overflow-y-auto">
              {workspace.health.setupRequired ? (
                <AgendaEmptyState
                  icon={<PlugZap className="h-5 w-5" />}
                  title="This account isn't connected yet"
                  hint={`Add the Calendly API token for ${workspace.account.label} to start syncing meetings.`}
                />
              ) : filteredMeetings.length === 0 ? (
                workspace.meetings.length === 0 ? (
                  <AgendaEmptyState
                    icon={<CalendarClock className="h-5 w-5" />}
                    title="No meetings scheduled yet"
                    hint="Bookings appear here automatically as they come in from Calendly."
                  />
                ) : (
                  <AgendaEmptyState
                    icon={<Search className="h-5 w-5" />}
                    title="No meetings match your search"
                    hint="Try a different name or clear the status filter to see everything."
                  />
                )
              ) : !mounted ? (
                <AgendaSkeleton />
              ) : (
                dayGroups.map((group) => (
                  <div
                    className="border-b border-[var(--dash-border)] last:border-b-0 sm:grid sm:grid-cols-[7.5rem_minmax(0,1fr)]"
                    key={group.key}
                  >
                    <div className="px-5 pt-4 sm:py-4">
                      <div className="sm:sticky sm:top-3">
                        <p className="text-sm font-semibold text-[var(--dash-text)]">
                          {group.date ? formatDayLabel(group.date) : "Undated"}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--dash-text-muted)]">
                          {group.date ? formatDayDate(group.date) : "—"}
                        </p>
                      </div>
                    </div>
                    <ul className="divide-y divide-[var(--dash-border)]">
                      {group.meetings.map((meeting) => {
                        const id = meetingId(meeting);
                        return (
                          <MeetingRow
                            key={id}
                            meeting={meeting}
                            onSelect={() => setSelectedMeetingId(id)}
                            selected={selectedMeeting ? meetingId(selectedMeeting) === id : false}
                          />
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </section>

          <aside
            className="dash-animate-in xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:self-start xl:overflow-y-auto dash-scrollbar"
            style={{ animationDelay: "160ms" }}
          >
            <MeetingDetail meeting={selectedMeeting} mounted={mounted} />
          </aside>
        </div>
      </div>
    </div>
  );
}
