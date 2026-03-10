import { pgTable, text, timestamp, pgEnum, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { workspaces } from "./workspace";
import { users } from "./auth";

export const integrationProviderEnum = pgEnum("integration_provider", [
  "gmail",
  "outlook",
  "google_calendar",
  "outlook_calendar",
  "zoom",
  "linkedin",
]);

export const integrationStatusEnum = pgEnum("integration_status", [
  "active",
  "revoked",
  "error",
  "expired",
]);

export const integrationTokens = pgTable(
  "integration_tokens",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: integrationProviderEnum("provider").notNull(),
    // Encrypted with AES-256-GCM using ENCRYPTION_KEY env var
    // Format: {iv_hex}:{authTag_hex}:{ciphertext_hex}
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    expiresAt: timestamp("expires_at"),
    scopes: text("scopes").array(),
    status: integrationStatusEnum("status").notNull().default("active"),
    // Provider-specific sync cursor (e.g., Gmail historyId, O365 deltaToken)
    syncCursor: text("sync_cursor"),
    // Provider-specific metadata (subscriptionId, channelId, etc.)
    providerMetadata: jsonb("provider_metadata").default({}),
    connectedAt: timestamp("connected_at").notNull().defaultNow(),
    lastRefreshedAt: timestamp("last_refreshed_at"),
    lastSyncAt: timestamp("last_sync_at"),
    errorMessage: text("error_message"),
  },
  (table) => [
    // One active connection per user per provider per workspace
    uniqueIndex("integration_tokens_unique").on(
      table.workspaceId,
      table.userId,
      table.provider
    ),
  ]
);
