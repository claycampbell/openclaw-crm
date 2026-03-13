import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, forbidden, badRequest, success } from "@/lib/api-utils";
import { db } from "@/db";
import { workspaces, workspaceMembers } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

/**
 * PATCH /api/v1/team/:userId
 * Update a user's memberships across child workspaces.
 * Body: { memberships: { workspaceId: string, role: "admin" | "member" }[] }
 * 
 * This replaces the user's memberships — any workspace not included is removed,
 * any new workspace is added.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  if (ctx.workspaceType !== "agency" || ctx.workspaceRole !== "admin") {
    return forbidden("Only agency admins can manage team memberships");
  }

  const { userId } = await params;
  const body = await req.json();
  const { memberships } = body as {
    memberships: { workspaceId: string; role: "admin" | "member" }[];
  };

  if (!Array.isArray(memberships)) {
    return badRequest("memberships[] is required");
  }

  // Get allowed workspace IDs (agency + children)
  const childWorkspaces = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.parentWorkspaceId, ctx.workspaceId));
  const allowedIds = new Set([ctx.workspaceId, ...childWorkspaces.map((w) => w.id)]);

  // Validate all target workspaces
  for (const m of memberships) {
    if (!allowedIds.has(m.workspaceId)) {
      return forbidden(`Workspace ${m.workspaceId} is not part of this agency`);
    }
  }

  const desiredWsIds = new Set(memberships.map((m) => m.workspaceId));

  // Get current memberships for this user across allowed workspaces
  const currentMemberships = await db
    .select({ id: workspaceMembers.id, workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        inArray(workspaceMembers.workspaceId, Array.from(allowedIds))
      )
    );

  // Remove memberships not in the desired set
  const toRemove = currentMemberships.filter((m) => !desiredWsIds.has(m.workspaceId));
  if (toRemove.length > 0) {
    await db
      .delete(workspaceMembers)
      .where(inArray(workspaceMembers.id, toRemove.map((m) => m.id)));
  }

  // Add or update memberships
  const currentWsIds = new Set(currentMemberships.map((m) => m.workspaceId));
  for (const m of memberships) {
    if (currentWsIds.has(m.workspaceId)) {
      // Update role
      await db
        .update(workspaceMembers)
        .set({ role: m.role })
        .where(
          and(
            eq(workspaceMembers.userId, userId),
            eq(workspaceMembers.workspaceId, m.workspaceId)
          )
        );
    } else {
      // Add new membership
      await db
        .insert(workspaceMembers)
        .values({ workspaceId: m.workspaceId, userId, role: m.role })
        .onConflictDoNothing();
    }
  }

  return success({ updated: true });
}

/**
 * DELETE /api/v1/team/:userId
 * Remove a user from a specific workspace.
 * Query: ?workspaceId=xxx
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  if (ctx.workspaceType !== "agency" || ctx.workspaceRole !== "admin") {
    return forbidden("Only agency admins can manage team memberships");
  }

  const { userId } = await params;
  const workspaceId = req.nextUrl.searchParams.get("workspaceId");

  if (!workspaceId) {
    return badRequest("workspaceId query parameter is required");
  }

  // Verify workspace is in this agency
  const childWorkspaces = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.parentWorkspaceId, ctx.workspaceId));
  const allowedIds = new Set([ctx.workspaceId, ...childWorkspaces.map((w) => w.id)]);

  if (!allowedIds.has(workspaceId)) {
    return forbidden("Workspace is not part of this agency");
  }

  const deleted = await db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.workspaceId, workspaceId)
      )
    )
    .returning();

  return success({ removed: deleted.length > 0 });
}
