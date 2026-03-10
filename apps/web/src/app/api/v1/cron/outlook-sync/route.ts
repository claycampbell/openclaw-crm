/**
 * Cron handler for Outlook delta sync + Graph subscription renewal.
 * Authorization: Bearer {CRON_SECRET}
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { integrationTokens } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { syncNewMessages, renewSubscription } from "@/services/integrations/outlook";

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
      providerMetadata: integrationTokens.providerMetadata,
    })
    .from(integrationTokens)
    .where(
      and(
        eq(integrationTokens.provider, "outlook"),
        eq(integrationTokens.status, "active")
      )
    )
    .limit(10);

  const results: Array<{ workspaceId: string; synced: number; error?: string }> = [];

  for (const token of tokens) {
    try {
      // Check if subscription needs renewal (within 12 hours of expiry)
      const meta = token.providerMetadata as Record<string, string> | null;
      if (meta?.subscriptionExpiry) {
        const expiryMs = new Date(meta.subscriptionExpiry).getTime();
        const twelveHoursMs = 12 * 60 * 60 * 1000;
        if (expiryMs - Date.now() < twelveHoursMs) {
          await renewSubscription(token.workspaceId, token.userId);
        }
      }

      const synced = await syncNewMessages(token.workspaceId, token.userId);
      results.push({ workspaceId: token.workspaceId, synced });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ workspaceId: token.workspaceId, synced: 0, error: message });
      console.error(`[cron/outlook-sync] Failed for workspace ${token.workspaceId}:`, err);
    }
  }

  return NextResponse.json({ processed: tokens.length, results });
}
