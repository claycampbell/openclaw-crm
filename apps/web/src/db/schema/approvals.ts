/**
 * Approval workflow schema
 * Implements configurable approval rules and request tracking for high-stakes actions.
 */
import { pgTable, text, timestamp, jsonb, pgEnum, integer, index } from "drizzle-orm/pg-core";
import { workspaces } from "./workspace";
import { users } from "./auth";
import { records } from "./records";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
  "expired",
]);

export const approvalTriggerTypeEnum = pgEnum("approval_trigger_type", [
  "discount_threshold",
  "deal_value_threshold",
  "stage_change",
  "contract_send",
  "manual",
]);

// ─── Approval Rules ───────────────────────────────────────────────────────────

/**
 * Workspace-level approval rules. Admins configure what triggers an approval.
 * e.g. "any deal with discount > 20% routes to the manager"
 */
export const approvalRules = pgTable(
  "approval_rules",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    triggerType: approvalTriggerTypeEnum("trigger_type").notNull(),
    /** JSON config for the rule condition, e.g. { threshold: 20, unit: "percent" } */
    conditions: jsonb("conditions").notNull().default({}),
    /** User IDs that are approvers for this rule */
    approverIds: jsonb("approver_ids").notNull().default([]),
    /** Hours before the request expires — null = never */
    expiresAfterHours: integer("expires_after_hours"),
    isActive: text("is_active").notNull().default("true"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("approval_rules_workspace_id").on(table.workspaceId),
  ]
);

// ─── Approval Requests ────────────────────────────────────────────────────────

/**
 * Individual approval request instances.
 * Created when a triggering action occurs; resolved when approved/rejected.
 */
export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    ruleId: text("rule_id").references(() => approvalRules.id, { onDelete: "set null" }),
    /** The CRM record this approval is for (e.g., deal record) */
    recordId: text("record_id").references(() => records.id, { onDelete: "cascade" }),
    /** Human-readable title, e.g. "Discount approval for Acme Corp" */
    title: text("title").notNull(),
    description: text("description"),
    /** JSON blob of context data for the approver to review */
    context: jsonb("context").notNull().default({}),
    requestedBy: text("requested_by").references(() => users.id, { onDelete: "set null" }),
    /** Who approved/rejected the request */
    resolvedBy: text("resolved_by").references(() => users.id, { onDelete: "set null" }),
    status: approvalStatusEnum("status").notNull().default("pending"),
    /** Optional note from approver when resolving */
    resolverNote: text("resolver_note"),
    expiresAt: timestamp("expires_at"),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("approval_requests_workspace_id").on(table.workspaceId),
    index("approval_requests_record_id").on(table.recordId),
    index("approval_requests_status").on(table.status),
    index("approval_requests_requested_by").on(table.requestedBy),
    index("approval_requests_resolved_by").on(table.resolvedBy),
  ]
);

// ─── Approval History ─────────────────────────────────────────────────────────

/**
 * Immutable audit trail of approval state transitions.
 */
export const approvalHistory = pgTable(
  "approval_history",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    requestId: text("request_id")
      .notNull()
      .references(() => approvalRequests.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    fromStatus: approvalStatusEnum("from_status"),
    toStatus: approvalStatusEnum("to_status").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("approval_history_request_id").on(table.requestId),
  ]
);
