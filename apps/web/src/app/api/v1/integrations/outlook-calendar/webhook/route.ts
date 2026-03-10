/**
 * Outlook Calendar Graph notification receiver.
 * Handles validationToken challenge and change notifications.
 */
import { NextRequest, NextResponse } from "next/server";
import { syncCalendarEvents, processCalendarEventLifecycle } from "@/services/integrations/outlook-calendar";
import { markSignalProcessed } from "@/services/signals";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const validationToken = searchParams.get("validationToken");
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new NextResponse(null, { status: 400 });
}

export async function POST(req: NextRequest) {
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
    console.error("[outlook-calendar/webhook] Error:", err);
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

  const toSync = new Set<string>();

  for (const notification of body.value ?? []) {
    const clientState = notification.clientState as string | undefined;
    if (!clientState?.startsWith("calendar:")) continue;

    const notificationId = notification.id as string | undefined;
    if (notificationId) {
      const isNew = await markSignalProcessed("outlook_calendar_graph", notificationId);
      if (!isNew) continue;
    }

    // clientState format: "calendar:workspaceId:userId"
    const parts = clientState.split(":");
    const workspaceId = parts[1];
    const userId = parts[2];
    if (workspaceId && userId) {
      toSync.add(`${workspaceId}:${userId}`);
    }
  }

  for (const key of toSync) {
    const [workspaceId, userId] = key.split(":");
    await syncCalendarEvents(workspaceId, userId).catch(() => {});
    await processCalendarEventLifecycle(workspaceId).catch(() => {});
  }
}
