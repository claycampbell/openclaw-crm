import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success } from "@/lib/api-utils";
import { getHotLeads } from "@/services/activity-scoring";

/**
 * GET /api/v1/activity-scores
 * Returns top records by activity score.
 * Query: ?limit=20 (default 20, max 50)
 */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") || 20), 50);

  const scored = await getHotLeads(ctx.workspaceId, limit);
  return success(scored);
}
