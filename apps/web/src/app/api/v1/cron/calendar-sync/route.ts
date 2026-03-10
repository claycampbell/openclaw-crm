/**
 * Cron handler for calendar sync (both Google Calendar and Outlook Calendar).
 * Authorization: Bearer {CRON_SECRET}
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { integrationTokens } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { syncCalendarEvents as syncGoogle, processCalendarEventLifecycle as processGoogle } from "@/services/integrations/google-calendar";
import { syncCalendarEvents as syncOutlook, processCalendarEventLifecycle as processOutlook, subscribeToCalendarNotifications } from "@/services/integrations/outlook-calendar";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tokens = await db
    .select({
      workspaceId: integrationTokens.workspaceId,
      userId: integrationTokens.userId,
      provider: integrationTokens.provider,
      providerMetadata: integrationTokens.providerMetadata,
    })
    .from(integrationTokens)
    .where(
      and(
        inArray(integrationTokens.provider, ["google_calendar", "outlook_calendar"]),
        eq(integrationTokens.status, "active")
      )
    )
    .limit(20);

  const results: Array<{ workspaceId: string; provider: string; synced: number; error?: string }> = [];

  for (const token of tokens) {
    try {
      if (token.provider === "google_calendar") {
        const synced = await syncGoogle(token.workspaceId, token.userId);
        await processGoogle(token.workspaceId);
        results.push({ workspaceId: token.workspaceId, provider: "google_calendar", synced });
      } else if (token.provider === "outlook_calendar") {
        // Check Outlook Calendar subscription renewal
        const meta = token.providerMetadata as Record<string, string> | null;
        if (meta?.calendarSubscriptionExpiry) {
          const expiryMs = new Date(meta.calendarSubscriptionExpiry).getTime();
          const twelveHoursMs = 12 * 60 * 60 * 1000;
          if (expiryMs - Date.now() < twelveHoursMs) {
            await subscribeToCalendarNotifications(token.workspaceId, token.userId);
          }
        }
        const synced = await syncOutlook(token.workspaceId, token.userId);
        await processOutlook(token.workspaceId);
        results.push({ workspaceId: token.workspaceId, provider: "outlook_calendar", synced });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        workspaceId: token.workspaceId,
        provider: token.provider,
        synced: 0,
        error: message,
      });
      console.error(`[cron/calendar-sync] Failed:`, err);
    }
  }

  return NextResponse.json({ processed: tokens.length, results });
}
