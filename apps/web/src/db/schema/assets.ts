import { pgTable, text, timestamp, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";

export const assetStatusEnum = pgEnum("asset_status", [
  "draft",
  "approved",
  "rejected",
  "sent",
  "archived",
]);

export const assetTypeEnum = pgEnum("asset_type", [
  "opportunity_brief",
  "proposal",
  "presentation_deck",
  "meeting_prep_brief",
  "post_meeting_followup",
  "competitive_battlecard",
  "contract",
  "handoff_brief",
  "email_sequence_step",
]);

export const generatedAssets = pgTable(
  "generated_assets",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id").notNull(),
    recordId: text("record_id"),                // deal/contact/company linked to this asset
    assetType: assetTypeEnum("asset_type").notNull(),
    status: assetStatusEnum("status").notNull().default("draft"),
    content: text("content").notNull(),          // Markdown or JSON string — never stored in EAV
    modelUsed: text("model_used"),               // e.g. "anthropic/claude-sonnet-4"
    promptVersion: text("prompt_version"),       // for prompt iteration tracking
    generatedAt: timestamp("generated_at").notNull().defaultNow(),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at"),
    rejectedBy: text("rejected_by"),
    rejectedAt: timestamp("rejected_at"),
    rejectionNote: text("rejection_note"),       // optional rep feedback on rejection
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("generated_assets_workspace_status").on(table.workspaceId, table.status),
    index("generated_assets_record_id").on(table.recordId),
    index("generated_assets_workspace_type").on(table.workspaceId, table.assetType),
  ]
);

// OAuth token storage for Phase 2 integrations — defined here to avoid schema migration later
export const integrationTokenStatusEnum = pgEnum("integration_token_status", [
  "active",
  "revoked",
  "error",
]);

export const integrationTokens = pgTable(
  "integration_tokens",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id").notNull(),
    userId: text("user_id").notNull(),
    provider: text("provider").notNull(),         // "gmail" | "outlook" | "google_calendar" | "zoom"
    // Tokens encrypted at the application layer using ENCRYPTION_KEY env var (AES-256-GCM)
    // Never store plaintext tokens in this table
    accessToken: text("access_token").notNull(),  // Encrypted ciphertext
    refreshToken: text("refresh_token"),           // Encrypted ciphertext (null for non-refresh providers)
    expiresAt: timestamp("expires_at"),
    scopes: text("scopes"),                        // Space-separated scope string
    status: integrationTokenStatusEnum("status").notNull().default("active"),
    lastRefreshAt: timestamp("last_refresh_at"),
    metadata: text("metadata"),                    // JSON string for provider-specific data (e.g. Gmail historyId)
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("integration_tokens_workspace_user_provider").on(
      table.workspaceId,
      table.userId,
      table.provider
    ),
    index("integration_tokens_workspace").on(table.workspaceId),
    index("integration_tokens_status").on(table.status),
  ]
);
