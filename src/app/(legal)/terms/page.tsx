import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-black px-6 py-10 text-white">
      <div className="mx-auto max-w-3xl">
        <Link className="text-sm text-white/55 transition hover:text-white" href="/login">
          Back to login
        </Link>
        <h1 className="mt-8 text-3xl font-semibold">Terms & Conditions</h1>
        <p className="mt-4 leading-relaxed text-white/60">
          This portal is restricted to authorized Accident Payments administrators. Users are
          responsible for following internal policies and third-party service terms when managing
          outreach pipelines.
        </p>
      </div>
    </main>
  );
}
