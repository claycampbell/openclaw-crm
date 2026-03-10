import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized, success } from "@/lib/api-utils";
import { listChannels } from "@/services/agent-channels";

// GET /api/v1/chat/channels
// Returns all named channels for the current workspace
export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return unauthorized();

    const channels = await listChannels(ctx.workspaceId);
    return success(channels);
  } catch (err) {
    console.error("GET /api/v1/chat/channels error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: String(err) } },
      { status: 500 }
    );
  }
}
