/**
 * Background jobs queue (stub for Phase 1 — real implementation merged later)
 * Used by Phase 3 generators to enqueue async work.
 */
import { pgTable, text, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";
import { workspaces } from "./workspace";

export const backgroundJobs = pgTable(
  "background_jobs",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // e.g. "ai_generate", "lead_score", "email_send"
    status: text("status").notNull().default("pending"), // "pending" | "running" | "completed" | "failed"
    payload: jsonb("payload").notNull().default({}),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lastError: text("last_error"),
    scheduledAt: timestamp("scheduled_at").notNull().defaultNow(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("background_jobs_status_scheduled").on(table.status, table.scheduledAt),
    index("background_jobs_workspace_type").on(table.workspaceId, table.type),
  ]
);
