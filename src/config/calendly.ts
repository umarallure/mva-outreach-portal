import "server-only";

export type CalendlyAccountId = "insurance" | "mva";

export type CalendlyAccountDefinition = {
  id: CalendlyAccountId;
  slug: CalendlyAccountId;
  label: string;
  href: string;
  tokenEnvKey: string;
  userUriEnvKey: string;
  organizationUriEnvKey: string;
};

export type CalendlyAccountRuntime = {
  tokenConfigured: boolean;
  userUri: string;
  organizationUri: string;
  webhookSigningKeyConfigured: boolean;
};

export type CalendlyNavigationItem = {
  id: CalendlyAccountId;
  label: string;
  href: string;
  configured: boolean;
};

const env = (key: string) => process.env[key]?.trim() ?? "";

export const calendlyAccounts = [
  {
    id: "insurance",
    slug: "insurance",
    label: "Insurance Scheduling",
    href: "/scheduling/insurance",
    tokenEnvKey: "CALENDLY_INSURANCE_API_TOKEN",
    userUriEnvKey: "CALENDLY_INSURANCE_USER_URI",
    organizationUriEnvKey: "CALENDLY_INSURANCE_ORGANIZATION_URI",
  },
  {
    id: "mva",
    slug: "mva",
    label: "MVA Scheduling",
    href: "/scheduling/mva",
    tokenEnvKey: "CALENDLY_MVA_API_TOKEN",
    userUriEnvKey: "CALENDLY_MVA_USER_URI",
    organizationUriEnvKey: "CALENDLY_MVA_ORGANIZATION_URI",
  },
] satisfies CalendlyAccountDefinition[];

export function getCalendlyAccountRuntime(
  account: CalendlyAccountDefinition,
): CalendlyAccountRuntime {
  return {
    tokenConfigured: Boolean(env(account.tokenEnvKey)),
    userUri: env(account.userUriEnvKey),
    organizationUri: env(account.organizationUriEnvKey),
    webhookSigningKeyConfigured: Boolean(env("CALENDLY_WEBHOOK_SIGNING_KEY")),
  };
}

export function getCalendlyToken(account: CalendlyAccountDefinition) {
  return env(account.tokenEnvKey);
}

export function getCalendlyAccountBySlug(slug: string) {
  return calendlyAccounts.find((account) => account.slug === slug) ?? null;
}

export function getCalendlyAccountById(id: string) {
  return calendlyAccounts.find((account) => account.id === id) ?? null;
}

export function getCalendlyNavigation(): CalendlyNavigationItem[] {
  return calendlyAccounts.map((account) => {
    const runtime = getCalendlyAccountRuntime(account);

    return {
      id: account.id,
      label: account.label,
      href: account.href,
      configured: runtime.tokenConfigured,
    };
  });
}

export function getCalendlyBackfillLookbackDays() {
  const raw = Number(process.env.CALENDLY_BACKFILL_LOOKBACK_DAYS ?? 90);
  return Number.isFinite(raw) && raw > 0 ? raw : 90;
}

export function getCalendlyCronLookbackDays() {
  const raw = Number(process.env.CALENDLY_CRON_LOOKBACK_DAYS ?? 2);
  return Number.isFinite(raw) && raw > 0 ? raw : 2;
}
