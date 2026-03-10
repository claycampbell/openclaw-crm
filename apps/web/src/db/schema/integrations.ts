/**
 * Integration tokens + email/calendar stubs (Phase 2 — real impl merged later)
 */
import { pgTable, text, timestamp, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { workspaces } from "./workspace";

/**
 * Stores OAuth tokens for third-party integrations (Gmail, O365, Google Calendar, etc.)
 */
export const integrationTokens = pgTable(
  "integration_tokens",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    provider: text("provider").notNull(), // "gmail" | "google_calendar" | "outlook" | etc.
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at"),
    scopes: text("scopes"),
    externalAccountId: text("external_account_id"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("integration_tokens_workspace_provider").on(table.workspaceId, table.provider),
  ]
);

/**
 * Logged email messages (synced from Gmail/O365 or sent via CRM)
 */
export const emailMessages = pgTable(
  "email_messages",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    // Record this email is linked to (deal or contact)
    recordId: text("record_id"),
    externalId: text("external_id"), // Gmail message ID, etc.
    direction: text("direction").notNull().default("outbound"), // "inbound" | "outbound"
    subject: text("subject"),
    bodyText: text("body_text"),
    fromEmail: text("from_email"),
    toEmails: jsonb("to_emails").default([]),
    sentAt: timestamp("sent_at"),
    openedAt: timestamp("opened_at"),
    repliedAt: timestamp("replied_at"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("email_messages_workspace_record").on(table.workspaceId, table.recordId),
  ]
);

/**
 * Calendar events (synced from Google Calendar, Outlook, etc.)
 */
export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    // Linked deal/contact record
    recordId: text("record_id"),
    externalId: text("external_id"),
    title: text("title"),
    description: text("description"),
    attendees: jsonb("attendees").default([]), // array of {email, name}
    startTime: timestamp("start_time"),
    endTime: timestamp("end_time"),
    status: text("status").default("confirmed"), // "confirmed" | "cancelled" | "tentative"
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("calendar_events_workspace_record").on(table.workspaceId, table.recordId),
    index("calendar_events_start_time").on(table.startTime),
  ]
);
