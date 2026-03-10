/**
 * Phase 1 infrastructure stub — generated assets table.
 * AI-generated content (call summaries, proposals, follow-up drafts)
 * surfaces here for human review before being applied.
 * The full approval inbox UI will be built in Phase 1.
 */
import { pgTable, text, timestamp, jsonb, pgEnum, index } from "drizzle-orm/pg-core";
import { workspaces } from "./workspace";
import { records } from "./records";
import { users } from "./auth";

export const generatedAssetStatusEnum = pgEnum("generated_asset_status", [
  "draft",      // awaiting human review
  "approved",   // human approved — ready to use
  "rejected",   // human rejected
  "applied",    // has been used/sent
]);

export const generatedAssets = pgTable(
  "generated_assets",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    // The CRM record this asset is for (a deal, contact, etc.)
    recordId: text("record_id").references(() => records.id, { onDelete: "set null" }),
    // Type of asset — "call_summary", "email_draft", "proposal", "meeting_prep", etc.
    assetType: text("asset_type").notNull(),
    // The generated content (markdown or plain text)
    content: text("content").notNull(),
    // Extra context for how this was generated (model used, trigger, etc.)
    metadata: jsonb("metadata").default({}),
    status: generatedAssetStatusEnum("status").notNull().default("draft"),
    generatedBy: text("generated_by"), // model name / "system"
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("generated_assets_workspace_status").on(table.workspaceId, table.status),
    index("generated_assets_record_id").on(table.recordId),
    index("generated_assets_type").on(table.workspaceId, table.assetType),
  ]
);
