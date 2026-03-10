/**
 * Phase 1 infrastructure stub — job queue service.
 * The real pg-boss implementation will be wired up in Phase 1.
 * This stub writes jobs directly to the background_jobs table and provides
 * the enqueue() interface that Phase 2 integration code depends on.
 */
import { db } from "@/db";
import { backgroundJobs } from "@/db/schema";

export interface JobPayload {
  type: string;
  workspaceId?: string;
  [key: string]: unknown;
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
