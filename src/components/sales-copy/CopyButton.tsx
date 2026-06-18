"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

type CopyButtonProps = {
  value: string;
  label?: string;
  compact?: boolean;
};

export function CopyButton({ value, label = "Copy", compact = false }: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
      window.setTimeout(() => setState("idle"), 1400);
    } catch {
      setState("error");
      window.setTimeout(() => setState("idle"), 1800);
    }
  };

  return (
    <button
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--dash-border)] text-xs font-medium text-[var(--dash-text-muted)] transition hover:border-[#AE4010]/40 hover:bg-[#AE4010]/10 hover:text-[var(--dash-text)] ${
        compact ? "h-8 w-8 px-0" : "h-9 px-3"
      }`}
      onClick={copy}
      title={state === "copied" ? "Copied" : state === "error" ? "Copy failed" : label}
      type="button"
    >
      {state === "copied" ? (
        <Check className="h-3.5 w-3.5 text-emerald-300" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {!compact ? <span>{state === "copied" ? "Copied" : state === "error" ? "Failed" : label}</span> : null}
    </button>
  );
}
