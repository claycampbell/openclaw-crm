import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/api-utils";
import { initiateOAuth } from "@/services/integrations/outlook";

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const url = initiateOAuth(ctx.workspaceId, ctx.userId);
  return NextResponse.redirect(url);
}
