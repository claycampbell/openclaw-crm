import {
  pgTable,
  text,
  timestamp,
  boolean,
  numeric,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspace";
import { records } from "./records";

export const callRecordingStatusEnum = pgEnum("call_recording_status", [
  "pending",
  "transcribing",
  "transcribed",
  "failed",
]);

export const callRecordings = pgTable(
  "call_recordings",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    recordId: text("record_id").references(() => records.id, { onDelete: "set null" }),
    provider: text("provider").notNull().default("zoom"), // "zoom" | "twilio"
    externalMeetingId: text("external_meeting_id").notNull(),
    externalRecordingId: text("external_recording_id").notNull(),
    recordingUrl: text("recording_url"), // Zoom download URL (time-limited)
    durationSeconds: numeric("duration_seconds"),
    startedAt: timestamp("started_at"),
    endedAt: timestamp("ended_at"),
    attendeeEmails: text("attendee_emails").array().default([]),
    // Transcription — stored separately from raw recording URL
    assemblyaiTranscriptId: text("assemblyai_transcript_id"),
    transcriptRaw: text("transcript_raw"), // Full speaker-diarized transcript
    transcriptRedacted: text("transcript_redacted"), // PII-redacted version for AI
    aiSummary: text("ai_summary"), // Generated summary (action items, key topics)
    status: callRecordingStatusEnum("status").notNull().default("pending"),
    // Consent tracking — per workspace setting
    consentConfirmed: boolean("consent_confirmed").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("call_recordings_external_unique").on(
      table.workspaceId,
      table.externalRecordingId
    ),
    index("call_recordings_record_id").on(table.recordId),
    index("call_recordings_workspace_status").on(table.workspaceId, table.status),
  ]
);
