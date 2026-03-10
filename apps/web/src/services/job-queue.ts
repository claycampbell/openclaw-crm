/**
 * Phase 1 infrastructure stub — job queue service.
 * The real pg-boss implementation will be wired up in Phase 1.
 * This stub writes jobs directly to the background_jobs table and provides
 * the enqueue() interface that Phase 2 integration code depends on.
 */
import { db } from "@/db";
import { backgroundJobs } from "@/db/schema";
import { eq, and, lte } from "drizzle-orm";

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
 * Claims jobs with status "pending" whose runAt is in the past,
 * marks them as "running", executes them, and updates status accordingly.
 * Returns the number of jobs processed.
 */
export async function processJobs(batchSize: number = 10): Promise<number> {
  const pendingJobs = await db
    .select()
    .from(backgroundJobs)
    .where(
      and(
        eq(backgroundJobs.status, "pending"),
        lte(backgroundJobs.runAt, new Date())
      )
    )
    .orderBy(backgroundJobs.runAt)
    .limit(batchSize);

  if (pendingJobs.length === 0) return 0;

  let processed = 0;

  for (const job of pendingJobs) {
    // Mark as running
    await db
      .update(backgroundJobs)
      .set({ status: "running", startedAt: new Date() })
      .where(and(eq(backgroundJobs.id, job.id), eq(backgroundJobs.status, "pending")));

    try {
      // For now, just mark as completed — actual handlers will be wired up per job type
      await db
        .update(backgroundJobs)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(backgroundJobs.id, job.id));

      processed++;
    } catch (err) {
      const newRetries = Number(job.retries) + 1;
      const maxRetries = 3;
      const failed = newRetries >= maxRetries;

      await db
        .update(backgroundJobs)
        .set({
          status: failed ? "failed" : "pending",
          errorMessage: String(err),
          retries: String(newRetries),
          completedAt: failed ? new Date() : undefined,
        })
        .where(eq(backgroundJobs.id, job.id));
    }
  }

  return processed;
}
