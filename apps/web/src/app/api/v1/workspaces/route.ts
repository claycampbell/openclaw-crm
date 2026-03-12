import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { success, badRequest } from "@/lib/api-utils";
import { createWorkspace, createWorkspaceWithHierarchy, listUserWorkspaces } from "@/services/workspace";
import { WORKSPACE_TYPES, type WorkspaceType } from "@openclaw-crm/shared";
import { db } from "@/db";
import { workspaceInvites, workspaceMembers } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

/** GET /api/v1/workspaces — List workspaces the current user belongs to */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  const workspaces = await listUserWorkspaces(session.user.id);
  return success(workspaces);
}

/** POST /api/v1/workspaces — Create a new workspace */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const name = body.name as string;
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return badRequest("name is required");
  }

  // If user has a pending invite, don't create a new workspace — redirect them to accept it
  const pendingInvite = await db
    .select({ token: workspaceInvites.token, workspaceId: workspaceInvites.workspaceId })
    .from(workspaceInvites)
    .where(and(eq(workspaceInvites.email, session.user.email!.toLowerCase()), isNull(workspaceInvites.acceptedAt)))
    .limit(1);

  if (pendingInvite.length > 0) {
    const invite = pendingInvite[0];
    // Auto-accept: add them to the invited workspace
    await db.insert(workspaceMembers)
      .values({ workspaceId: invite.workspaceId, userId: session.user.id, role: "member" })
      .onConflictDoNothing();
    await db.update(workspaceInvites).set({ acceptedAt: new Date() }).where(eq(workspaceInvites.token, invite.token));
    const response = NextResponse.json({ data: { id: invite.workspaceId, redirectToInvite: true } }, { status: 200 });
    response.cookies.set("active-workspace-id", invite.workspaceId, { path: "/", httpOnly: false, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
    return response;
  }

  try {
    const type = (body.type as string) || undefined;
    const parentWorkspaceId = (body.parentWorkspaceId as string) || undefined;

    // If type is specified, use hierarchy-aware creation
    let workspace;
    if (type) {
      if (!WORKSPACE_TYPES.includes(type as WorkspaceType)) {
        return badRequest(`Invalid workspace type. Must be one of: ${WORKSPACE_TYPES.join(", ")}`);
      }
      workspace = await createWorkspaceWithHierarchy(name.trim(), type as WorkspaceType, session.user.id, parentWorkspaceId);
    } else {
      // Backward compatible: default to company type
      workspace = await createWorkspace(name.trim(), session.user.id);
    }

    // Set active-workspace-id cookie
    const response = NextResponse.json({ data: workspace }, { status: 201 });
    response.cookies.set("active-workspace-id", workspace.id, {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });

    return response;
  } catch (err: any) {
    // Return validation errors as 400
    if (err?.message?.includes("parent") || err?.message?.includes("Agency") || err?.message?.includes("Business unit")) {
      return badRequest(err.message);
    }
    console.error("Failed to create workspace:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create workspace" } },
      { status: 500 }
    );
  }
}
