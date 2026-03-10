import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success, badRequest } from "@/lib/api-utils";
import { listApprovalRequests, createApprovalRequest } from "@/services/approvals";

/**
 * GET /api/v1/approvals/requests
 * List approval requests. Filters:
 *   status=pending|approved|rejected|expired
 *   approverId=<userId>  — requests where userId is an approver
 *   requestedBy=<userId>
 *   recordId=<recordId>
 */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const url = new URL(req.url);
  const status = url.searchParams.get("status") as "pending" | "approved" | "rejected" | "expired" | null;
  const approverId = url.searchParams.get("approverId") ?? undefined;
  const requestedBy = url.searchParams.get("requestedBy") ?? undefined;
  const recordId = url.searchParams.get("recordId") ?? undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);
  const offset = parseInt(url.searchParams.get("offset") ?? "0");

  const requests = await listApprovalRequests(ctx.workspaceId, {
    status: status ?? undefined,
    approverId,
    requestedBy,
    recordId,
    limit,
    offset,
  });

  return success(requests);
}

/**
 * POST /api/v1/approvals/requests
 * Create a manual approval request.
 */
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body?.title) {
    return badRequest("title is required");
  }

  const request = await createApprovalRequest(ctx.workspaceId, {
    ruleId: body.ruleId,
    recordId: body.recordId,
    title: body.title,
    description: body.description,
    context: body.context ?? {},
    requestedBy: ctx.userId,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
  });

  return success(request, 201);
}
