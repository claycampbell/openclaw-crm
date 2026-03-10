/**
 * Microsoft Graph change notification receiver.
 * Handles the initial validationToken challenge and subsequent change notifications.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { integrationTokens } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { syncNewMessages } from "@/services/integrations/outlook";
import { markSignalProcessed } from "@/services/signals";

// Microsoft sends a GET with ?validationToken=... when creating a subscription
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const validationToken = searchParams.get("validationToken");
  if (validationToken) {
    // Must echo back the token as plain text
    return new NextResponse(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new NextResponse(null, { status: 400 });
}

export async function POST(req: NextRequest) {
  // Validation challenge can also come as POST with validationTokens in body
  const { searchParams } = new URL(req.url);
  const validationToken = searchParams.get("validationToken");
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const bodyText = await req.text();

  // Acknowledge immediately
  processWebhook(bodyText).catch((err) => {
    console.error("[outlook/webhook] Processing error:", err);
  });

  return new NextResponse(null, { status: 202 });
}

async function processWebhook(bodyText: string): Promise<void> {
  let body: { value?: Array<Record<string, unknown>> };
  try {
    body = JSON.parse(bodyText) as { value?: Array<Record<string, unknown>> };
  } catch {
    return;
  }

  const notifications = body.value ?? [];

  // Collect unique workspaceId+userId pairs from clientState
  const toSync = new Set<string>();

  for (const notification of notifications) {
    const clientState = notification.clientState as string | undefined;
    if (!clientState) continue;

    const notificationId = notification.id as string | undefined;
    if (notificationId) {
      const isNew = await markSignalProcessed("outlook_graph", notificationId);
      if (!isNew) continue;
    }

    // clientState format: "workspaceId:userId"
    const [workspaceId, userId] = (clientState ?? "").split(":");
    if (workspaceId && userId) {
      toSync.add(`${workspaceId}:${userId}`);
    }
  }

  for (const key of toSync) {
    const [workspaceId, userId] = key.split(":");
    await syncNewMessages(workspaceId, userId).catch((err) => {
      console.error(`[outlook/webhook] Sync failed for ${key}:`, err);
    });
  }
}
