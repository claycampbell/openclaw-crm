import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success } from "@/lib/api-utils";
import { listChannels } from "@/services/agent-channels";

// GET /api/v1/chat/channels
// Returns all named channels for the current workspace
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const channels = await listChannels(ctx.workspaceId);
  return success(channels);
}
