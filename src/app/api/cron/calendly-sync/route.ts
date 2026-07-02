import { NextResponse } from "next/server";
import { syncAllCalendlyAccounts } from "@/lib/calendly/sync";
import { hasSupabaseServiceRoleKey } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization");

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!hasSupabaseServiceRoleKey()) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is required to sync Calendly data." },
      { status: 503 },
    );
  }

  const results = await syncAllCalendlyAccounts({ syncType: "cron" });
  const hasError = results.some((result) => result.status === "error");

  return NextResponse.json({ results }, { status: hasError ? 207 : 200 });
}
