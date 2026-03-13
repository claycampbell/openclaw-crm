import { NextRequest } from "next/server";
import { getAuthContext, success, unauthorized, notFound } from "@/lib/api-utils";
import { getWorkspace, getDescendantWorkspaceIds } from "@/services/workspace";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

/**
 * GET /api/v1/workspaces/:workspaceId/children
 * Returns direct children of a workspace.
 * Query param `?recursive=true` returns all descendants.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { workspaceId } = await params;
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return notFound("Workspace not found");

  const recursive = req.nextUrl.searchParams.get("recursive") === "true";

  if (recursive) {
    const descendantIds = await getDescendantWorkspaceIds(workspaceId);
    if (descendantIds.length === 0) return success([]);

    const descendants = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        type: workspaces.type,
        parentWorkspaceId: workspaces.parentWorkspaceId,
      })
      .from(workspaces)
      .where(inArray(workspaces.id, descendantIds))
      .orderBy(workspaces.name);

    return success(descendants);
  }

  // Direct children only
  const children = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      type: workspaces.type,
      parentWorkspaceId: workspaces.parentWorkspaceId,
    })
    .from(workspaces)
    .where(eq(workspaces.parentWorkspaceId, workspaceId))
    .orderBy(workspaces.name);

  return success(children);
}
