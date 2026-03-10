import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, requireAdmin, success, badRequest } from "@/lib/api-utils";
import { getPipelineForecast } from "@/services/analytics/forecasting";

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const adminCheck = requireAdmin(ctx);
  if (adminCheck) return adminCheck;

  try {
    const forecast = await getPipelineForecast(ctx.workspaceId);
    return success(forecast);
  } catch (err) {
    console.error("[forecast] Failed to compute pipeline forecast:", err);
    return badRequest("Failed to compute pipeline forecast");
  }
}
