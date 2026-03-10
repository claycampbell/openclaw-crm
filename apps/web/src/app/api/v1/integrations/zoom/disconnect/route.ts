import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success, requireAdmin } from "@/lib/api-utils";
import { revokeToken } from "@/services/integrations/token-manager";

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const adminCheck = requireAdmin(ctx);
  if (adminCheck) return adminCheck;

  await revokeToken(ctx.workspaceId, ctx.userId, "zoom");

  return success({ disconnected: true });
}
