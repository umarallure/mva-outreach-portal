import Link from "next/link";
import { CalendarClock, ExternalLink, Link2, MonitorPlay, Rocket, Settings2 } from "lucide-react";
import { AnalyticsTrendCard, type OperationalTrendPoint } from "@/components/dashboard/AnalyticsTrendCard";
import { KpiCard } from "@/components/dashboard/KpiCard";
import {
  accountPath,
  getDashboardReadiness,
  getAccountNavigation,
  outreachAccounts,
} from "@/config/pipelines";

const trendDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Today"];

function buildTrend(): OperationalTrendPoint[] {
  const readiness = getDashboardReadiness();

  return trendDays.map((day, index) => {
    const ratio = (index + 1) / trendDays.length;
    return {
      day,
      ready: Math.round(readiness.readyAccounts * ratio),
      targets: Math.round(readiness.targetLinks * ratio),
      profiles: Math.round(readiness.gologinProfiles * ratio),
    };
  });
}

export default function DashboardPage() {
  const readiness = getDashboardReadiness();
  const navigation = getAccountNavigation();
  const trend = buildTrend();

  return (
    <div className="dashboard-premium min-h-full px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px] space-y-5">
        <div className="dash-animate-in rounded-[var(--dash-radius)] border border-[var(--dash-border)] bg-[var(--dash-surface)] px-5 py-4 backdrop-blur-[var(--dash-blur)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--dash-text-muted)]">
                GoLogin operations
              </p>
              <h2 className="mt-1 text-xl font-semibold text-[var(--dash-text)]">
                Outreach account readiness
              </h2>
            </div>
            <a
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[var(--dash-border)] px-3 text-xs font-medium text-[var(--dash-text-muted)] transition hover:border-[#AE4010]/40 hover:bg-[#AE4010]/10 hover:text-[var(--dash-text)]"
              href="https://app.gologin.com"
              rel="noreferrer"
              target="_blank"
            >
              Open GoLogin
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            accent="orange"
            animationDelay={60}
            icon={<MonitorPlay className="h-5 w-5" />}
            label="Account Pages"
            value={readiness.totalAccounts}
          />
          <KpiCard
            accent="green"
            animationDelay={120}
            icon={<Link2 className="h-5 w-5" />}
            label="Target Links"
            value={readiness.targetLinks}
          />
          <KpiCard
            accent="blue"
            animationDelay={180}
            icon={<Rocket className="h-5 w-5" />}
            label="GoLogin Profiles"
            value={readiness.gologinProfiles}
          />
          <KpiCard
            accent="red"
            animationDelay={240}
            icon={<Settings2 className="h-5 w-5" />}
            label="Pending Setup"
            value={readiness.pendingSetup}
          />
        </div>

        <AnalyticsTrendCard
          animationDelay={300}
          data={trend}
          subtitle="GoLogin profile and target readiness across the active account set"
          title="Operational Readiness"
        />

        <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
          <div className="dash-animate-in rounded-[var(--dash-radius)] border border-[var(--dash-border)] bg-[var(--dash-surface)] p-5 backdrop-blur-[var(--dash-blur)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[var(--dash-text)]">Account map</h3>
                <p className="text-xs text-[var(--dash-text-muted)]">
                  Sidebar groups and GoLogin-managed account workspaces for v1.
                </p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {navigation.map((group) => (
                <div className="rounded-lg border border-[var(--dash-border)] bg-white/[0.025] p-4" key={group.ownerSlug}>
                  <h4 className="text-sm font-semibold text-[var(--dash-text)]">{group.ownerName}</h4>
                  <div className="mt-3 space-y-2">
                    {group.pipelines.map((pipeline) => (
                      <Link
                        className="flex items-center justify-between gap-3 rounded-lg border border-transparent px-3 py-2 text-sm text-[var(--dash-text-muted)] transition hover:border-[#AE4010]/30 hover:bg-[#AE4010]/10 hover:text-[var(--dash-text)]"
                        href={pipeline.href}
                        key={pipeline.id}
                      >
                        <span>{pipeline.sidebarLabel}</span>
                        <span
                          className={`h-2 w-2 rounded-full ${
                            pipeline.status === "ready" ? "bg-emerald-400" : "bg-amber-400"
                          }`}
                        />
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="dash-animate-in rounded-[var(--dash-radius)] border border-[var(--dash-border)] bg-[var(--dash-surface)] p-5 backdrop-blur-[var(--dash-blur)]">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#AE4010]/10">
                <CalendarClock className="h-4 w-4 text-[#AE4010]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--dash-text)]">Setup queue</h3>
                <p className="text-xs text-[var(--dash-text-muted)]">Missing v1 config by account.</p>
              </div>
            </div>
            <div className="space-y-2">
              {outreachAccounts.map((account) => {
                const missing = [
                  !(account.defaultTargetUrl || account.flowchatUrl || account.linkedinUrl)
                    ? "target"
                    : null,
                  !account.gologinProfileId ? "GoLogin" : null,
                ].filter(Boolean);

                return (
                  <Link
                    className="flex items-center justify-between gap-3 rounded-lg border border-[var(--dash-border)] bg-white/[0.025] px-3 py-2 text-sm transition hover:border-[#AE4010]/30 hover:bg-[#AE4010]/10"
                    href={accountPath(account)}
                    key={account.id}
                  >
                    <span className="text-[var(--dash-text)]">{account.pipelineName}</span>
                    <span className="text-xs text-[var(--dash-text-muted)]">
                      {missing.length ? missing.join(", ") : "ready"}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
