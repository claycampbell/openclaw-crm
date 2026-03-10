import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success, badRequest } from "@/lib/api-utils";
import { listHandoffBriefs, triggerCloseFlow, deliverHandoffBriefViaWebhook } from "@/services/close-flow";

/**
 * GET /api/v1/close-flow/handoff
 * List handoff briefs for the workspace.
 * Optional: ?dealId=<recordId>
 */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const url = new URL(req.url);
  const dealId = url.searchParams.get("dealId") ?? undefined;

  const briefs = await listHandoffBriefs(ctx.workspaceId, dealId);
  return success(briefs);
}

/**
 * POST /api/v1/close-flow/handoff
 * Manually trigger a handoff brief generation.
 * Body: { dealId: string, webhookUrl?: string }
 */
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body?.dealId) {
    return badRequest("dealId is required");
  }

  const result = await triggerCloseFlow(ctx.workspaceId, body.dealId, ctx.userId);
  if (!result) {
    return badRequest("Failed to generate handoff brief");
  }

  // Optionally deliver via webhook immediately
  if (body.webhookUrl) {
    await deliverHandoffBriefViaWebhook(ctx.workspaceId, result.assetId, body.webhookUrl);
  }

  return success(result, 201);
}
