"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hasOutreachAccess, type AppUserProfile } from "@/lib/access";

type LoginFormProps = {
  redirectTo: string;
  initialMessage?: string;
};

export function LoginForm({ redirectTo, initialMessage }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(initialMessage ?? null);

  const buttonText = useMemo(
    () => (isSubmitting ? "Signing in..." : "Sign in"),
    [isSubmitting],
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      const { data: profile, error: profileError } = await supabase
        .from("app_users")
        .select("user_id,email,display_name,role,account_status,is_super_admin")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!hasOutreachAccess((profile as AppUserProfile) ?? null)) {
        await supabase.auth.signOut();
        setMessage(
          "Your account does not have access to this portal. Please contact an administrator if you believe this is a mistake.",
        );
        setIsSubmitting(false);
        return;
      }

      router.replace(redirectTo);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sign in");
      setIsSubmitting(false);
    }
  };

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="text-sm font-medium text-white/70" htmlFor="login-email">
          Email address
        </label>
        <input
          autoComplete="email"
          className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm text-white placeholder:text-white/30 transition-colors focus:border-[var(--ap-accent-border)] focus:bg-white/[0.06] focus:outline-none"
          id="login-email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@firm.com"
          required
          type="email"
          value={email}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-white/70" htmlFor="login-password">
          Password
        </label>
        <div className="relative">
          <input
            autoComplete="current-password"
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 pr-12 text-sm text-white placeholder:text-white/30 transition-colors focus:border-[var(--ap-accent-border)] focus:bg-white/[0.06] focus:outline-none"
            id="login-password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            required
            type={showPassword ? "text" : "password"}
            value={password}
          />
          <button
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex items-center pr-4 text-white/40 transition-colors hover:text-white/80"
            onClick={() => setShowPassword((value) => !value)}
            type="button"
          >
            {showPassword ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {message ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm leading-relaxed text-red-100">
          {message}
        </div>
      ) : null}

      <button
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--ap-accent)] px-4 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:bg-[var(--ap-accent-dark)] disabled:opacity-60"
        disabled={isSubmitting}
        style={{ boxShadow: "0 12px 28px var(--ap-accent-shadow)" }}
        type="submit"
      >
        {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
        <span>{buttonText}</span>
      </button>
    </form>
  );
}
