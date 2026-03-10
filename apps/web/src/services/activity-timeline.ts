/**
 * Activity timeline service.
 * Produces a unified chronological feed for a CRM record by combining:
 *   - email_messages (Gmail/Outlook)
 *   - calendar_events
 *   - call_recordings
 *   - notes
 *   - tasks (via task_records join)
 *   - signal_events (stage changes, enrichment, etc.)
 *
 * Uses a single UNION ALL query for performance.
 * Supports cursor-based pagination (ISO timestamp of the oldest event on the current page).
 */
import { db } from "@/db";
import { sql } from "drizzle-orm";

export type TimelineEventType =
  | "email_received"
  | "email_sent"
  | "email_opened"
  | "meeting"
  | "call"
  | "note"
  | "task"
  | "signal"
  | "created";

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  description?: string | null;
  occurredAt: string; // ISO timestamp
  metadata?: Record<string, unknown>;
}

export interface TimelineResult {
  events: TimelineEvent[];
  total: number;
  nextCursor: string | null;
}

/**
 * Get paginated activity timeline for a record.
 *
 * @param workspaceId - Workspace scope (security check)
 * @param recordId - The CRM record to fetch timeline for
 * @param cursor - ISO timestamp; return events older than this (for pagination)
 * @param limit - Max events per page (default 25)
 */
export async function getActivityTimeline(
  workspaceId: string,
  recordId: string,
  cursor?: string | null,
  limit = 25
): Promise<TimelineResult> {
  const cursorTs = cursor ? `'${cursor}'::timestamptz` : "NOW()";
  const limitVal = Math.min(Math.max(1, limit), 100);

  // UNION ALL across all event sources
  // Each sub-select returns: id, type, title, description, occurred_at, metadata (jsonb)
  const query = sql`
    WITH timeline AS (
      -- Email messages (inbound = received, outbound = sent)
      SELECT
        em.id,
        CASE em.direction
          WHEN 'inbound' THEN 'email_received'
          ELSE 'email_sent'
        END AS type,
        COALESCE(em.subject, '(no subject)') AS title,
        em.snippet AS description,
        em.received_at AS occurred_at,
        jsonb_build_object(
          'externalId', em.external_id,
          'threadId', em.thread_id,
          'fromEmail', em.from_email,
          'toEmails', em.to_emails,
          'provider', em.provider,
          'openedAt', em.opened_at,
          'clickedAt', em.clicked_at
        ) AS metadata
      FROM email_messages em
      WHERE em.workspace_id = ${workspaceId}
        AND em.record_id = ${recordId}
        AND em.received_at < ${sql.raw(cursorTs)}

      UNION ALL

      -- Calendar events
      SELECT
        ce.id,
        'meeting' AS type,
        COALESCE(ce.title, 'Meeting') AS title,
        COALESCE(
          CASE WHEN cardinality(ce.attendee_emails) > 0
            THEN array_to_string(ce.attendee_emails, ', ')
            ELSE NULL
          END,
          ce.location
        ) AS description,
        ce.start_at AS occurred_at,
        jsonb_build_object(
          'externalId', ce.external_id,
          'endAt', ce.end_at,
          'attendeeEmails', ce.attendee_emails,
          'meetingUrl', ce.meeting_url,
          'provider', ce.provider
        ) AS metadata
      FROM calendar_events ce
      WHERE ce.workspace_id = ${workspaceId}
        AND ce.record_id = ${recordId}
        AND ce.start_at < ${sql.raw(cursorTs)}

      UNION ALL

      -- Call recordings
      SELECT
        cr.id,
        'call' AS type,
        CASE cr.status
          WHEN 'transcribed' THEN 'Call recorded & transcribed'
          WHEN 'transcribing' THEN 'Call transcription in progress'
          ELSE 'Call recorded'
        END AS title,
        cr.ai_summary AS description,
        COALESCE(cr.started_at, cr.created_at) AS occurred_at,
        jsonb_build_object(
          'externalMeetingId', cr.external_meeting_id,
          'durationSeconds', cr.duration_seconds,
          'status', cr.status,
          'attendeeEmails', cr.attendee_emails,
          'consentConfirmed', cr.consent_confirmed
        ) AS metadata
      FROM call_recordings cr
      WHERE cr.workspace_id = ${workspaceId}
        AND cr.record_id = ${recordId}
        AND COALESCE(cr.started_at, cr.created_at) < ${sql.raw(cursorTs)}

      UNION ALL

      -- Notes
      SELECT
        n.id,
        'note' AS type,
        COALESCE(NULLIF(n.title, ''), 'Note') AS title,
        NULL AS description,
        n.created_at AS occurred_at,
        jsonb_build_object(
          'createdBy', n.created_by
        ) AS metadata
      FROM notes n
      WHERE n.record_id = ${recordId}
        AND n.created_at < ${sql.raw(cursorTs)}

      UNION ALL

      -- Tasks (via task_records join)
      SELECT
        t.id,
        'task' AS type,
        t.content AS title,
        NULL AS description,
        t.created_at AS occurred_at,
        jsonb_build_object(
          'isCompleted', t.is_completed,
          'completedAt', t.completed_at,
          'deadline', t.deadline,
          'createdBy', t.created_by
        ) AS metadata
      FROM tasks t
      INNER JOIN task_records tr ON tr.task_id = t.id
      WHERE tr.record_id = ${recordId}
        AND t.created_at < ${sql.raw(cursorTs)}

      UNION ALL

      -- Signal events (stage changes, enrichment, etc.)
      SELECT
        se.id,
        'signal' AS type,
        se.type AS title,
        NULL AS description,
        se.created_at AS occurred_at,
        se.payload AS metadata
      FROM signal_events se
      WHERE se.workspace_id = ${workspaceId}
        AND se.record_id = ${recordId}
        AND se.created_at < ${sql.raw(cursorTs)}
    )
    SELECT
      id,
      type,
      title,
      description,
      occurred_at,
      metadata,
      COUNT(*) OVER() AS total_count
    FROM timeline
    ORDER BY occurred_at DESC
    LIMIT ${limitVal}
  `;

  const rows = await db.execute(query);

  const events: TimelineEvent[] = rows.map((row) => ({
    id: row.id as string,
    type: row.type as TimelineEventType,
    title: row.title as string,
    description: (row.description as string) ?? null,
    occurredAt: (row.occurred_at instanceof Date
      ? row.occurred_at.toISOString()
      : String(row.occurred_at)),
    metadata: (row.metadata as Record<string, unknown>) ?? undefined,
  }));

  const total = rows.length > 0 ? Number(rows[0].total_count ?? 0) : 0;

  // If we got a full page, there may be more — set cursor to oldest event's timestamp
  const nextCursor =
    events.length === limitVal && events.length > 0
      ? events[events.length - 1].occurredAt
      : null;

  return { events, total, nextCursor };
}

/**
 * Get a compact text summary of recent activity for AI context injection.
 * Returns the last 10 events as plain text.
 */
export async function getTimelineSummary(
  workspaceId: string,
  recordId: string
): Promise<string> {
  const { events } = await getActivityTimeline(workspaceId, recordId, null, 10);

  if (events.length === 0) {
    return "No recent activity.";
  }

  const lines = events.map((e) => {
    const date = new Date(e.occurredAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `- [${date}] ${formatEventTypeLabel(e.type)}: ${e.title}`;
  });

  return lines.join("\n");
}

function formatEventTypeLabel(type: TimelineEventType): string {
  const labels: Record<TimelineEventType, string> = {
    email_received: "Email received",
    email_sent: "Email sent",
    email_opened: "Email opened",
    meeting: "Meeting",
    call: "Call",
    note: "Note",
    task: "Task",
    signal: "Signal",
    created: "Created",
  };
  return labels[type] ?? type;
}
