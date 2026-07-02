import { ArrowUpRight, Mail } from "lucide-react";

export const dynamic = "force-dynamic";

const INSTANTLY_LOGIN_URL = "https://app.instantly.ai/";

export default function EmailOutreachPage() {
  return (
    <div className="dashboard-premium relative flex min-h-full items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      {/* Fading gradient glow behind the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[40rem] w-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[130px]"
        style={{
          background:
            "radial-gradient(circle at center, rgba(174,64,16,0.32), rgba(174,64,16,0.10) 45%, transparent 72%)",
        }}
      />

      <div className="dash-animate-in relative w-full max-w-md">
        <div className="relative overflow-hidden rounded-[var(--dash-radius)] border border-[var(--dash-border)] bg-[var(--dash-surface)] backdrop-blur-[var(--dash-blur)]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: "linear-gradient(to bottom, rgba(174,64,16,0.10), transparent 42%)",
            }}
          />

          <div className="relative flex flex-col items-center px-8 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#AE4010]/25 bg-[#AE4010]/12 text-[#f4a261]">
              <Mail className="h-7 w-7" />
            </span>
            <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-[#f4a261]">
              Email Outreach
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--dash-text)]">
              Instantly
            </h1>
            <p className="mt-2 max-w-xs text-sm text-[var(--dash-text-muted)]">
              Your cold email campaigns live in Instantly. Open it to pick up where you left off.
            </p>

            <a
              className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#AE4010]/40 bg-[#AE4010]/15 px-5 text-sm font-medium text-[#f4a261] transition hover:border-[#AE4010]/60 hover:bg-[#AE4010]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AE4010]/50"
              href={INSTANTLY_LOGIN_URL}
              rel="noreferrer noopener"
              target="_blank"
            >
              Open Instantly
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
