import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { backgroundJobs } from "@/db/schema";
import { eq, and, lte } from "drizzle-orm";
import { generateOpportunityBrief } from "@/services/documents/brief";
import { generateProposal, generateDeck } from "@/services/documents/proposal";
import { generateMeetingPrepBrief, generatePostMeetingFollowup } from "@/services/documents/followup";
import { generateBattlecard } from "@/services/documents/battlecard";

const BATCH_SIZE = 5;

export async function GET(req: NextRequest) {
  // Verify CRON_SECRET — Vercel Cron best practice
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Claim a batch of pending ai_generate jobs
  const pendingJobs = await db
    .select()
    .from(backgroundJobs)
    .where(
      and(
        eq(backgroundJobs.type, "ai_generate"),
        eq(backgroundJobs.status, "pending"),
        lte(backgroundJobs.scheduledAt, new Date())
      )
    )
    .orderBy(backgroundJobs.scheduledAt)
    .limit(BATCH_SIZE);

  if (pendingJobs.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  let processed = 0;

  for (const job of pendingJobs) {
    // Optimistically mark as running
    await db
      .update(backgroundJobs)
      .set({ status: "running", startedAt: new Date(), attempts: job.attempts + 1 })
      .where(and(eq(backgroundJobs.id, job.id), eq(backgroundJobs.status, "pending")));

    const payload = job.payload as {
      documentType: string;
      recordId: string;
      contextTier?: string;
      meetingId?: string;
      triggerType?: string;
      noteText?: string;
      competitorName?: string;
    };

    try {
      switch (payload.documentType) {
        case "opportunity_brief":
          await generateOpportunityBrief(job.workspaceId, payload.recordId);
          break;
        case "proposal":
          await generateProposal(job.workspaceId, payload.recordId);
          break;
        case "deck":
          await generateDeck(job.workspaceId, payload.recordId);
          break;
        case "meeting_prep":
          if (payload.meetingId) {
            await generateMeetingPrepBrief(
              job.workspaceId,
              payload.recordId,
              payload.meetingId
            );
          }
          break;
        case "followup":
          await generatePostMeetingFollowup(job.workspaceId, payload.recordId, {
            type: (payload.triggerType as "meeting_ended" | "note_added") ?? "meeting_ended",
            noteText: payload.noteText,
          });
          break;
        case "battlecard":
          if (payload.competitorName) {
            await generateBattlecard(
              job.workspaceId,
              payload.recordId,
              payload.competitorName
            );
          }
          break;
        default:
          console.warn(`[cron/generate] Unknown documentType: ${payload.documentType}`);
      }

      await db
        .update(backgroundJobs)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(backgroundJobs.id, job.id));

      processed++;
    } catch (err) {
      console.error(`[cron/generate] Job ${job.id} failed:`, err);

      const newAttempts = job.attempts + 1;
      const failed = newAttempts >= job.maxAttempts;

      await db
        .update(backgroundJobs)
        .set({
          status: failed ? "failed" : "pending",
          lastError: String(err),
          completedAt: failed ? new Date() : undefined,
        })
        .where(eq(backgroundJobs.id, job.id));
    }
  }

  return NextResponse.json({ processed });
}
