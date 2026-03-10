import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success, badRequest, notFound } from "@/lib/api-utils";
import { deliverHandoffBriefViaWebhook } from "@/services/close-flow";
import { db } from "@/db";
import { generatedAssets } from "@/db/schema/generated-assets";
import { eq, and } from "drizzle-orm";

/**
 * POST /api/v1/close-flow/handoff/[assetId]/deliver
 * Deliver a handoff brief via webhook.
 * Body: { webhookUrl: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const { assetId } = await params;
  const body = await req.json().catch(() => null);

  if (!body?.webhookUrl) {
    return badRequest("webhookUrl is required");
  }

  // Verify asset exists
  const assets = await db
    .select({ id: generatedAssets.id })
    .from(generatedAssets)
    .where(
      and(
        eq(generatedAssets.id, assetId),
        eq(generatedAssets.workspaceId, ctx.workspaceId)
      )
    )
    .limit(1);

  if (assets.length === 0) {
    return notFound("Handoff brief not found");
  }

  const delivered = await deliverHandoffBriefViaWebhook(ctx.workspaceId, assetId, body.webhookUrl);

  return success({ delivered });
}
