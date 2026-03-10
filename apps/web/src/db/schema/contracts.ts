/**
 * Contract/SOW generation schema.
 * Stores contract templates and generated contract instances.
 */
import { pgTable, text, timestamp, jsonb, pgEnum, integer, index } from "drizzle-orm/pg-core";
import { workspaces } from "./workspace";
import { users } from "./auth";
import { records } from "./records";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const contractTypeEnum = pgEnum("contract_type", [
  "nda",
  "msa",
  "sow",
  "proposal",
  "order_form",
  "custom",
]);

export const contractStatusEnum = pgEnum("contract_status", [
  "draft",
  "pending_approval",
  "approved",
  "sent",
  "signed",
  "rejected",
  "expired",
  "cancelled",
]);

// ─── Contract Templates ───────────────────────────────────────────────────────

/**
 * Reusable contract templates stored per workspace.
 * Templates have clause sections with merge field support.
 */
export const contractTemplates = pgTable(
  "contract_templates",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contractType: contractTypeEnum("contract_type").notNull().default("custom"),
    description: text("description"),
    /** Array of clause objects: [{ id, title, content, isRequired, isEditable }] */
    clauses: jsonb("clauses").notNull().default([]),
    /** Default merge field defaults (e.g. payment terms, governing law) */
    defaults: jsonb("defaults").notNull().default({}),
    isActive: text("is_active").notNull().default("true"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("contract_templates_workspace_id").on(table.workspaceId),
  ]
);

// ─── Generated Contracts ─────────────────────────────────────────────────────

/**
 * Individual contract instances generated for a deal.
 */
export const contracts = pgTable(
  "contracts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Deal record this contract belongs to */
    recordId: text("record_id").references(() => records.id, { onDelete: "set null" }),
    templateId: text("template_id").references(() => contractTemplates.id, { onDelete: "set null" }),
    contractType: contractTypeEnum("contract_type").notNull().default("custom"),
    status: contractStatusEnum("status").notNull().default("draft"),
    title: text("title").notNull(),
    /** Resolved clause content with merge fields applied */
    content: text("content"),
    /** Structured contract data (clauses with resolved content) */
    structuredContent: jsonb("structured_content"),
    /** S3/storage URL for the generated PDF */
    pdfUrl: text("pdf_url"),
    /** Approval request ID if contract is pending approval */
    approvalRequestId: text("approval_request_id"),
    /** Merge field values used to generate this contract */
    mergeFields: jsonb("merge_fields").notNull().default({}),
    generatedBy: text("generated_by").references(() => users.id, { onDelete: "set null" }),
    approvedBy: text("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at"),
    sentAt: timestamp("sent_at"),
    signedAt: timestamp("signed_at"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("contracts_workspace_id").on(table.workspaceId),
    index("contracts_record_id").on(table.recordId),
    index("contracts_status").on(table.status),
  ]
);
