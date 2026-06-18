"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

type SubmitButtonProps = {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  compact?: boolean;
  title?: string;
};

const variants = {
  primary:
    "border-[#AE4010]/40 bg-[#AE4010]/90 text-white hover:border-[#AE4010] hover:bg-[#AE4010]",
  secondary:
    "border-[var(--dash-border)] text-[var(--dash-text-muted)] hover:border-[#AE4010]/40 hover:bg-[#AE4010]/10 hover:text-[var(--dash-text)]",
  danger:
    "border-red-400/20 text-red-100 hover:border-red-300/30 hover:bg-red-500/10",
  ghost:
    "border-transparent text-[var(--dash-text-muted)] hover:border-white/10 hover:bg-white/[0.04] hover:text-[var(--dash-text)]",
};

export function SubmitButton({
  children,
  pendingLabel = "Saving...",
  variant = "secondary",
  compact = false,
  title,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-55 ${
        compact ? "h-8 px-2" : "h-9 px-3"
      } ${variants[variant]}`}
      disabled={pending}
      title={title}
      type="submit"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      <span>{pending ? pendingLabel : children}</span>
    </button>
  );
}
