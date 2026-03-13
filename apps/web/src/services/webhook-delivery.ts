/**
 * Webhook delivery service — dispatches CRM events to outbound webhook subscriptions.
 * 
 * Usage:
 *   await dispatchWebhookEvent(workspaceId, "record.created", { recordId, objectSlug, ... });
 * 
 * Features:
 * - HMAC-SHA256 signing via X-Webhook-Signature header
 * - Automatic failure tracking (failureCount, lastError)
 * - Auto-disable after 10 consecutive failures
 * - 5-second timeout per delivery
 */
import { db } from "@/db";
import { outboundWebhooks } from "@/db/schema/webhooks";
import { eq, and, sql } from "drizzle-orm";
import { createHmac } from "crypto";

const MAX_CONSECUTIVE_FAILURES = 10;
const DELIVERY_TIMEOUT_MS = 5000;

export interface WebhookPayload {
  event: string;
  timestamp: string;
  workspaceId: string;
  data: Record<string, unknown>;
}

/**
 * Dispatch an event to all matching outbound webhooks for a workspace.
 * Non-throwing — logs errors but doesn't propagate them.
 */
export async function dispatchWebhookEvent(
  workspaceId: string,
  eventType: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    // Fetch enabled webhooks that listen for this event type
    const webhooks = await db
      .select()
      .from(outboundWebhooks)
      .where(
        and(
          eq(outboundWebhooks.workspaceId, workspaceId),
          eq(outboundWebhooks.enabled, true)
        )
      );

    const matching = webhooks.filter((wh) => {
      const events = wh.events.split(",").map((e) => e.trim());
      return events.includes(eventType) || events.includes("*");
    });

    if (matching.length === 0) return;

    const payload: WebhookPayload = {
      event: eventType,
      timestamp: new Date().toISOString(),
      workspaceId,
      data,
    };

    const body = JSON.stringify(payload);

    // Deliver to all matching webhooks concurrently
    await Promise.allSettled(
      matching.map((wh) => deliverToWebhook(wh, body))
    );
  } catch (err) {
    console.error("[webhook-delivery] Error dispatching event:", err);
  }
}

async function deliverToWebhook(
  webhook: typeof outboundWebhooks.$inferSelect,
  body: string
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "OpenClaw-CRM/1.0",
    "X-Webhook-Event": JSON.parse(body).event,
  };

  // HMAC-SHA256 signing
  if (webhook.secret) {
    const signature = createHmac("sha256", webhook.secret)
      .update(body)
      .digest("hex");
    headers["X-Webhook-Signature"] = `sha256=${signature}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

    const response = await fetch(webhook.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Success — reset failure count
    await db
      .update(outboundWebhooks)
      .set({
        failureCount: 0,
        lastSuccessAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(outboundWebhooks.id, webhook.id));

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const newFailureCount = (webhook.failureCount ?? 0) + 1;

    // Update failure state
    await db
      .update(outboundWebhooks)
      .set({
        failureCount: newFailureCount,
        lastError: errorMsg,
        // Auto-disable after too many consecutive failures
        enabled: newFailureCount < MAX_CONSECUTIVE_FAILURES,
        updatedAt: new Date(),
      })
      .where(eq(outboundWebhooks.id, webhook.id));

    console.warn(
      `[webhook-delivery] Failed to deliver to "${webhook.name}" (${webhook.url}): ${errorMsg}` +
      (newFailureCount >= MAX_CONSECUTIVE_FAILURES ? " — auto-disabled" : "")
    );
  }
}
