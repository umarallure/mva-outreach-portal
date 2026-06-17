import { NextResponse } from "next/server";
import { requireApiOutreachAccess } from "@/lib/api-auth";
import { getViewerSessionTarget } from "@/lib/gologin-sessions";
import { signViewerTicket, ViewerTicketError } from "@/lib/viewer-ticket";

type ViewerTicketRouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

export const dynamic = "force-dynamic";

/**
 * Issues a short-lived, signed ticket that authorizes the browser to open a CDP
 * relay connection on the browser-gateway. The GoLogin token is never exposed —
 * the gateway holds it and connects upstream using the profile id in the ticket.
 */
export async function POST(_request: Request, { params }: ViewerTicketRouteContext) {
  const { current, response } = await requireApiOutreachAccess();
  if (response) return response;

  const { sessionId } = await params;

  const gatewayUrl = process.env.NEXT_PUBLIC_BROWSER_GATEWAY_URL?.trim();
  if (!gatewayUrl) {
    return NextResponse.json(
      { error: "Live browser gateway is not configured (NEXT_PUBLIC_BROWSER_GATEWAY_URL)." },
      { status: 503 },
    );
  }

  try {
    const target = await getViewerSessionTarget(sessionId);

    if (!target) {
      return NextResponse.json({ error: "GoLogin session was not found." }, { status: 404 });
    }
    if (!target.isActive) {
      return NextResponse.json(
        { error: "GoLogin session is no longer active.", code: "session_inactive" },
        { status: 409 },
      );
    }
    if (!target.gologinProfileId) {
      return NextResponse.json(
        { error: "Session has no GoLogin profile mapped." },
        { status: 409 },
      );
    }

    const { ticket, expiresAt } = signViewerTicket({
      sid: sessionId,
      pid: target.gologinProfileId,
      uid: current.user!.id,
    });

    return NextResponse.json({ ticket, gatewayUrl, expiresAt });
  } catch (error) {
    if (error instanceof ViewerTicketError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Unable to issue a live browser ticket." },
      { status: 500 },
    );
  }
}
