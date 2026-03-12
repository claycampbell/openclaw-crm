import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success, notFound } from "@/lib/api-utils";
import { db } from "@/db";
import { outboundWebhooks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createHmac } from "crypto";

/**
 * POST /api/v1/webhooks/:id/test
 * 
 * Sends a test ping to the webhook URL to verify it's reachable.
 * Returns the HTTP status code and response time.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const { id } = await params;

  const [webhook] = await db
    .select()
    .from(outboundWebhooks)
    .where(and(eq(outboundWebhooks.id, id), eq(outboundWebhooks.workspaceId, ctx.workspaceId)))
    .limit(1);

  if (!webhook) return notFound("Webhook not found");

  const payload = {
    event: "webhook.test",
    timestamp: new Date().toISOString(),
    workspaceId: ctx.workspaceId,
    data: { message: "This is a test ping from OpenClaw CRM" },
  };

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "OpenClaw-CRM/1.0",
    "X-Webhook-Event": "webhook.test",
  };

  if (webhook.secret) {
    const signature = createHmac("sha256", webhook.secret)
      .update(body)
      .digest("hex");
    headers["X-Webhook-Signature"] = `sha256=${signature}`;
  }

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(webhook.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const elapsed = Date.now() - start;

    return success({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      responseTimeMs: elapsed,
    });
  } catch (err) {
    const elapsed = Date.now() - start;
    return success({
      success: false,
      status: 0,
      statusText: err instanceof Error ? err.message : "Connection failed",
      responseTimeMs: elapsed,
    });
  }
}
