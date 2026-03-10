import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success } from "@/lib/api-utils";
import { getConnectionStatus } from "@/services/integrations/token-manager";

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const status = await getConnectionStatus(ctx.workspaceId, ctx.userId);

  return success(status);
}
