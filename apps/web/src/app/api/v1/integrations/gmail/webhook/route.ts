/**
 * Gmail push notification receiver (Google Cloud Pub/Sub push subscription).
 * Receives base64-encoded JSON messages containing historyId.
 * Returns 200 immediately before processing to prevent Pub/Sub retries.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { integrationTokens } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { syncNewMessages } from "@/services/integrations/gmail";
import { markSignalProcessed } from "@/services/signals";

export async function POST(req: NextRequest) {
  // Return 200 immediately — Pub/Sub will retry on non-2xx
  const bodyText = await req.text();

  // Process async (fire and forget)
  processWebhook(bodyText).catch((err) => {
    console.error("[gmail/webhook] Processing error:", err);
  });

  return new NextResponse(null, { status: 200 });
}

async function processWebhook(bodyText: string): Promise<void> {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    return;
  }

  // Pub/Sub message format: { message: { data: base64, messageId: "...", ... }, subscription: "..." }
  const message = body.message as Record<string, unknown> | undefined;
  if (!message?.data) return;

  const pubsubMessageId = message.messageId as string | undefined;
  if (pubsubMessageId) {
    // Deduplicate at the Pub/Sub message level
    const isNew = await markSignalProcessed("gmail_pubsub", pubsubMessageId);
    if (!isNew) return;
  }

  let gmailPayload: { emailAddress: string; historyId: number } | null = null;
  try {
    const decoded = Buffer.from(message.data as string, "base64").toString("utf-8");
    gmailPayload = JSON.parse(decoded) as { emailAddress: string; historyId: number };
  } catch {
    return;
  }

  if (!gmailPayload?.emailAddress) return;

  // Find the integration token by email address stored in providerMetadata
  // For simplicity, find all active Gmail tokens and trigger sync for each
  // (in production you'd store the Gmail address in providerMetadata to narrow this down)
  const activeTokens = await db
    .select({
      workspaceId: integrationTokens.workspaceId,
      userId: integrationTokens.userId,
    })
    .from(integrationTokens)
    .where(
      and(
        eq(integrationTokens.provider, "gmail"),
        eq(integrationTokens.status, "active")
      )
    )
    .limit(50);

  for (const token of activeTokens) {
    await syncNewMessages(token.workspaceId, token.userId).catch((err) => {
      console.error(
        `[gmail/webhook] Sync failed for workspace ${token.workspaceId}:`,
        err
      );
    });
  }
}
