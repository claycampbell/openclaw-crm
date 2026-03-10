/**
 * Phase 1 infrastructure stub — background job queue.
 * The real pg-boss implementation will be wired up in Phase 1.
 * This stub provides the schema and a no-op enqueue() so Phase 2
 * integration code compiles without Phase 1 being merged yet.
 */
import { pgTable, text, timestamp, jsonb, pgEnum, index } from "drizzle-orm/pg-core";
import { workspaces } from "./workspace";

export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const backgroundJobs = pgTable(
  "background_jobs",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").default({}),
    status: jobStatusEnum("status").notNull().default("pending"),
    runAt: timestamp("run_at").notNull().defaultNow(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    failedAt: timestamp("failed_at"),
    errorMessage: text("error_message"),
    retries: text("retries").notNull().default("0"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("background_jobs_status").on(table.status, table.runAt),
    index("background_jobs_type").on(table.type),
    index("background_jobs_workspace").on(table.workspaceId),
  ]
);
