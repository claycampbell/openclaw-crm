/**
 * Signal events table (stub for Phase 2 — real implementation merged later)
 * Captures external and internal engagement signals.
 */
import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { workspaces } from "./workspace";

export const signalEvents = pgTable(
  "signal_events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    // The record this signal pertains to (deal, contact, etc.)
    recordId: text("record_id"),
    // Signal type: record_created, stage_changed, note_added, meeting_ended,
    //              email_opened, email_received, meeting_attended, email_replied
    type: text("type").notNull(),
    // Source: crm, web_form, email_integration, calendar_integration, etc.
    source: text("source").notNull().default("crm"),
    // Flexible payload: stage names, email subjects, note text snippets, etc.
    payload: jsonb("payload").notNull().default({}),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("signal_events_workspace_type").on(table.workspaceId, table.type),
    index("signal_events_record_id").on(table.recordId),
    index("signal_events_occurred_at").on(table.occurredAt),
  ]
);

export type SignalEvent = typeof signalEvents.$inferSelect;
export type NewSignalEvent = typeof signalEvents.$inferInsert;
