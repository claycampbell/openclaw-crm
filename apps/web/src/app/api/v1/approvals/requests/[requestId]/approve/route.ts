import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success, notFound, badRequest } from "@/lib/api-utils";
import { approveRequest, getApprovalRequest } from "@/services/approvals";

/**
 * POST /api/v1/approvals/requests/[requestId]/approve
 * Approve a pending request.
 *
 * The approver must be in the rule's approverIds list, or be an admin.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const { requestId } = await params;
  const body = await req.json().catch(() => ({}));

  // Check request exists and user is authorized
  const request = await getApprovalRequest(ctx.workspaceId, requestId);
  if (!request) return notFound("Approval request not found");

  if (request.status !== "pending") {
    return badRequest(`Request is already ${request.status}`);
  }

  // Check if user is an approver for this rule, or workspace admin
  const isApprover =
    ctx.workspaceRole === "admin" ||
    (request.rule?.approverIds.includes(ctx.userId) ?? false);

  if (!isApprover) {
    return badRequest("You are not an approver for this request");
  }

  const updated = await approveRequest(ctx.workspaceId, requestId, ctx.userId, body.note);
  if (!updated) return notFound("Approval request not found");

  return success(updated);
}
