import "server-only";

export type OutreachAccountStatus =
  | "ready"
  | "missing_gologin"
  | "missing_target"
  | "pending_setup";

export type OutreachAccountDefinition = {
  id: string;
  ownerSlug: string;
  ownerName: string;
  pipelineSlug: string;
  pipelineName: string;
  sidebarLabel: string;
  gologinProfileId: string;
  defaultTargetUrl: string;
  flowchatUrl: string;
  linkedinUrl: string;
  status: OutreachAccountStatus;
};

export type OutreachAccountNavigationGroup = {
  ownerSlug: string;
  ownerName: string;
  pipelines: Array<{
    id: string;
    title: string;
    sidebarLabel: string;
    href: string;
    status: OutreachAccountStatus;
  }>;
};

export type PipelineStatus = OutreachAccountStatus;
export type PipelineDefinition = OutreachAccountDefinition;
export type PipelineNavigationGroup = OutreachAccountNavigationGroup;

const env = (key: string) => process.env[key]?.trim() ?? "";

const optionalUrl = (...keys: string[]) => {
  for (const key of keys) {
    const value = env(key);
    if (value) return value;
  }

  return "";
};

const accountStatus = (
  gologinProfileId: string,
  defaultTargetUrl: string,
  flowchatUrl: string,
  linkedinUrl: string,
): OutreachAccountStatus => {
  const hasTarget = Boolean(defaultTargetUrl || flowchatUrl || linkedinUrl);

  if (gologinProfileId && hasTarget) return "ready";
  if (!gologinProfileId && hasTarget) return "missing_gologin";
  if (gologinProfileId && !hasTarget) return "missing_target";
  return "pending_setup";
};

const defineOutreachAccount = (
  input: Omit<OutreachAccountDefinition, "status">,
): OutreachAccountDefinition => ({
  ...input,
  status: accountStatus(
    input.gologinProfileId,
    input.defaultTargetUrl,
    input.flowchatUrl,
    input.linkedinUrl,
  ),
});

// Hardcoded FlowChat pipeline URL per account. When the account's cloud profile is
// started, the embedded browser auto-opens this URL (see CloudBrowserViewer
// `autoOpenUrl`). Env vars (FLOWCHAT_URL_*) override these when present.
// >>> Paste each account's FlowChat pipeline URL here. <<<
const FLOWCHAT_PIPELINE_URLS: Record<string, string> = {
  PUBLISHER_KELLER: "https://www.flowchat.com/members/pipeline?member_pipeline_id=41075",
  GLOBAL_FE_KELLER: "https://www.flowchat.com/members/pipeline?member_pipeline_id=41960",
  MONICA_PERSONAL_CONNECTIONS: "https://www.flowchat.com/members/pipeline?member_pipeline_id=42085",
  JOSH_BPO_COLOMBIA: "https://www.flowchat.com/members/pipeline?member_pipeline_id=41622",
  BEN_BPO_DOMINICAN_REPUBLIC: "https://www.flowchat.com/members/pipeline?member_pipeline_id=42039",
  BEN_BPO_SOUTH_AFRICA: "https://www.flowchat.com/members/pipeline?member_pipeline_id=41675",
  FLUTRA_BPO_EL_SALVADOR: "https://www.flowchat.com/members/pipeline?member_pipeline_id=41787",
  FLUTRA_BPO_VENEZUELA: "https://www.flowchat.com/members/pipeline?member_pipeline_id=41676",
};

const accountTargets = (key: string) => {
  const flowchatUrl =
    optionalUrl(`FLOWCHAT_URL_${key}`, `FLOWCHAT_IFRAME_${key}`) || FLOWCHAT_PIPELINE_URLS[key] || "";
  const linkedinUrl = env(`LINKEDIN_URL_${key}`);
  const defaultTargetUrl = optionalUrl(`DEFAULT_TARGET_URL_${key}`) || flowchatUrl || linkedinUrl;

  return {
    defaultTargetUrl,
    flowchatUrl,
    linkedinUrl,
    gologinProfileId: env(`GOLOGIN_PROFILE_${key}`),
  };
};

export const outreachAccounts = [
  defineOutreachAccount({
    id: "publisher-keller",
    ownerSlug: "keller",
    ownerName: "Keller",
    pipelineSlug: "publisher-keller",
    pipelineName: "Publisher Keller",
    sidebarLabel: "Publisher Keller",
    ...accountTargets("PUBLISHER_KELLER"),
  }),
  defineOutreachAccount({
    id: "global-fe-keller",
    ownerSlug: "keller",
    ownerName: "Keller",
    pipelineSlug: "global-fe-keller",
    pipelineName: "Global FE Keller",
    sidebarLabel: "Global FE Keller",
    ...accountTargets("GLOBAL_FE_KELLER"),
  }),
  defineOutreachAccount({
    id: "monica-personal-connections",
    ownerSlug: "monica",
    ownerName: "Monica",
    pipelineSlug: "personal-connections",
    pipelineName: "Monica's Personal Connections",
    sidebarLabel: "Monica's Personal Connections",
    ...accountTargets("MONICA_PERSONAL_CONNECTIONS"),
  }),
  defineOutreachAccount({
    id: "josh-bpo-colombia",
    ownerSlug: "josh",
    ownerName: "Josh",
    pipelineSlug: "bpo-colombia",
    pipelineName: "BPO Colombia",
    sidebarLabel: "BPO Colombia",
    ...accountTargets("JOSH_BPO_COLOMBIA"),
  }),
  defineOutreachAccount({
    id: "ben-bpo-dominican-republic",
    ownerSlug: "ben",
    ownerName: "Ben",
    pipelineSlug: "bpo-dominican-republic",
    pipelineName: "BPO Dominican Republic",
    sidebarLabel: "BPO Dominican Republic",
    ...accountTargets("BEN_BPO_DOMINICAN_REPUBLIC"),
  }),
  defineOutreachAccount({
    id: "ben-bpo-south-africa",
    ownerSlug: "ben",
    ownerName: "Ben",
    pipelineSlug: "bpo-south-africa",
    pipelineName: "BPO South Africa",
    sidebarLabel: "BPO South Africa",
    ...accountTargets("BEN_BPO_SOUTH_AFRICA"),
  }),
  defineOutreachAccount({
    id: "flutra-bpo-el-salvador",
    ownerSlug: "flutra",
    ownerName: "Flutra",
    pipelineSlug: "bpo-el-salvador",
    pipelineName: "BPO El Salvador",
    sidebarLabel: "BPO El Salvador",
    ...accountTargets("FLUTRA_BPO_EL_SALVADOR"),
  }),
  defineOutreachAccount({
    id: "flutra-bpo-venezuela",
    ownerSlug: "flutra",
    ownerName: "Flutra",
    pipelineSlug: "bpo-venezuela",
    pipelineName: "BPO Venezuela",
    sidebarLabel: "BPO Venezuela",
    ...accountTargets("FLUTRA_BPO_VENEZUELA"),
  }),
] satisfies OutreachAccountDefinition[];

export const pipelines = outreachAccounts;

export const accountPath = (
  account: Pick<OutreachAccountDefinition, "ownerSlug" | "pipelineSlug">,
) => `/pipelines/${account.ownerSlug}/${account.pipelineSlug}`;

export const pipelinePath = accountPath;

export function getAccountNavigation(): OutreachAccountNavigationGroup[] {
  const groups = new Map<string, OutreachAccountNavigationGroup>();

  outreachAccounts.forEach((account) => {
    const group =
      groups.get(account.ownerSlug) ??
      ({
        ownerSlug: account.ownerSlug,
        ownerName: account.ownerName,
        pipelines: [],
      } satisfies OutreachAccountNavigationGroup);

    group.pipelines.push({
      id: account.id,
      title: account.pipelineName,
      sidebarLabel: account.sidebarLabel,
      href: accountPath(account),
      status: account.status,
    });

    groups.set(account.ownerSlug, group);
  });

  return Array.from(groups.values());
}

export const getPipelineNavigation = getAccountNavigation;

export function getAccountById(id: string) {
  return outreachAccounts.find((account) => account.id === id) ?? null;
}

export const getPipelineById = getAccountById;

export function getAccountBySlugs(ownerSlug: string, pipelineSlug: string) {
  return (
    outreachAccounts.find(
      (account) => account.ownerSlug === ownerSlug && account.pipelineSlug === pipelineSlug,
    ) ?? null
  );
}

export const getPipelineBySlugs = getAccountBySlugs;

export function getDashboardReadiness() {
  const gologinProfiles = outreachAccounts.filter((account) =>
    Boolean(account.gologinProfileId),
  ).length;
  const targetLinks = outreachAccounts.filter((account) =>
    Boolean(account.defaultTargetUrl || account.flowchatUrl || account.linkedinUrl),
  ).length;
  const readyAccounts = outreachAccounts.filter((account) => account.status === "ready").length;

  return {
    totalAccounts: outreachAccounts.length,
    totalPipelines: outreachAccounts.length,
    targetLinks,
    readyEmbeds: targetLinks,
    gologinProfiles,
    pendingSetup: outreachAccounts.length - readyAccounts,
    readyAccounts,
    readyPipelines: readyAccounts,
  };
}

export function toAccountWorkspaceView(account: OutreachAccountDefinition) {
  return {
    id: account.id,
    ownerSlug: account.ownerSlug,
    ownerName: account.ownerName,
    pipelineSlug: account.pipelineSlug,
    pipelineName: account.pipelineName,
    title: account.pipelineName,
    sidebarLabel: account.sidebarLabel,
    defaultTargetUrl: account.defaultTargetUrl,
    flowchatUrl: account.flowchatUrl,
    linkedinUrl: account.linkedinUrl,
    canStartGologin: Boolean(account.gologinProfileId),
    status: account.status,
  };
}

export const toPipelineView = toAccountWorkspaceView;
