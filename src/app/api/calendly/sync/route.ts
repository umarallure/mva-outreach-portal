import { NextResponse } from "next/server";
import { getCalendlyAccountById } from "@/config/calendly";
import { requireApiOutreachAccess } from "@/lib/api-auth";
import { syncAllCalendlyAccounts, syncCalendlyAccount } from "@/lib/calendly/sync";
import { hasSupabaseServiceRoleKey } from "@/lib/supabase/service";

type CalendlySyncRequest = {
  accountId?: string;
  minStartTime?: string | null;
  maxStartTime?: string | null;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function validOptionalIso(value: unknown) {
  return value === null || value === undefined || (typeof value === "string" && Number.isFinite(Date.parse(value)));
}

export async function POST(request: Request) {
  const { response } = await requireApiOutreachAccess();
  if (response) return response;

  if (!hasSupabaseServiceRoleKey()) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is required to sync Calendly data." },
      { status: 503 },
    );
  }

  let body: CalendlySyncRequest = {};
  try {
    body = (await request.json()) as CalendlySyncRequest;
  } catch {
    body = {};
  }

  if (!validOptionalIso(body.minStartTime) || !validOptionalIso(body.maxStartTime)) {
    return NextResponse.json({ error: "Invalid sync window." }, { status: 400 });
  }

  const options = {
    syncType: "manual" as const,
    minStartTime: body.minStartTime ?? null,
    maxStartTime: body.maxStartTime ?? null,
  };

  if (body.accountId) {
    const account = getCalendlyAccountById(body.accountId);
    if (!account) return NextResponse.json({ error: "Calendly account not found." }, { status: 404 });

    const result = await syncCalendlyAccount(account, options);
    return NextResponse.json({ results: [result] }, { status: result.status === "success" ? 200 : 502 });
  }

  const results = await syncAllCalendlyAccounts(options);
  const hasError = results.some((result) => result.status === "error");

  return NextResponse.json({ results }, { status: hasError ? 207 : 200 });
}
