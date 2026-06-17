import Link from "next/link";

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-black px-6 py-10 text-white">
      <div className="mx-auto max-w-3xl">
        <Link className="text-sm text-white/55 transition hover:text-white" href="/login">
          Back to login
        </Link>
        <h1 className="mt-8 text-3xl font-semibold">Privacy Policy</h1>
        <p className="mt-4 leading-relaxed text-white/60">
          Accident Payments uses this portal for authorized internal outreach operations. Access,
          account activity, and embedded third-party tools may be logged for security and operational
          purposes.
        </p>
      </div>
    </main>
  );
}
