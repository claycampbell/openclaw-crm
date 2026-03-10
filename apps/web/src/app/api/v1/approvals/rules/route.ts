import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success, badRequest, requireAdmin } from "@/lib/api-utils";
import { listApprovalRules, createApprovalRule } from "@/services/approvals";

/**
 * GET /api/v1/approvals/rules
 * List approval rules for the workspace.
 */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const rules = await listApprovalRules(ctx.workspaceId);
  return success(rules);
}

/**
 * POST /api/v1/approvals/rules
 * Create a new approval rule. Admin only.
 */
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const adminErr = requireAdmin(ctx);
  if (adminErr) return adminErr;

  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.triggerType) {
    return badRequest("name and triggerType are required");
  }

  const validTriggers = ["discount_threshold", "deal_value_threshold", "stage_change", "contract_send", "manual"];
  if (!validTriggers.includes(body.triggerType)) {
    return badRequest(`triggerType must be one of: ${validTriggers.join(", ")}`);
  }

  const rule = await createApprovalRule(
    ctx.workspaceId,
    {
      name: body.name,
      description: body.description,
      triggerType: body.triggerType,
      conditions: body.conditions ?? {},
      approverIds: Array.isArray(body.approverIds) ? body.approverIds : [],
      expiresAfterHours: body.expiresAfterHours,
    },
    ctx.userId
  );

  return success(rule, 201);
}
