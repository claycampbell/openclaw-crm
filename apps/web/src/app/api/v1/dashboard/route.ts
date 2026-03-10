import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success, badRequest } from "@/lib/api-utils";
import {
  getRepDashboard,
  getManagerDashboard,
  getLeadershipDashboard,
  getUserDashboardPreference,
} from "@/services/dashboard";

/**
 * GET /api/v1/dashboard
 *
 * Returns role-appropriate dashboard data.
 * Query params:
 *   view=rep|manager|leadership  (overrides saved preference)
 */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const url = new URL(req.url);
  const viewParam = url.searchParams.get("view") as "rep" | "manager" | "leadership" | null;

  // Determine view: query param > saved preference > default "rep"
  let view = viewParam;
  if (!view || !["rep", "manager", "leadership"].includes(view)) {
    view = await getUserDashboardPreference(ctx.workspaceId, ctx.userId);
  }

  try {
    switch (view) {
      case "manager": {
        // Only admins can access manager view
        if (ctx.workspaceRole !== "admin") {
          const data = await getRepDashboard(ctx.workspaceId, ctx.userId);
          return success({ view: "rep", data });
        }
        const data = await getManagerDashboard(ctx.workspaceId);
        return success({ view: "manager", data });
      }
      case "leadership": {
        if (ctx.workspaceRole !== "admin") {
          const data = await getRepDashboard(ctx.workspaceId, ctx.userId);
          return success({ view: "rep", data });
        }
        const data = await getLeadershipDashboard(ctx.workspaceId);
        return success({ view: "leadership", data });
      }
      default: {
        const data = await getRepDashboard(ctx.workspaceId, ctx.userId);
        return success({ view: "rep", data });
      }
    }
  } catch (err) {
    console.error("[dashboard] Error loading dashboard:", err);
    return success({ view, data: null, error: "Failed to load dashboard data" });
  }
}
