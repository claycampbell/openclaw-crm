import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success, badRequest } from "@/lib/api-utils";
import { listContracts, generateContract } from "@/services/contracts";

/**
 * GET /api/v1/contracts
 * List contracts. Filters: recordId, status
 */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const url = new URL(req.url);
  const recordId = url.searchParams.get("recordId") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);
  const offset = parseInt(url.searchParams.get("offset") ?? "0");

  const results = await listContracts(ctx.workspaceId, { recordId, status, limit, offset });
  return success(results);
}

/**
 * POST /api/v1/contracts
 * Generate a new contract.
 */
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body?.title) {
    return badRequest("title is required");
  }

  const contract = await generateContract(ctx.workspaceId, {
    templateId: body.templateId,
    recordId: body.recordId,
    title: body.title,
    contractType: body.contractType ?? "custom",
    mergeFields: body.mergeFields ?? {},
    routeToApproval: body.routeToApproval ?? false,
    generatedBy: ctx.userId,
  });

  return success(contract, 201);
}
