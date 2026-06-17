import "server-only";

type GologinPayload = Record<string, unknown> | unknown[] | string | number | boolean | null;

export type GologinProfileStatus = {
  state: "running" | "stopped" | "unknown";
  rawStatus: string | null;
  profileName: string | null;
  checkedAt: string;
  error?: string;
};

export type StartCloudProfileResult = {
  liveViewUrl: string | null;
  launchUrl: string | null;
  urlsFound: number;
  responseShape: unknown;
};

export class GologinApiError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "GologinApiError";
    this.status = status;
  }
}

export class GologinLaunchError extends GologinApiError {
  constructor(message: string, status = 502) {
    super(message, status);
    this.name = "GologinLaunchError";
  }
}

const API_BASE = "https://api.gologin.com";
const PROFILE_STATUS_TTL_MS = 15_000;
const statusCache = new Map<string, { expiresAt: number; value: GologinProfileStatus }>();

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isUrl = (value: unknown): value is string =>
  typeof value === "string" && /^https?:\/\//i.test(value);

function getGologinToken() {
  const token = process.env.GOLOGIN_API_TOKEN?.trim();

  if (!token) {
    throw new GologinApiError("GoLogin API token is not configured.", 503);
  }

  return token;
}

function parsePayload(text: string): GologinPayload {
  if (!text) return null;

  try {
    return JSON.parse(text) as GologinPayload;
  } catch {
    return text;
  }
}

function payloadMessage(payload: unknown) {
  if (typeof payload === "string") {
    const normalized = payload.replace(/\s+/g, " ").trim();
    if (!normalized) return null;
    if (/^<!doctype html|^<html/i.test(normalized)) return "GoLogin returned an HTML error page.";
    return normalized.slice(0, 180);
  }

  if (isObject(payload)) {
    const message = payload.message ?? payload.error ?? payload.detail;
    if (typeof message === "string" && message.trim()) return message.trim();
  }

  return null;
}

async function requestGologin<TPayload = GologinPayload>(
  path: string,
  init: RequestInit = {},
): Promise<TPayload> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getGologinToken()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });

  const text = await response.text();
  const payload = parsePayload(text);

  if (!response.ok) {
    const details = payloadMessage(payload);
    const message =
      response.status === 429
        ? "GoLogin rate limit was reached. Wait before retrying to avoid token invalidation."
        : details
          ? `GoLogin request failed with status ${response.status}: ${details}`
          : `GoLogin request failed with status ${response.status}.`;

    throw new GologinApiError(message, response.status);
  }

  return payload as TPayload;
}

export function findUrls(value: unknown, urls: string[] = []) {
  if (isUrl(value)) {
    urls.push(value);
    return urls;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => findUrls(entry, urls));
    return urls;
  }

  if (isObject(value)) {
    Object.values(value).forEach((entry) => findUrls(entry, urls));
  }

  return urls;
}

export function redactGologinPayload(value: unknown): unknown {
  if (isUrl(value)) return "[redacted-url]";
  if (typeof value === "string") {
    if (/^<!doctype html|^<html/i.test(value.trim())) return "[redacted-html]";
    return value.length > 240 ? `${value.slice(0, 240)}...` : value;
  }

  if (Array.isArray(value)) return value.map((entry) => redactGologinPayload(entry));

  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        if (/token|secret|password|cookie|proxy|url|ws|connect/i.test(key)) {
          return [key, "[redacted]"];
        }

        return [key, redactGologinPayload(entry)];
      }),
    );
  }

  return value;
}

function inferRawStatus(profile: unknown) {
  if (!isObject(profile)) return null;

  for (const key of ["status", "state", "browserStatus", "runStatus", "proxyStatus"]) {
    const value = profile[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return null;
}

function inferProfileName(profile: unknown) {
  if (!isObject(profile)) return null;

  for (const key of ["name", "title", "profileName"]) {
    const value = profile[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return null;
}

function normalizeStatus(rawStatus: string | null): GologinProfileStatus["state"] {
  if (!rawStatus) return "unknown";

  const normalized = rawStatus.toLowerCase();
  if (/running|active|started|online/.test(normalized)) return "running";
  if (/stopped|offline|idle|created|ready/.test(normalized)) return "stopped";

  return "unknown";
}

export async function getProfile(profileId: string) {
  return requestGologin(`/browser/${encodeURIComponent(profileId)}`, { method: "GET" });
}

export async function listProfiles(search?: string) {
  const params = new URLSearchParams();
  if (search?.trim()) params.set("search", search.trim());

  const query = params.toString();
  return requestGologin(`/browser/v2${query ? `?${query}` : ""}`, { method: "GET" });
}

export async function getProfileStatus(profileId: string): Promise<GologinProfileStatus> {
  const cached = statusCache.get(profileId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const checkedAt = new Date().toISOString();

  try {
    const profile = await getProfile(profileId);
    const rawStatus = inferRawStatus(profile);
    const value: GologinProfileStatus = {
      state: normalizeStatus(rawStatus),
      rawStatus,
      profileName: inferProfileName(profile),
      checkedAt,
    };

    statusCache.set(profileId, {
      expiresAt: Date.now() + PROFILE_STATUS_TTL_MS,
      value,
    });

    return value;
  } catch (error) {
    const value: GologinProfileStatus = {
      state: "unknown",
      rawStatus: null,
      profileName: null,
      checkedAt,
      error: error instanceof Error ? error.message : "Unable to read GoLogin profile status.",
    };

    statusCache.set(profileId, {
      expiresAt: Date.now() + PROFILE_STATUS_TTL_MS,
      value,
    });

    return value;
  }
}

export async function startCloudProfile(profileId: string): Promise<StartCloudProfileResult> {
  const payload = await requestGologin(`/browser/${encodeURIComponent(profileId)}/web`, {
    method: "POST",
    body: "{}",
  });
  const urls = findUrls(payload);
  const liveViewUrl =
    urls.find((url) => /cloudbrowser\.gologin\.com\/browsers/i.test(url)) ??
    urls.find((url) => /cloudbrowser\.gologin\.com/i.test(url)) ??
    null;
  const launchUrl = urls.find((url) => url !== liveViewUrl) ?? liveViewUrl;

  if (!liveViewUrl && !launchUrl) {
    throw new GologinLaunchError("GoLogin did not return a live view or launch URL.", 502);
  }

  return {
    liveViewUrl: liveViewUrl ?? launchUrl,
    launchUrl: launchUrl ?? liveViewUrl,
    urlsFound: urls.length,
    responseShape: redactGologinPayload(payload),
  };
}

export async function stopCloudProfile(profileId: string) {
  return requestGologin(`/browser/${encodeURIComponent(profileId)}/web`, {
    method: "DELETE",
  });
}

export async function launchGologinCloudProfile(profileId: string) {
  const result = await startCloudProfile(profileId);
  const launchUrl = result.launchUrl ?? result.liveViewUrl;

  if (!launchUrl) {
    throw new GologinLaunchError("GoLogin did not return a launch URL.", 502);
  }

  return launchUrl;
}
