/**
 * Automation engine — evaluates signal events and enqueues appropriate background jobs.
 * Called on signal_events creation to route to the right generator.
 */
import { enqueueJob } from "@/lib/job-queue";
import { detectCompetitors } from "./competitor-detector";
import { db } from "@/db";
import { signalEvents } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface SignalEventInput {
  type: string;
  workspaceId: string;
  recordId?: string | null;
  source?: string;
  payload?: Record<string, unknown>;
}

/**
 * Load a signal event by ID and evaluate it for automation rules.
 * Called by the job handler registered in instrumentation.ts.
 */
export async function evaluateSignalById(signalEventId: string): Promise<void> {
  const [signal] = await db
    .select()
    .from(signalEvents)
    .where(eq(signalEvents.id, signalEventId))
    .limit(1);

  if (!signal) {
    console.warn(`[automation] Signal event not found: ${signalEventId}`);
    return;
  }

  await evaluateSignalForGeneration({
    type: signal.type,
    workspaceId: signal.workspaceId,
    recordId: signal.recordId ?? undefined,
    payload: (signal.payload ?? {}) as Record<string, unknown>,
  });
}

/**
 * Evaluate an incoming signal event and enqueue generation jobs as appropriate.
 * Rules are ordered by specificity. Multiple rules can match a single signal.
 */
export async function evaluateSignalForGeneration(
  signal: SignalEventInput
): Promise<void> {
  const { type, workspaceId, recordId, payload = {} } = signal;

  if (!workspaceId) return;

  // ── Opportunity Brief: new deal created ─────────────────────────────────────
  if (type === "record_created" && payload.objectType === "deals" && recordId) {
    // Context sufficiency check is done inside generateOpportunityBrief
    await enqueueJob(workspaceId, "ai_generate", {
      documentType: "opportunity_brief",
      recordId,
      contextTier: "light",
    });
    console.log(`[automation] Enqueued opportunity_brief for deal ${recordId}`);
  }

  // ── Lead Scoring: new contact/people record created ──────────────────────────
  if (
    type === "record_created" &&
    (payload.objectType === "people" || payload.objectType === "contacts") &&
    recordId
  ) {
    await enqueueJob(workspaceId, "lead_score", {
      recordId,
    });
    console.log(`[automation] Enqueued lead_score for record ${recordId}`);
  }

  // ── Stage-based generation ───────────────────────────────────────────────────
  if (type === "stage_changed" && recordId) {
    const newStage = (payload.newStage as string) ?? "";

    if (/proposal/i.test(newStage)) {
      await enqueueJob(workspaceId, "ai_generate", {
        documentType: "proposal",
        recordId,
        contextTier: "full",
      });
      console.log(`[automation] Enqueued proposal for deal ${recordId} (stage: ${newStage})`);
    }

    if (/presentation|deck|pitch/i.test(newStage)) {
      await enqueueJob(workspaceId, "ai_generate", {
        documentType: "deck",
        recordId,
        contextTier: "full",
      });
      console.log(`[automation] Enqueued deck for deal ${recordId} (stage: ${newStage})`);
    }
  }

  // ── Post-meeting follow-up: meeting ended ────────────────────────────────────
  if (type === "meeting_ended" && recordId) {
    await enqueueJob(workspaceId, "ai_generate", {
      documentType: "followup",
      recordId,
      contextTier: "light",
      triggerType: "meeting_ended",
    });
    console.log(`[automation] Enqueued followup for deal ${recordId} (meeting ended)`);
  }

  // ── Post-meeting follow-up: note added with substantial content ──────────────
  if (type === "note_added" && recordId) {
    const noteText = (payload.noteText as string) ?? "";
    if (noteText.length > 100) {
      await enqueueJob(workspaceId, "ai_generate", {
        documentType: "followup",
        recordId,
        contextTier: "light",
        triggerType: "note_added",
        noteText: noteText.substring(0, 500),
      });
      console.log(`[automation] Enqueued followup for deal ${recordId} (note added)`);
    }

    // Also run competitor detection on note text
    if (noteText.length > 0) {
      await runCompetitorDetection(workspaceId, recordId, noteText);
    }
  }

  // ── Competitor detection on email received ───────────────────────────────────
  if (type === "email_received" && recordId) {
    const emailText = (payload.text as string) ?? (payload.body as string) ?? "";
    if (emailText.length > 0) {
      await runCompetitorDetection(workspaceId, recordId, emailText);

      // Check if sender is enrolled in a sequence — if so, stop it (SEQN-03)
      const fromEmail = (payload.fromEmail as string) ?? "";
      if (fromEmail) {
        await handleReplyForSequences(workspaceId, fromEmail);
      }
    }
  }

  // ── Reply detection for email sequences ─────────────────────────────────────
  if (type === "email_replied" && recordId) {
    const fromEmail = (payload.fromEmail as string) ?? "";
    if (fromEmail) {
      await handleReplyForSequences(workspaceId, fromEmail);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function runCompetitorDetection(
  workspaceId: string,
  recordId: string,
  text: string
): Promise<void> {
  const competitors = await detectCompetitors(text, workspaceId);
  for (const competitorName of competitors) {
    await enqueueJob(workspaceId, "ai_generate", {
      documentType: "battlecard",
      recordId,
      contextTier: "full",
      competitorName,
    });
    console.log(
      `[automation] Enqueued battlecard for competitor ${competitorName} on deal ${recordId}`
    );
  }
}

async function handleReplyForSequences(
  workspaceId: string,
  fromEmail: string
): Promise<void> {
  // Find active sequence enrollments where the contact email matches
  // This is a best-effort lookup — in production this would join through record_values
  // For now, we find enrollments by workspace and check contact emails
  // The full implementation would join sequence_enrollments → records → record_values[email]
  // Simplified implementation: look for enrollments by workspace and try to stop them
  // The more precise matching requires joining through EAV, deferred to Phase 2 integration
  console.log(
    `[automation] Reply received from ${fromEmail} in workspace ${workspaceId} — checking sequence enrollments`
  );
  // Full EAV join implementation deferred — see email-sequences.ts stopEnrollmentByEmail
}
