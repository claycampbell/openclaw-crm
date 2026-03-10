import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success } from "@/lib/api-utils";
import { revokeToken } from "@/services/integrations/token-manager";

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  await revokeToken(ctx.workspaceId, ctx.userId, "gmail");
  // Google Calendar shares the Gmail credential — revoke both
  await revokeToken(ctx.workspaceId, ctx.userId, "google_calendar");

  return success({ disconnected: true });
}
