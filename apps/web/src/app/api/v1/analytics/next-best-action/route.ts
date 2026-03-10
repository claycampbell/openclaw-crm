import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success, badRequest } from "@/lib/api-utils";
import { getNextBestAction } from "@/services/analytics/next-best-action";

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  // No admin requirement — all workspace members can see NBA suggestions
  const url = new URL(req.url);
  const recordId = url.searchParams.get("recordId");

  if (!recordId || recordId.trim() === "") {
    return badRequest("recordId query parameter is required");
  }

  try {
    const nba = await getNextBestAction(ctx.workspaceId, recordId);
    return success(nba);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Record not found or access denied") {
      return badRequest("Record not found or does not belong to your workspace");
    }
    console.error("[next-best-action] Failed:", err);
    return badRequest("Failed to compute next best action");
  }
}
