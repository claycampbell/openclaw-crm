import { NextRequest } from "next/server";
import {
  getAuthContext,
  unauthorized,
  requireAdmin,
  success,
  badRequest,
} from "@/lib/api-utils";
import {
  getRepCoachingRecommendations,
  hasCoachingDataVolume,
} from "@/services/analytics/rep-coaching";
import { db } from "@/db";
import { workspaceMembers, users } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const adminCheck = requireAdmin(ctx);
  if (adminCheck) return adminCheck;

  try {
    // Check data volume first
    const volumeCheck = await hasCoachingDataVolume(ctx.workspaceId);
    if (!volumeCheck.sufficient) {
      return success({
        insufficient: true,
        repCount: volumeCheck.repCount,
        minimumRequired: volumeCheck.minimumRequired,
      });
    }

    const report = await getRepCoachingRecommendations(ctx.workspaceId);

    // Enrich rep IDs with display names from workspace members
    const repUserIds = report.reps.map((r) => r.userId);

    let nameMap = new Map<string, string>();

    if (repUserIds.length > 0) {
      const members = await db
        .select({
          userId: users.id,
          name: users.name,
          email: users.email,
        })
        .from(users)
        .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
        .where(
          and(
            eq(workspaceMembers.workspaceId, ctx.workspaceId),
            inArray(users.id, repUserIds)
          )
        );

      nameMap = new Map(
        members.map((m) => [m.userId, m.name || m.email || m.userId])
      );
    }

    // Build enriched report — names added at API layer (not in service / not sent to LLM)
    const enrichedReps = report.reps.map((rep) => ({
      ...rep,
      displayName: nameMap.get(rep.userId) ?? "Unknown Rep",
    }));

    return success({
      ...report,
      reps: enrichedReps,
    });
  } catch (err) {
    console.error("[rep-coaching] Failed to compute coaching report:", err);
    return badRequest("Failed to compute coaching report");
  }
}
