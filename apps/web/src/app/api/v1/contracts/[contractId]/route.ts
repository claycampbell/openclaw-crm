import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success, notFound, badRequest } from "@/lib/api-utils";
import { getContract, updateContractStatus, contractToPlainText } from "@/services/contracts";

/**
 * GET /api/v1/contracts/[contractId]
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ contractId: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const { contractId } = await params;
  const contract = await getContract(ctx.workspaceId, contractId);
  if (!contract) return notFound("Contract not found");

  return success(contract);
}

/**
 * PATCH /api/v1/contracts/[contractId]
 * Update contract status.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ contractId: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const { contractId } = await params;
  const body = await req.json().catch(() => null);

  const validStatuses = ["draft", "pending_approval", "approved", "sent", "signed", "rejected", "expired", "cancelled"];
  if (!body?.status || !validStatuses.includes(body.status)) {
    return badRequest(`status must be one of: ${validStatuses.join(", ")}`);
  }

  const updated = await updateContractStatus(ctx.workspaceId, contractId, body.status, ctx.userId);
  if (!updated) return notFound("Contract not found");

  return success(updated);
}
