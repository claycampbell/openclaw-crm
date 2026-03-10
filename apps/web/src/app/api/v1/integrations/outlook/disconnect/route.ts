import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success } from "@/lib/api-utils";
import { revokeToken } from "@/services/integrations/token-manager";

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  await revokeToken(ctx.workspaceId, ctx.userId, "outlook");
  // Outlook Calendar shares the O365 credential
  await revokeToken(ctx.workspaceId, ctx.userId, "outlook_calendar");

  return success({ disconnected: true });
}
