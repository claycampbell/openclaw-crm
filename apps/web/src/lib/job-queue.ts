/**
 * Job queue helper — typed wrapper around services/job-queue.ts.
 * Preserves the (workspaceId, type, payload) signature used by
 * automation-engine.ts while delegating to the canonical implementation.
 */
import { enqueueJob as serviceEnqueueJob } from "@/services/job-queue";

export type JobType = "ai_generate" | "lead_score" | "email_send" | "meeting_prep" | "signal_evaluate";

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

export interface SignalEvaluatePayload {
  signalEventId: string;
}

export type JobPayload = AiGeneratePayload | LeadScorePayload | EmailSendPayload | SignalEvaluatePayload;

export async function enqueueJob(
  workspaceId: string,
  type: JobType,
  payload: JobPayload,
  runAt?: Date
): Promise<void> {
  await serviceEnqueueJob(type, payload as unknown as Record<string, unknown>, {
    workspaceId,
    runAt,
  });
}
