import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, forbidden, badRequest, success } from "@/lib/api-utils";
import { db } from "@/db";
import { workspaces, workspaceMembers, users } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

/**
 * GET /api/v1/team
 * Agency admin view: returns all users across all child workspaces
 * with their membership info per workspace.
 */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  if (ctx.workspaceType !== "agency") {
    return forbidden("Team management is only available for agency workspaces");
  }
  if (ctx.workspaceRole !== "admin") {
    return forbidden("Only admins can manage the team");
  }

  // Get all child workspaces
  const childWorkspaces = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      type: workspaces.type,
    })
    .from(workspaces)
    .where(eq(workspaces.parentWorkspaceId, ctx.workspaceId))
    .orderBy(workspaces.name);

  const allWorkspaceIds = [ctx.workspaceId, ...childWorkspaces.map((w) => w.id)];

  // Get all memberships across these workspaces
  const memberships = await db
    .select({
      membershipId: workspaceMembers.id,
      workspaceId: workspaceMembers.workspaceId,
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      createdAt: workspaceMembers.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(inArray(workspaceMembers.workspaceId, allWorkspaceIds));

  // Group by user
  const userMap = new Map<string, {
    userId: string;
    name: string;
    email: string;
    memberships: { membershipId: string; workspaceId: string; workspaceName: string; role: string; createdAt: string }[];
  }>();

  for (const m of memberships) {
    if (!userMap.has(m.userId)) {
      userMap.set(m.userId, {
        userId: m.userId,
        name: m.userName,
        email: m.userEmail,
        memberships: [],
      });
    }
    const wsName = m.workspaceId === ctx.workspaceId
      ? "Agency"
      : childWorkspaces.find((w) => w.id === m.workspaceId)?.name ?? "Unknown";

    userMap.get(m.userId)!.memberships.push({
      membershipId: m.membershipId,
      workspaceId: m.workspaceId,
      workspaceName: wsName,
      role: m.role,
      createdAt: m.createdAt?.toISOString() ?? "",
    });
  }

  return success({
    workspaces: [
      { id: ctx.workspaceId, name: "Agency", type: "agency" },
      ...childWorkspaces,
    ],
    users: Array.from(userMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
  });
}

/**
 * POST /api/v1/team
 * Add a user to one or more workspaces.
 * Body: { userId: string, workspaceIds: string[], role?: "admin" | "member" }
 */
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  if (ctx.workspaceType !== "agency") {
    return forbidden("Team management is only available for agency workspaces");
  }
  if (ctx.workspaceRole !== "admin") {
    return forbidden("Only admins can manage the team");
  }

  const body = await req.json();
  const { userId, workspaceIds, role = "member" } = body;

  if (!userId || !Array.isArray(workspaceIds) || workspaceIds.length === 0) {
    return badRequest("userId and workspaceIds[] are required");
  }

  // Verify all target workspaces are children of this agency (or the agency itself)
  const childWorkspaces = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.parentWorkspaceId, ctx.workspaceId));
  const allowedIds = new Set([ctx.workspaceId, ...childWorkspaces.map((w) => w.id)]);

  for (const wsId of workspaceIds) {
    if (!allowedIds.has(wsId)) {
      return forbidden(`Workspace ${wsId} is not part of this agency`);
    }
  }

  // Verify user exists
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return badRequest("User not found");

  // Add memberships (skip conflicts)
  const results = [];
  for (const wsId of workspaceIds) {
    try {
      const [membership] = await db
        .insert(workspaceMembers)
        .values({ workspaceId: wsId, userId, role: role as "admin" | "member" })
        .onConflictDoNothing()
        .returning();
      if (membership) results.push(membership);
    } catch {
      // skip
    }
  }

  return success({ added: results.length, memberships: results }, 201);
}
