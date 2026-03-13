import { NextRequest } from "next/server";
import { getAuthContext, success, unauthorized, notFound } from "@/lib/api-utils";
import { getWorkspaceWithHierarchy, getWorkspaceTree } from "@/services/workspace";

/**
 * GET /api/v1/workspaces/:workspaceId/hierarchy
 * Returns workspace with parent + children info.
 * For agency workspaces, returns the full three-tier tree.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { workspaceId } = await params;

  // For agency workspaces, return the full tree
  const hierarchy = await getWorkspaceWithHierarchy(workspaceId);
  if (!hierarchy) return notFound("Workspace not found");

  // If it's an agency, also include the full tree structure
  if (hierarchy.type === "agency") {
    const tree = await getWorkspaceTree(workspaceId);
    return success({ ...hierarchy, tree });
  }

  return success(hierarchy);
}
