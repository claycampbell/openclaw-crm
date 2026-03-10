/**
 * Google Calendar push notification receiver.
 * Google sends a POST with X-Goog-Resource-State header.
 * We respond immediately and trigger a calendar sync.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { integrationTokens } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { syncCalendarEvents, processCalendarEventLifecycle } from "@/services/integrations/google-calendar";

export async function POST(req: NextRequest) {
  const resourceState = req.headers.get("x-goog-resource-state");

  // "sync" is the initial handshake — acknowledge and return
  if (resourceState === "sync") {
    return new NextResponse(null, { status: 200 });
  }

  // Trigger sync asynchronously
  processPush().catch((err) => {
    console.error("[google-calendar/webhook] Processing error:", err);
  });

  return new NextResponse(null, { status: 200 });
}

async function processPush(): Promise<void> {
  // Sync all active google_calendar tokens
  const tokens = await db
    .select({
      workspaceId: integrationTokens.workspaceId,
      userId: integrationTokens.userId,
    })
    .from(integrationTokens)
    .where(
      and(
        eq(integrationTokens.provider, "google_calendar"),
        eq(integrationTokens.status, "active")
      )
    )
    .limit(20);

  for (const token of tokens) {
    await syncCalendarEvents(token.workspaceId, token.userId).catch(() => {});
    await processCalendarEventLifecycle(token.workspaceId).catch(() => {});
  }
}
