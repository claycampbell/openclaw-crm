import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success, notFound, requireAdmin } from "@/lib/api-utils";
import { updateApprovalRule, deleteApprovalRule } from "@/services/approvals";

/**
 * PUT /api/v1/approvals/rules/[ruleId]
 * Update an approval rule. Admin only.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const adminErr = requireAdmin(ctx);
  if (adminErr) return adminErr;

  const { ruleId } = await params;
  const body = await req.json().catch(() => null);

  const updated = await updateApprovalRule(ctx.workspaceId, ruleId, body ?? {});
  if (!updated) return notFound("Approval rule not found");

  return success(updated);
}

/**
 * DELETE /api/v1/approvals/rules/[ruleId]
 * Soft-delete (deactivate) an approval rule. Admin only.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const adminErr = requireAdmin(ctx);
  if (adminErr) return adminErr;

  const { ruleId } = await params;
  await deleteApprovalRule(ctx.workspaceId, ruleId);
  return success({ deleted: true });
}
