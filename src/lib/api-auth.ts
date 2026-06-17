import "server-only";

import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/auth";
import { hasOutreachAccess } from "@/lib/access";

export async function requireApiOutreachAccess() {
  const current = await getCurrentUserProfile();

  if (!current.user) {
    return {
      current,
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    };
  }

  if (!hasOutreachAccess(current.profile)) {
    return {
      current,
      response: NextResponse.json({ error: "Access restricted." }, { status: 403 }),
    };
  }

  return { current, response: null };
}
