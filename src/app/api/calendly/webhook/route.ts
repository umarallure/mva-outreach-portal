import { NextResponse } from "next/server";
import {
  calendlyWebhookErrorResponse,
  processCalendlyWebhook,
} from "@/lib/calendly/webhooks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const accountId = new URL(request.url).searchParams.get("account");
  const signature = request.headers.get("Calendly-Webhook-Signature");
  const rawBody = await request.text();

  try {
    const result = await processCalendlyWebhook(rawBody, signature, accountId);
    return NextResponse.json(result, { status: result.duplicate ? 200 : 202 });
  } catch (error) {
    const details = calendlyWebhookErrorResponse(error);
    return NextResponse.json(
      {
        error: details.message,
        code: details.code,
      },
      { status: details.status },
    );
  }
}
