/**
 * Generated assets schema — stub for Phase 1 implementation.
 * Stores AI-generated draft content (contracts, briefs, proposals, etc.)
 * waiting for approval before delivery.
 */
import { pgTable, text, timestamp, jsonb, pgEnum, index } from "drizzle-orm/pg-core";
import { workspaces } from "./workspace";
import { users } from "./auth";
import { records } from "./records";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const assetTypeEnum = pgEnum("asset_type", [
  "contract",
  "sow",
  "proposal",
  "opportunity_brief",
  "meeting_prep",
  "follow_up",
  "handoff_brief",
  "battlecard",
]);

export const assetStatusEnum = pgEnum("asset_status", [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "delivered",
  "archived",
]);

// ─── Generated Assets ─────────────────────────────────────────────────────────

export const generatedAssets = pgTable(
  "generated_assets",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** The CRM record this asset belongs to (e.g., deal) */
    recordId: text("record_id").references(() => records.id, { onDelete: "set null" }),
    assetType: assetTypeEnum("asset_type").notNull(),
    status: assetStatusEnum("status").notNull().default("draft"),
    title: text("title").notNull(),
    /** Markdown or HTML content of the generated asset */
    content: text("content"),
    /** Structured data (sections, clauses, metadata) as JSON */
    structuredContent: jsonb("structured_content"),
    /** S3/storage URL for PDF or binary exports */
    fileUrl: text("file_url"),
    /** ID of the approval request this asset is waiting on */
    approvalRequestId: text("approval_request_id"),
    /** User who triggered the generation */
    generatedBy: text("generated_by").references(() => users.id, { onDelete: "set null" }),
    /** User who approved/rejected the asset */
    resolvedBy: text("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at"),
    /** AI model and generation metadata */
    generationMetadata: jsonb("generation_metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("generated_assets_workspace_id").on(table.workspaceId),
    index("generated_assets_record_id").on(table.recordId),
    index("generated_assets_status").on(table.status),
    index("generated_assets_asset_type").on(table.assetType),
  ]
);
