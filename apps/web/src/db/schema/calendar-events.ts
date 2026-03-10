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

export const calendarProviderEnum = pgEnum("calendar_provider", [
  "google_calendar",
  "outlook_calendar",
]);

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    recordId: text("record_id").references(() => records.id, { onDelete: "set null" }),
    provider: calendarProviderEnum("provider").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title"),
    description: text("description"),
    startAt: timestamp("start_at").notNull(),
    endAt: timestamp("end_at").notNull(),
    attendeeEmails: text("attendee_emails").array().default([]),
    location: text("location"),
    meetingUrl: text("meeting_url"), // Zoom/Meet link if present
    // Lifecycle flags to prevent duplicate signal emission
    prepJobEnqueued: boolean("prep_job_enqueued").notNull().default(false),
    endedSignalEmitted: boolean("ended_signal_emitted").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("calendar_events_external_unique").on(
      table.workspaceId,
      table.provider,
      table.externalId
    ),
    index("calendar_events_record_id").on(table.recordId),
    index("calendar_events_start_at").on(table.workspaceId, table.startAt),
  ]
);
