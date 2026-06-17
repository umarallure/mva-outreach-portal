import { requireApiOutreachAccess } from "@/lib/api-auth";
import { gologinApiErrorResponse } from "@/lib/api-errors";
import { heartbeatAccountSession } from "@/lib/gologin-sessions";

type HeartbeatRouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: HeartbeatRouteContext) {
  const { current, response } = await requireApiOutreachAccess();
  if (response) return response;

  const { sessionId } = await params;

  try {
    const session = await heartbeatAccountSession(sessionId, current.profile);
    return Response.json({ session });
  } catch (error) {
    return gologinApiErrorResponse(error);
  }
}
