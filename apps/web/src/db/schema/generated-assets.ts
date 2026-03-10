/**
 * Generated assets — AI-produced drafts for rep approval before any customer-facing action.
 * All AI generation lands here with status: "draft" first.
 *
 * Unified schema supporting both Phase 1 (close-flow handoff briefs) and
 * Phase 3 (opportunity briefs, proposals, battlecards, follow-ups, sequences).
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
  // Phase 3 types
  "deck",
  "followup",
  "sequence_step",
]);

export const assetStatusEnum = pgEnum("asset_status", [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "delivered",
  "archived",
  // Phase 3 status
  "sent",
]);

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type AssetType =
  | "opportunity_brief"
  | "proposal"
  | "deck"
  | "meeting_prep"
  | "followup"
  | "battlecard"
  | "sequence_step"
  | "handoff_brief"
  | "contract"
  | "sow"
  | "follow_up";

export type AssetStatus = "draft" | "approved" | "sent" | "archived" | "pending_approval" | "rejected" | "delivered";
export type ContextTier = "light" | "full";

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
    /** Human-readable title for the asset */
    title: text("title"),
    /** Markdown or plain text content (used by Phase 1 close-flow) */
    content: text("content"),
    /** Structured JSON content — shape varies by assetType (used by Phase 3 generators) */
    structuredContent: jsonb("structured_content"),
    /** Markdown rendering of structuredContent for display in inbox (Phase 3) */
    contentMd: text("content_md"),
    /** S3/storage URL for PDF or binary exports */
    fileUrl: text("file_url"),
    /** ID of the approval request this asset is waiting on */
    approvalRequestId: text("approval_request_id"),
    /** AI model used for generation (e.g., "anthropic/claude-haiku-3") */
    modelUsed: text("model_used"),
    /** Semver prompt version for quality tracking */
    promptVersion: text("prompt_version"),
    /** Generation tier used: "light" (compact context) or "full" (rich context) */
    contextTier: text("context_tier").$type<ContextTier>(),
    /** User who triggered the generation */
    generatedBy: text("generated_by").references(() => users.id, { onDelete: "set null" }),
    /** Timestamp of AI generation (alias for createdAt in Phase 3 code) */
    generatedAt: timestamp("generated_at").notNull().defaultNow(),
    /** User who approved/rejected the asset */
    resolvedBy: text("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at"),
    /** Approval tracking */
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at"),
    /** Rejection tracking */
    rejectedBy: text("rejected_by"),
    rejectedAt: timestamp("rejected_at"),
    rejectionNote: text("rejection_note"),
    /** AI model and generation metadata (Phase 1) */
    generationMetadata: jsonb("generation_metadata"),
    /** Trigger context: competitor name, meeting ID, signal that triggered this, etc. (Phase 3) */
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("generated_assets_workspace_id").on(table.workspaceId),
    index("generated_assets_record_id").on(table.recordId),
    index("generated_assets_status").on(table.status),
    index("generated_assets_asset_type").on(table.assetType),
    index("generated_assets_workspace_status").on(table.workspaceId, table.status),
    index("generated_assets_record_type").on(table.recordId, table.assetType),
  ]
);

export type GeneratedAsset = typeof generatedAssets.$inferSelect;
export type NewGeneratedAsset = typeof generatedAssets.$inferInsert;
