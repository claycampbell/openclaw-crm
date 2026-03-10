import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, requireAdmin, success, badRequest } from "@/lib/api-utils";
import { getWinLossPatterns, hasMinimumDataVolume } from "@/services/analytics/win-loss";

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const adminCheck = requireAdmin(ctx);
  if (adminCheck) return adminCheck;

  // Parse optional time range filter
  const url = new URL(req.url);
  const since = url.searchParams.get("since");

  let sinceDate: Date | undefined;
  if (since === "90d") {
    sinceDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  } else if (since === "6m") {
    sinceDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  }
  // "all" or missing = no date filter

  try {
    // Check data volume first — return insufficient state rather than an error
    const volumeCheck = await hasMinimumDataVolume(ctx.workspaceId);
    if (!volumeCheck.sufficient) {
      return success({
        insufficient: true,
        closedCount: volumeCheck.closedCount,
        minimumRequired: volumeCheck.minimumRequired,
      });
    }

    const analysis = await getWinLossPatterns(ctx.workspaceId, { since: sinceDate });
    return success(analysis);
  } catch (err) {
    console.error("[win-loss] Failed to compute analysis:", err);
    return badRequest("Failed to compute win/loss analysis");
  }
}
