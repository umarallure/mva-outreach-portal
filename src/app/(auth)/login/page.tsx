import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LayeredText } from "@/components/auth/LayeredText";
import { LoginForm } from "@/components/auth/LoginForm";
import { getCurrentUserProfile } from "@/lib/auth";
import { hasOutreachAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

const heroLines = [
  { top: " ", bottom: "OUTREACH" },
  { top: "OUTREACH", bottom: "LINKEDIN" },
  { top: "LINKEDIN", bottom: "FLOWCHAT" },
  { top: "FLOWCHAT", bottom: "PIPELINES" },
  { top: "PIPELINES", bottom: "GOLOGIN" },
  { top: "GOLOGIN", bottom: "REPORTING" },
  { top: "REPORTING", bottom: " " },
];

type LoginPageProps = {
  searchParams: Promise<{
    redirect?: string;
    reason?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const current = await getCurrentUserProfile();

  if (current.user && hasOutreachAccess(current.profile)) {
    redirect("/dashboard");
  }

  const redirectTo =
    typeof params.redirect === "string" && params.redirect.startsWith("/")
      ? params.redirect
      : "/dashboard";
  const initialMessage =
    params.reason === "role_blocked"
      ? "Your account does not have access to this portal. Please contact an administrator if you believe this is a mistake."
      : undefined;

  return (
    <div className="flex min-h-screen w-full bg-black text-white">
      <section className="flex w-full flex-col px-6 py-10 sm:px-10 lg:w-1/2 lg:px-16 xl:px-24">
        <header>
          <Image
            alt="Accident Payments"
            height={32}
            priority
            src="/assets/logo.svg"
            width={180}
          />
        </header>

        <div className="flex flex-1 items-center justify-center">
          <div className="ap-fade-in w-full max-w-md">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold text-white sm:text-4xl">Welcome back</h1>
              <p className="text-sm leading-relaxed text-white/55">
                Sign in with your email to access the outreach workspace.
              </p>
            </div>

            <LoginForm initialMessage={initialMessage} redirectTo={redirectTo} />

            <div className="mt-6 h-px w-full bg-white/10" />
            <p className="mt-4 text-center text-xs leading-relaxed text-white/45">
              By signing in, you agree to our{" "}
              <Link
                className="text-white/70 underline-offset-2 transition-colors hover:text-white hover:underline"
                href="/terms"
              >
                Terms & Conditions
              </Link>{" "}
              and our{" "}
              <Link
                className="text-white/70 underline-offset-2 transition-colors hover:text-white hover:underline"
                href="/privacy-policy"
              >
                Privacy Policy
              </Link>
              .
            </p>

            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
              <p className="text-sm leading-relaxed text-white/55">
                <span className="font-medium text-white/80">Need access?</span> Contact your
                administrator to have your outreach workspace provisioned.
              </p>
            </div>
          </div>
        </div>

        <footer className="flex flex-col gap-3 pt-8 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Accident Payments. All rights reserved.</span>
          <span className="flex items-center gap-4">
            <Link className="transition-colors hover:text-white/70" href="/privacy-policy">
              Privacy Policy
            </Link>
            <Link className="transition-colors hover:text-white/70" href="/terms">
              Terms & Conditions
            </Link>
          </span>
        </footer>
      </section>

      <section className="relative hidden p-3 lg:block lg:w-1/2">
        <div className="relative h-full w-full overflow-hidden rounded-[28px] ring-1 ring-white/10">
          <Image
            alt=""
            className="object-cover"
            fill
            priority
            sizes="50vw"
            src="/assets/bg.jpg"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/30" />

          <div className="absolute left-5 top-5 z-20 flex items-center gap-2.5 rounded-full border border-white/15 bg-black/40 px-3.5 py-1.5 text-xs font-medium text-white/85 backdrop-blur-md">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--ap-amber)] opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-[var(--ap-amber)]" />
            </span>
            Outreach Portal
          </div>

          <div className="absolute bottom-5 right-5 z-20 flex items-center gap-2.5 rounded-full border border-white/15 bg-black/40 px-3.5 py-1.5 text-xs font-medium text-white/85 backdrop-blur-md">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            Pipelines Operational
          </div>

          <div className="absolute inset-0 flex items-center justify-center px-8 xl:px-12">
            <LayeredText
              baseOffset={32}
              baseOffsetMd={20}
              className="ap-fade-in text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.45)]"
              fontSize="58px"
              fontSizeMd="36px"
              lineHeight={50}
              lineHeightMd={32}
              lines={heroLines}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
