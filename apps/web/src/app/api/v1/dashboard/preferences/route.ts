import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success, badRequest } from "@/lib/api-utils";
import { setUserDashboardPreference } from "@/services/dashboard";

/**
 * POST /api/v1/dashboard/preferences
 * Body: { view: "rep" | "manager" | "leadership" }
 */
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => null);
  const { view } = body ?? {};

  if (!view || !["rep", "manager", "leadership"].includes(view)) {
    return badRequest("view must be one of: rep, manager, leadership");
  }

  // Non-admins can only save "rep"
  const allowedView = ctx.workspaceRole === "admin" ? view : "rep";

  await setUserDashboardPreference(ctx.workspaceId, ctx.userId, allowedView);
  return success({ view: allowedView });
}
