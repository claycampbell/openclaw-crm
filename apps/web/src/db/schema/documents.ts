/**
 * Generated assets — AI-produced drafts for rep approval before any customer-facing action.
 * All AI generation lands here with status: "draft" first.
 */
import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { workspaces } from "./workspace";

export type AssetType =
  | "opportunity_brief"
  | "proposal"
  | "deck"
  | "meeting_prep"
  | "followup"
  | "battlecard"
  | "sequence_step";

export type AssetStatus = "draft" | "approved" | "sent" | "archived";
export type ContextTier = "light" | "full";

export const generatedAssets = pgTable(
  "generated_assets",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    // The deal/contact the asset is about
    recordId: text("record_id").notNull(),
    // Type of asset
    assetType: text("asset_type").notNull().$type<AssetType>(),
    // Lifecycle: draft → approved | archived; approved → sent
    status: text("status").notNull().default("draft").$type<AssetStatus>(),
    // Structured JSON content — shape varies by assetType
    content: jsonb("content").notNull().default({}),
    // Markdown rendering of content for display in inbox
    contentMd: text("content_md"),
    // Model that produced this asset (e.g. "anthropic/claude-haiku-3")
    modelUsed: text("model_used"),
    // Semver prompt version for quality tracking
    promptVersion: text("prompt_version"),
    // Generation tier used
    contextTier: text("context_tier").notNull().$type<ContextTier>(),
    generatedAt: timestamp("generated_at").notNull().defaultNow(),
    // Approval tracking
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at"),
    // Rejection tracking
    rejectedBy: text("rejected_by"),
    rejectedAt: timestamp("rejected_at"),
    // Trigger context: competitor name, meeting ID, signal that triggered this, etc.
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("generated_assets_workspace_status").on(table.workspaceId, table.status),
    index("generated_assets_record_type").on(table.recordId, table.assetType),
  ]
);

export type GeneratedAsset = typeof generatedAssets.$inferSelect;
export type NewGeneratedAsset = typeof generatedAssets.$inferInsert;
