/**
 * Cron handler for Gmail delta sync.
 * Should be called every 5–15 minutes by an external cron (Vercel Cron, etc.).
 * Authorization: Bearer {CRON_SECRET}
 */
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { integrationTokens } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { syncNewMessages, watchInbox } from "@/services/integrations/gmail";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Load up to 10 active Gmail tokens at a time
  const tokens = await db
    .select({
      workspaceId: integrationTokens.workspaceId,
      userId: integrationTokens.userId,
      syncCursor: integrationTokens.syncCursor,
    })
    .from(integrationTokens)
    .where(
      and(
        eq(integrationTokens.provider, "gmail"),
        eq(integrationTokens.status, "active")
      )
    )
    .limit(10);

  const results: Array<{ workspaceId: string; synced: number; error?: string }> = [];

  for (const token of tokens) {
    try {
      // Re-register watch if no cursor (could have expired)
      if (!token.syncCursor) {
        await watchInbox(token.workspaceId, token.userId);
      }
      const synced = await syncNewMessages(token.workspaceId, token.userId);
      results.push({ workspaceId: token.workspaceId, synced });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ workspaceId: token.workspaceId, synced: 0, error: message });
      console.error(`[cron/gmail-sync] Failed for workspace ${token.workspaceId}:`, err);
    }
  }

  return NextResponse.json({ processed: tokens.length, results });
}
