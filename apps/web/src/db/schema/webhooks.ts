import { pgTable, text, timestamp, boolean, integer, index } from "drizzle-orm/pg-core";
import { workspaces } from "./workspace";

/**
 * Outbound webhooks — deliver CRM events to external URLs.
 * Each webhook subscription listens for specific event types and POSTs
 * a JSON payload with HMAC-SHA256 signing.
 */
export const outboundWebhooks = pgTable(
  "outbound_webhooks",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    /** Comma-separated event types, e.g. "record.created,record.updated,deal.stage_changed" */
    events: text("events").notNull(),
    /** HMAC-SHA256 signing secret — included in X-Webhook-Signature header */
    secret: text("secret"),
    enabled: boolean("enabled").notNull().default(true),
    /** Number of consecutive failures */
    failureCount: integer("failure_count").notNull().default(0),
    /** Last successful delivery timestamp */
    lastSuccessAt: timestamp("last_success_at"),
    /** Last failure message */
    lastError: text("last_error"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("outbound_webhooks_workspace").on(table.workspaceId),
    index("outbound_webhooks_workspace_enabled").on(table.workspaceId, table.enabled),
  ]
);
