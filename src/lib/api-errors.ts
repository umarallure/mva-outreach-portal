import "server-only";

import { NextResponse } from "next/server";
import { GologinApiError } from "@/lib/gologin";
import {
  OutreachSessionConflictError,
  OutreachSessionError,
} from "@/lib/gologin-sessions";
import { SessionEncryptionError } from "@/lib/encryption";

export function gologinApiErrorResponse(error: unknown) {
  if (error instanceof OutreachSessionConflictError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        activeSession: error.activeSession,
      },
      { status: error.status },
    );
  }

  if (error instanceof OutreachSessionError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }

  if (error instanceof SessionEncryptionError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof GologinApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return NextResponse.json({ error: "Unable to complete GoLogin request." }, { status: 502 });
}
