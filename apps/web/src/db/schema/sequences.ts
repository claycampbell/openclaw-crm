/**
 * Email sequences — multi-step outbound sequences with enrollment and reply detection.
 */
import { pgTable, text, timestamp, jsonb, integer, boolean, index } from "drizzle-orm/pg-core";
import { workspaces } from "./workspace";

export const sequences = pgTable(
  "sequences",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("active"), // "active" | "archived"
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("sequences_workspace_status").on(table.workspaceId, table.status),
  ]
);

export const sequenceSteps = pgTable(
  "sequence_steps",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    sequenceId: text("sequence_id")
      .notNull()
      .references(() => sequences.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull(),
    // 1-based step number
    stepNumber: integer("step_number").notNull(),
    // Days after enrollment (or after previous step) to send this step
    delayDays: integer("delay_days").notNull().default(0),
    // Template subject and body — may include {{contactName}}, {{companyName}} placeholders
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    // A/B testing variant
    variant: text("variant").notNull().default("a"), // "a" | "b"
    // Percent of enrollments that get variant "a" (0-100); rest get "b"
    variantWeight: integer("variant_weight").notNull().default(100),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("sequence_steps_sequence").on(table.sequenceId, table.stepNumber),
  ]
);

export const sequenceEnrollments = pgTable(
  "sequence_enrollments",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    sequenceId: text("sequence_id")
      .notNull()
      .references(() => sequences.id, { onDelete: "cascade" }),
    // Contact record being enrolled
    contactRecordId: text("contact_record_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    status: text("status").notNull().default("active"), // "active" | "completed" | "stopped" | "bounced"
    // Which step they're currently on (0-indexed — 0 means first step pending)
    currentStep: integer("current_step").notNull().default(0),
    // When to execute the next step
    nextStepAt: timestamp("next_step_at"),
    // Why stopped (if status = "stopped")
    stoppedReason: text("stopped_reason"), // "replied" | "unsubscribed" | "bounced" | "manual"
    // A/B variant assigned at enrollment
    variant: text("variant").notNull().default("a"),
    enrolledAt: timestamp("enrolled_at").notNull().defaultNow(),
    stoppedAt: timestamp("stopped_at"),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("sequence_enrollments_workspace_status").on(table.workspaceId, table.status),
    index("sequence_enrollments_next_step").on(table.status, table.nextStepAt),
    index("sequence_enrollments_contact").on(table.contactRecordId),
  ]
);

export const sequenceStepSends = pgTable(
  "sequence_step_sends",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => sequenceEnrollments.id, { onDelete: "cascade" }),
    stepId: text("step_id")
      .notNull()
      .references(() => sequenceSteps.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull(),
    status: text("status").notNull().default("draft"), // "draft" | "sent" | "failed"
    emailFrom: text("email_from"),
    emailTo: text("email_to"),
    subject: text("subject"),
    body: text("body"),
    // Engagement tracking
    opened: boolean("opened").notNull().default(false),
    clicked: boolean("clicked").notNull().default(false),
    replied: boolean("replied").notNull().default(false),
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("sequence_step_sends_enrollment").on(table.enrollmentId),
  ]
);

export type Sequence = typeof sequences.$inferSelect;
export type SequenceStep = typeof sequenceSteps.$inferSelect;
export type SequenceEnrollment = typeof sequenceEnrollments.$inferSelect;
export type SequenceStepSend = typeof sequenceStepSends.$inferSelect;
