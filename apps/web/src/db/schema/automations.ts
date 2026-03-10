import { pgTable, text, timestamp, jsonb, boolean, index, pgEnum } from "drizzle-orm/pg-core";

export const automationActionEnum = pgEnum("automation_action", [
  "enqueue_ai_generate",    // Dispatch an ai_generate job
  "enqueue_email_send",     // Dispatch an email_send job
  "enqueue_email_sync",     // Trigger an email sync
  "enqueue_calendar_sync",  // Trigger a calendar sync
  "create_task",            // Create a task on the record
  "create_note",            // Post a note to the record
]);

export const automationRules = pgTable(
  "automation_rules",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id").notNull(),
    name: text("name").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    triggerType: text("trigger_type").notNull(),  // signal_type value — e.g. "stage_changed"
    // conditions: array of {field, operator, value} objects — all must match (AND)
    // Example: [{ field: "payload.to", operator: "equals", value: "Proposal" }]
    conditions: jsonb("conditions").notNull().default([]),
    actionType: automationActionEnum("action_type").notNull(),
    // action_payload: job-type-specific params merged into the dispatched job
    // Example for ai_generate: { documentType: "proposal", contextTier: "full" }
    actionPayload: jsonb("action_payload").notNull().default({}),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("automation_rules_workspace_trigger").on(table.workspaceId, table.triggerType),
    index("automation_rules_workspace_enabled").on(table.workspaceId, table.enabled),
  ]
);
