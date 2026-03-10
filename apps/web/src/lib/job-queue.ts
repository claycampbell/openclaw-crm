/**
 * Job queue helper (stub for Phase 1 infrastructure).
 * Enqueues background jobs into the background_jobs table.
 */
import { db } from "@/db";
import { backgroundJobs } from "@/db/schema";

export type JobType = "ai_generate" | "lead_score" | "email_send" | "meeting_prep";

export interface AiGeneratePayload {
  documentType: "opportunity_brief" | "proposal" | "deck" | "meeting_prep" | "followup" | "battlecard" | "sequence_step";
  recordId: string;
  contextTier: "light" | "full";
  // Optional extras for specific doc types
  meetingId?: string;
  triggerType?: string;
  noteText?: string;
  competitorName?: string;
  enrollmentId?: string;
}

export interface LeadScorePayload {
  recordId: string;
}

export interface EmailSendPayload {
  enrollmentId: string;
  stepSendId: string;
}

export type JobPayload = AiGeneratePayload | LeadScorePayload | EmailSendPayload;

export async function enqueueJob(
  workspaceId: string,
  type: JobType,
  payload: JobPayload,
  runAt?: Date
): Promise<void> {
  await db.insert(backgroundJobs).values({
    workspaceId,
    type,
    status: "pending",
    payload: payload as unknown as Record<string, unknown>,
    runAt: runAt ?? new Date(),
  });
}
