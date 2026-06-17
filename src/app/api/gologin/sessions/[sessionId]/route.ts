import { requireApiOutreachAccess } from "@/lib/api-auth";
import { gologinApiErrorResponse } from "@/lib/api-errors";
import { stopAccountSession } from "@/lib/gologin-sessions";

type SessionRouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: SessionRouteContext) {
  const { current, response } = await requireApiOutreachAccess();
  if (response) return response;

  const { sessionId } = await params;

  try {
    const session = await stopAccountSession(sessionId, current.profile);
    return Response.json({ session });
  } catch (error) {
    return gologinApiErrorResponse(error);
  }
}
