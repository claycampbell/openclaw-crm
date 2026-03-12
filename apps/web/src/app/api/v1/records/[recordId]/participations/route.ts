import { NextRequest } from "next/server";
import { getAuthContext, success, unauthorized, badRequest } from "@/lib/api-utils";
import {
  addParticipation,
  getParticipationsForRecord,
  removeParticipation,
} from "@/services/deal-participations";
import { DEAL_PARTICIPATION_ROLES, type DealParticipationRole } from "@openclaw-crm/shared";

/**
 * GET /api/v1/records/:recordId/participations
 * Returns all workspace participations for a deal record.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ recordId: string }> }
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { recordId } = await params;
  const participations = await getParticipationsForRecord(recordId);
  return success(participations);
}

/**
 * POST /api/v1/records/:recordId/participations
 * Add a workspace as a participant on a deal.
 * Body: { workspaceId: string, role?: DealParticipationRole }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ recordId: string }> }
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { recordId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const workspaceId = body.workspaceId as string;
  if (!workspaceId) return badRequest("workspaceId is required");

  const role = (body.role as string) || "participant";
  if (!DEAL_PARTICIPATION_ROLES.includes(role as DealParticipationRole)) {
    return badRequest(`Invalid role. Must be one of: ${DEAL_PARTICIPATION_ROLES.join(", ")}`);
  }

  try {
    const participation = await addParticipation(
      recordId,
      workspaceId,
      role as DealParticipationRole,
      auth.userId
    );
    return success(participation);
  } catch (err: any) {
    return badRequest(err.message || "Failed to add participation");
  }
}

/**
 * DELETE /api/v1/records/:recordId/participations
 * Remove a workspace's participation. Body: { workspaceId: string }
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ recordId: string }> }
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { recordId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const workspaceId = body.workspaceId as string;
  if (!workspaceId) return badRequest("workspaceId is required");

  const removed = await removeParticipation(recordId, workspaceId);
  if (!removed) return badRequest("Participation not found");

  return success(removed);
}
