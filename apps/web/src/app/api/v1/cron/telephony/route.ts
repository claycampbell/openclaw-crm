/**
 * Cron handler for telephony — processes pending call recordings.
 * Picks up pending recordings with consent confirmed and enqueues transcription.
 * Authorization: Bearer {CRON_SECRET}
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { callRecordings, integrationTokens } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { transcribeCall } from "@/services/integrations/assemblyai";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ASSEMBLYAI_API_KEY) {
    return NextResponse.json({ error: "ASSEMBLYAI_API_KEY not configured" }, { status: 503 });
  }

  // Find pending recordings with consent confirmed
  const pending = await db
    .select()
    .from(callRecordings)
    .where(
      and(
        eq(callRecordings.status, "pending"),
        eq(callRecordings.consentConfirmed, true)
      )
    )
    .limit(5);

  const results: Array<{ id: string; status: string; error?: string }> = [];

  for (const recording of pending) {
    try {
      await transcribeCall(recording.id);
      results.push({ id: recording.id, status: "transcribed" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ id: recording.id, status: "failed", error: message });
      console.error(`[cron/telephony] Transcription failed for ${recording.id}:`, err);
    }
  }

  return NextResponse.json({ processed: pending.length, results });
}
