import {
  pgTable,
  text,
  timestamp,
  boolean,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspace";
import { records } from "./records";

export const emailProviderEnum = pgEnum("email_provider", ["gmail", "outlook"]);

export const emailMessages = pgTable(
  "email_messages",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    // Link to CRM record (People, Deals — populated by email matching logic)
    recordId: text("record_id").references(() => records.id, { onDelete: "set null" }),
    provider: emailProviderEnum("provider").notNull(),
    // Provider's own message ID — used for deduplication
    externalId: text("external_id").notNull(),
    threadId: text("thread_id"),
    fromEmail: text("from_email").notNull(),
    fromName: text("from_name"),
    toEmails: text("to_emails").array().notNull().default([]),
    ccEmails: text("cc_emails").array().default([]),
    subject: text("subject"),
    // Store snippet only (150 chars) — fetch full body on demand from provider
    snippet: text("snippet"),
    direction: text("direction").notNull(), // "inbound" | "outbound"
    receivedAt: timestamp("received_at").notNull(),
    isRead: boolean("is_read").notNull().default(false),
    labels: text("labels").array().default([]),
    // Populated by tracking for outbound CRM-sent emails
    openedAt: timestamp("opened_at"),
    clickedAt: timestamp("clicked_at"),
    // Delivery status (bounced, complained, etc.)
    deliveryStatus: text("delivery_status"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    // Deduplication: one row per (provider, externalId, workspaceId)
    uniqueIndex("email_messages_external_unique").on(
      table.workspaceId,
      table.provider,
      table.externalId
    ),
    index("email_messages_record_id").on(table.recordId),
    index("email_messages_received_at").on(table.workspaceId, table.receivedAt),
    index("email_messages_thread_id").on(table.workspaceId, table.threadId),
  ]
);
