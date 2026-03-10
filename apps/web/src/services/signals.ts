/**
 * Phase 1 infrastructure stub — signal events write helpers.
 * Phase 2 integration code calls writeSignalEvent() to record
 * external signals (email_received, meeting_ended, call_recorded, etc.)
 * The real signal processing engine (automation triggers) will be built in Phase 1.
 */
import { db } from "@/db";
import { signalEvents, processedSignals } from "@/db/schema";

export interface SignalEventInput {
  workspaceId: string;
  recordId?: string | null;
  type: string;
  provider?: string;
  payload?: Record<string, unknown>;
  actorId?: string | null;
}

/** Write a signal event row. Fire-and-forget safe. */
export async function writeSignalEvent(input: SignalEventInput): Promise<void> {
  await db.insert(signalEvents).values({
    workspaceId: input.workspaceId,
    recordId: input.recordId ?? null,
    type: input.type,
    provider: input.provider ?? null,
    payload: input.payload ?? {},
    actorId: input.actorId ?? null,
  });
}

/**
 * Attempt to mark a signal as processed for deduplication.
 * Returns true if this is the first time we've seen this signal (should process it).
 * Returns false if it was already processed (duplicate — skip it).
 */
export async function markSignalProcessed(
  provider: string,
  signalId: string,
  workspaceId?: string
): Promise<boolean> {
  try {
    await db.insert(processedSignals).values({
      provider,
      signalId,
      workspaceId: workspaceId ?? null,
    });
    return true; // first time — process it
  } catch {
    // Unique constraint violation = already processed
    return false;
  }
}
