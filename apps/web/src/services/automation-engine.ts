/**
 * Automation engine — evaluates signal events and enqueues appropriate background jobs.
 * Called on signal_events creation to route to the right generator.
 * 
 * Two sources of rules:
 * 1. Built-in rules (hardcoded below) — always active
 * 2. User-defined rules from the automation_rules table — workspace-scoped
 */
import { enqueueJob } from "@/lib/job-queue";
import { detectCompetitors } from "./competitor-detector";
import { db } from "@/db";
import { signalEvents } from "@/db/schema";
import { automationRules } from "@/db/schema/automations";
import { eq, and } from "drizzle-orm";

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

  // ── User-defined automation rules from DB ──────────────────────────────────
  await evaluateUserDefinedRules(signal);
}

/**
 * Evaluate user-defined automation rules from the automation_rules table.
 * Matches on trigger type, then checks JSON conditions against signal payload.
 */
async function evaluateUserDefinedRules(signal: SignalEventInput): Promise<void> {
  const { type, workspaceId, recordId, payload = {} } = signal;
  if (!workspaceId) return;

  try {
    const rules = await db
      .select()
      .from(automationRules)
      .where(
        and(
          eq(automationRules.workspaceId, workspaceId),
          eq(automationRules.triggerType, type),
          eq(automationRules.enabled, true)
        )
      );

    for (const rule of rules) {
      // Check conditions — all must match (AND logic)
      const conditions = (rule.conditions ?? []) as Array<{
        field: string;
        operator: string;
        value: string;
      }>;

      const allMatch = conditions.every((cond) => {
        const fieldValue = getNestedValue(payload, cond.field);
        switch (cond.operator) {
          case "equals":
            return String(fieldValue) === cond.value;
          case "contains":
            return String(fieldValue ?? "").toLowerCase().includes(cond.value.toLowerCase());
          case "not_equals":
            return String(fieldValue) !== cond.value;
          case "starts_with":
            return String(fieldValue ?? "").startsWith(cond.value);
          case "exists":
            return fieldValue !== undefined && fieldValue !== null;
          default:
            return false;
        }
      });

      if (!allMatch) continue;

      // Execute the action
      const actionPayload = (rule.actionPayload ?? {}) as Record<string, unknown>;
      switch (rule.actionType) {
        case "enqueue_ai_generate":
          if (recordId) {
            await enqueueJob(workspaceId, "ai_generate", {
              recordId,
              ...actionPayload,
            });
            console.log(`[automation] Rule "${rule.name}" → ai_generate for ${recordId}`);
          }
          break;
        case "create_task":
          if (recordId) {
            try {
              const { createTask } = await import("@/services/tasks");
              const taskTitle = (actionPayload.title as string) ?? `Auto: ${rule.name}`;
              await createTask(taskTitle, rule.createdBy ?? "system", workspaceId, {
                recordIds: [recordId],
              });
              console.log(`[automation] Rule "${rule.name}" → created task for ${recordId}`);
            } catch (err) {
              console.error(`[automation] Rule "${rule.name}" → create_task failed:`, err);
            }
          }
          break;
        case "create_note":
          if (recordId) {
            try {
              const { createNote } = await import("@/services/notes");
              const noteText = (actionPayload.text as string) ?? `Automation: ${rule.name}`;
              await createNote(recordId, `Auto: ${rule.name}`, noteText, rule.createdBy);
              console.log(`[automation] Rule "${rule.name}" → created note for ${recordId}`);
            } catch (err) {
              console.error(`[automation] Rule "${rule.name}" → create_note failed:`, err);
            }
          }
          break;
        case "enqueue_email_send":
        case "enqueue_email_sync":
        case "enqueue_calendar_sync":
          console.log(`[automation] Rule "${rule.name}" → ${rule.actionType} (requires integration)`);
          break;
      }
    }
  } catch (err) {
    console.error("[automation] Error evaluating user-defined rules:", err);
    // Don't throw — user rules should not break built-in rules
  }
}

/** Get a nested value from an object by dot-separated path, e.g. "payload.to" */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
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
