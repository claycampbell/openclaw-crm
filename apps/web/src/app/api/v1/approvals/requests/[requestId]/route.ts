import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success, notFound } from "@/lib/api-utils";
import { getApprovalRequest, getApprovalHistory } from "@/services/approvals";

/**
 * GET /api/v1/approvals/requests/[requestId]
 * Get a single approval request with its rule and history.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const { requestId } = await params;
  const request = await getApprovalRequest(ctx.workspaceId, requestId);
  if (!request) return notFound("Approval request not found");

  const history = await getApprovalHistory(ctx.workspaceId, requestId);

  return success({ ...request, history });
}
