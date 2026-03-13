/**
 * Phase 1 infrastructure stub — job queue service.
 * The real pg-boss implementation will be wired up in Phase 1.
 * This stub writes jobs directly to the background_jobs table and provides
 * the enqueue() interface that Phase 2 integration code depends on.
 */
import { db } from "@/db";
import { backgroundJobs } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export interface JobPayload {
  type: string;
  workspaceId?: string;
  [key: string]: unknown;
}

// ─── Job Handler Registry ─────────────────────────────────────────────────────

type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

const jobHandlers = new Map<string, JobHandler>();

/**
 * Register a handler for a specific job type.
 * Called during application startup via instrumentation.ts.
 */
export function registerJobHandler(type: string, handler: JobHandler): void {
  jobHandlers.set(type, handler);
}

/**
 * Execute a job using its registered handler.
 * Returns true if a handler was found and executed.
 */
export async function executeJob(type: string, payload: Record<string, unknown>): Promise<boolean> {
  const handler = jobHandlers.get(type);
  if (!handler) return false;
  await handler(payload);
  return true;
}

/**
 * Enqueue a background job.
 * In Phase 1 this will use pg-boss for reliable job processing.
 * For now it writes directly to background_jobs table.
 */
export async function enqueueJob(
  type: string,
  payload: Record<string, unknown>,
  options: { runAt?: Date; workspaceId?: string } = {}
): Promise<string> {
  const [job] = await db
    .insert(backgroundJobs)
    .values({
      type,
      payload,
      workspaceId: options.workspaceId ?? null,
      runAt: options.runAt ?? new Date(),
      status: "pending",
    })
    .returning({ id: backgroundJobs.id });

  return job.id;
}

/**
 * Process pending jobs up to the given batch size.
 * Atomically claims jobs using FOR UPDATE SKIP LOCKED to prevent
 * double-processing when multiple cron calls overlap.
 * Executes registered handlers and implements exponential backoff retry.
 * Returns the number of jobs processed.
 */
export async function processJobs(batchSize: number = 10): Promise<number> {
  // Atomically claim pending jobs — FOR UPDATE SKIP LOCKED prevents
  // two overlapping cron invocations from grabbing the same rows
  const claimed = await db.execute(sql`
    UPDATE background_jobs
    SET status = 'running', started_at = NOW()
    WHERE id IN (
      SELECT id FROM background_jobs
      WHERE status = 'pending' AND run_at <= NOW()
      ORDER BY run_at
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);

  const jobs = (claimed as unknown as { rows: unknown[] }).rows as Array<{
    id: string;
    type: string;
    payload: Record<string, unknown> | null;
    workspace_id: string | null;
    retries: string;
  }>;

  if (!jobs || jobs.length === 0) return 0;

  let processed = 0;

  for (const job of jobs) {
    try {
      // Build the payload for the handler, including workspaceId
      const handlerPayload: Record<string, unknown> = {
        ...(job.payload ?? {}),
        workspaceId: job.workspace_id,
      };

      const handled = await executeJob(job.type, handlerPayload);
      if (!handled) {
        console.warn(`[job-queue] No handler registered for job type: ${job.type} (id=${job.id})`);
      }

      // Mark as completed regardless of whether a handler was found
      await db
        .update(backgroundJobs)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(backgroundJobs.id, job.id));

      processed++;
    } catch (err) {
      const currentRetries = parseInt(job.retries, 10);
      const newRetries = (isNaN(currentRetries) ? 0 : currentRetries) + 1;
      const maxRetries = 3;
      const exhausted = newRetries >= maxRetries;

      if (exhausted) {
        // Dead-letter: mark as failed permanently
        await db
          .update(backgroundJobs)
          .set({
            status: "failed",
            errorMessage: err instanceof Error ? err.message : String(err),
            retries: String(newRetries),
            failedAt: new Date(),
            completedAt: new Date(),
          })
          .where(eq(backgroundJobs.id, job.id));
        console.error(`[job-queue] Job ${job.id} (${job.type}) failed permanently after ${newRetries} retries:`, err);
      } else {
        // Exponential backoff: 2^retries minutes (2min, 4min)
        const backoffMs = Math.pow(2, newRetries) * 60_000;
        const nextRunAt = new Date(Date.now() + backoffMs);

        await db
          .update(backgroundJobs)
          .set({
            status: "pending",
            errorMessage: err instanceof Error ? err.message : String(err),
            retries: String(newRetries),
            runAt: nextRunAt,
          })
          .where(eq(backgroundJobs.id, job.id));
        console.warn(`[job-queue] Job ${job.id} (${job.type}) retry ${newRetries}/3 scheduled for ${nextRunAt.toISOString()}`);
      }

      processed++;
    }
  }

  return processed;
}
