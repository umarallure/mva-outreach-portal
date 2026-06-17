import { NextResponse } from "next/server";
import { getAccountById } from "@/config/pipelines";
import { requireApiOutreachAccess } from "@/lib/api-auth";
import { gologinApiErrorResponse } from "@/lib/api-errors";
import { getProfileStatus } from "@/lib/gologin";
import { getActiveSessionForAccount, startAccountSession } from "@/lib/gologin-sessions";

type StartSessionRequest = {
  pipelineId?: string;
};

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { current, response } = await requireApiOutreachAccess();
  if (response) return response;

  const pipelineId = new URL(request.url).searchParams.get("pipelineId");
  if (!pipelineId) {
    return NextResponse.json({ error: "pipelineId is required." }, { status: 400 });
  }

  const account = getAccountById(pipelineId);
  if (!account) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  try {
    const [session, profileStatus] = await Promise.all([
      getActiveSessionForAccount(account, current.profile),
      account.gologinProfileId ? getProfileStatus(account.gologinProfileId) : Promise.resolve(null),
    ]);

    return NextResponse.json({
      session,
      profileStatus,
      setup: {
        hasGologinProfile: Boolean(account.gologinProfileId),
        hasTargetUrl: Boolean(account.defaultTargetUrl || account.flowchatUrl || account.linkedinUrl),
      },
    });
  } catch (error) {
    return gologinApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const { current, response } = await requireApiOutreachAccess();
  if (response) return response;

  let body: StartSessionRequest;
  try {
    body = (await request.json()) as StartSessionRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.pipelineId) {
    return NextResponse.json({ error: "pipelineId is required." }, { status: 400 });
  }

  const account = getAccountById(body.pipelineId);
  if (!account) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  try {
    const session = await startAccountSession(account, current.user!, current.profile);
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    return gologinApiErrorResponse(error);
  }
}
