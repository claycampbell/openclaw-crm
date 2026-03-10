/**
 * Phase 1 infrastructure stub — signal events bus + deduplication table.
 * The real event processing engine will be wired in Phase 1.
 * Phase 2 integration code writes signal_events rows and checks processed_signals.
 */
import { pgTable, text, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { workspaces } from "./workspace";
import { records } from "./records";
import { users } from "./auth";

/** Immutable log of every external signal received by the system */
export const signalEvents = pgTable(
  "signal_events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    // The CRM record this signal is attached to (nullable — may be unknown at ingestion time)
    recordId: text("record_id").references(() => records.id, { onDelete: "set null" }),
    // Signal type — e.g. "email_received", "email_opened", "meeting_ended", "call_recorded", "stage_changed"
    type: text("type").notNull(),
    // Source provider — e.g. "gmail", "outlook", "zoom", "resend", "linkedin"
    provider: text("provider"),
    // Arbitrary structured payload (message id, attendee list, etc.)
    payload: jsonb("payload").default({}),
    // Who triggered this signal (for user-initiated events)
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("signal_events_workspace_type").on(table.workspaceId, table.type),
    index("signal_events_record_id").on(table.recordId),
    index("signal_events_created_at").on(table.workspaceId, table.createdAt),
  ]
);

/**
 * Deduplication table — prevents the same external event from being processed twice.
 * Use INSERT ... ON CONFLICT DO NOTHING before processing any webhook payload.
 */
export const processedSignals = pgTable(
  "processed_signals",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    // The external provider (gmail, outlook, zoom, resend, etc.)
    provider: text("provider").notNull(),
    // Provider's own unique identifier for this event (message ID, history ID, etc.)
    signalId: text("signal_id").notNull(),
    processedAt: timestamp("processed_at").notNull().defaultNow(),
  },
  (table) => [
    // The unique constraint that makes deduplication work
    uniqueIndex("processed_signals_unique").on(table.provider, table.signalId),
    index("processed_signals_workspace").on(table.workspaceId),
  ]
);
