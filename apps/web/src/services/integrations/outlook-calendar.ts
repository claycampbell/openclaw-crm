/**
 * Outlook Calendar integration — delta sync, prep jobs, meeting_ended signals.
 * Uses the shared Outlook/O365 credential (outlook_calendar provider token).
 * All Graph API calls use direct fetch — no SDK.
 */
import { db } from "@/db";
import {
  integrationTokens,
  calendarEvents,
  attributes,
  recordValues,
  records,
} from "@/db/schema";
import { eq, and, inArray, lte } from "drizzle-orm";
import { getValidToken } from "./token-manager";
import { writeSignalEvent } from "@/services/signals";
import { enqueueJob } from "@/services/job-queue";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// ─── Calendar sync ────────────────────────────────────────────────────────────

/**
 * Sync Outlook Calendar events using @odata.deltaLink for incremental updates.
 */
export async function syncCalendarEvents(
  workspaceId: string,
  userId: string
): Promise<number> {
  const tokenData = await getValidToken(workspaceId, userId, "outlook_calendar");
  if (!tokenData) return 0;

  const tokenRows = await db
    .select({
      id: integrationTokens.id,
      syncCursor: integrationTokens.syncCursor,
    })
    .from(integrationTokens)
    .where(
      and(
        eq(integrationTokens.workspaceId, workspaceId),
        eq(integrationTokens.userId, userId),
        eq(integrationTokens.provider, "outlook_calendar")
      )
    )
    .limit(1);

  if (tokenRows.length === 0) return 0;
  const { id: tokenRowId, syncCursor } = tokenRows[0];

  const headers = {
    Authorization: `Bearer ${tokenData.accessToken}`,
    "Content-Type": "application/json",
    Prefer: 'odata.maxpagesize=50, outlook.timezone="UTC"',
  };

  // Start with deltaLink if available, otherwise initial delta
  let url = syncCursor
    ? syncCursor
    : `${GRAPH_BASE}/me/calendarView/delta?startDateTime=${encodeURIComponent(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      )}&endDateTime=${encodeURIComponent(
        new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
      )}`;

  let processed = 0;
  let nextDeltaLink: string | null = null;

  while (url) {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error("[outlook-calendar] Delta fetch failed:", res.status, await res.text());
      break;
    }

    const data = await res.json() as {
      value?: Array<Record<string, unknown>>;
      "@odata.deltaLink"?: string;
      "@odata.nextLink"?: string;
    };

    nextDeltaLink = data["@odata.deltaLink"] ?? null;

    for (const event of data.value ?? []) {
      if (!event.id) continue;

      // Skip cancelled events
      if ((event as Record<string, unknown>)["@removed"]) continue;

      const externalId = event.id as string;
      const title = (event.subject as string) ?? null;
      const body = (event.bodyPreview as string) ?? null;

      const startObj = event.start as { dateTime?: string; timeZone?: string } | undefined;
      const endObj = event.end as { dateTime?: string; timeZone?: string } | undefined;
      if (!startObj?.dateTime || !endObj?.dateTime) continue;

      const startAt = new Date(startObj.dateTime);
      const endAt = new Date(endObj.dateTime);

      const attendeesRaw = (event.attendees as Array<{
        emailAddress?: { address?: string; name?: string };
        type?: string;
      }>) ?? [];

      const attendeeEmails = attendeesRaw
        .map((a) => a.emailAddress?.address ?? "")
        .filter(Boolean);

      // Extract Zoom/Teams meeting URL
      const onlineMeeting = event.onlineMeeting as Record<string, string> | null;
      const meetingUrl = onlineMeeting?.joinUrl ?? extractZoomUrl(body ?? "") ?? null;

      const location =
        (event.location as { displayName?: string } | undefined)?.displayName ?? null;

      const recordId = await matchEmailsToRecord(workspaceId, attendeeEmails);

      await db
        .insert(calendarEvents)
        .values({
          workspaceId,
          recordId,
          provider: "outlook_calendar",
          externalId,
          title,
          description: body,
          startAt,
          endAt,
          attendeeEmails,
          location,
          meetingUrl,
        })
        .onConflictDoUpdate({
          target: [
            calendarEvents.workspaceId,
            calendarEvents.provider,
            calendarEvents.externalId,
          ],
          set: {
            title,
            description: body,
            startAt,
            endAt,
            attendeeEmails,
            location,
            meetingUrl,
            recordId,
          },
        });

      processed++;
    }

    url = data["@odata.nextLink"] ?? "";
  }

  if (nextDeltaLink) {
    await db
      .update(integrationTokens)
      .set({ syncCursor: nextDeltaLink, lastSyncAt: new Date() })
      .where(eq(integrationTokens.id, tokenRowId));
  }

  return processed;
}

/**
 * Schedule prep jobs and emit ended signals for Outlook Calendar events.
 */
export async function processCalendarEventLifecycle(workspaceId: string): Promise<void> {
  const now = new Date();
  const thirtyFiveMinutesFromNow = new Date(now.getTime() + 35 * 60 * 1000);

  const upcomingEvents = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.workspaceId, workspaceId),
        eq(calendarEvents.provider, "outlook_calendar"),
        eq(calendarEvents.prepJobEnqueued, false),
        lte(calendarEvents.startAt, thirtyFiveMinutesFromNow)
      )
    )
    .limit(20);

  for (const event of upcomingEvents) {
    if (event.startAt < now) continue;

    await enqueueJob(
      "meeting_prep",
      {
        workspaceId,
        calendarEventId: event.id,
        recordId: event.recordId,
        title: event.title,
        startAt: event.startAt.toISOString(),
        attendeeEmails: event.attendeeEmails,
      },
      {
        workspaceId,
        runAt: new Date(event.startAt.getTime() - 30 * 60 * 1000),
      }
    );

    await db
      .update(calendarEvents)
      .set({ prepJobEnqueued: true })
      .where(eq(calendarEvents.id, event.id));
  }

  const pastEvents = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.workspaceId, workspaceId),
        eq(calendarEvents.provider, "outlook_calendar"),
        eq(calendarEvents.endedSignalEmitted, false),
        lte(calendarEvents.endAt, now)
      )
    )
    .limit(20);

  for (const event of pastEvents) {
    if (event.recordId) {
      await writeSignalEvent({
        workspaceId,
        recordId: event.recordId,
        type: "meeting_ended",
        provider: "outlook_calendar",
        payload: {
          calendarEventId: event.id,
          title: event.title,
          startAt: event.startAt.toISOString(),
          endAt: event.endAt.toISOString(),
          attendeeEmails: event.attendeeEmails,
        },
      }).catch(() => {});
    }

    await db
      .update(calendarEvents)
      .set({ endedSignalEmitted: true })
      .where(eq(calendarEvents.id, event.id));
  }
}

/**
 * Subscribe to Outlook Calendar change notifications via Microsoft Graph.
 * Max lifetime 2.9 days — must be renewed within 12 hours of expiry.
 */
export async function subscribeToCalendarNotifications(
  workspaceId: string,
  userId: string
): Promise<void> {
  const tokenData = await getValidToken(workspaceId, userId, "outlook_calendar");
  if (!tokenData) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return;

  const expirationDateTime = new Date(Date.now() + 4230 * 60 * 1000).toISOString();

  const res = await fetch(`${GRAPH_BASE}/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenData.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      changeType: "created,updated,deleted",
      notificationUrl: `${appUrl}/api/v1/integrations/outlook-calendar/webhook`,
      resource: "me/events",
      expirationDateTime,
      clientState: `calendar:${workspaceId}:${userId}`,
    }),
  });

  if (!res.ok) {
    console.error("[outlook-calendar] Subscription failed:", res.status, await res.text());
    return;
  }

  const data = await res.json() as { id: string; expirationDateTime: string };

  await db
    .update(integrationTokens)
    .set({
      providerMetadata: {
        calendarSubscriptionId: data.id,
        calendarSubscriptionExpiry: data.expirationDateTime,
      },
    })
    .where(
      and(
        eq(integrationTokens.workspaceId, workspaceId),
        eq(integrationTokens.userId, userId),
        eq(integrationTokens.provider, "outlook_calendar")
      )
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function matchEmailsToRecord(
  workspaceId: string,
  emails: string[]
): Promise<string | null> {
  if (emails.length === 0) return null;

  const emailAttrs = await db
    .select({ id: attributes.id })
    .from(attributes)
    .where(eq(attributes.type, "email_address"));

  if (emailAttrs.length === 0) return null;

  const attrIds = emailAttrs.map((a) => a.id);

  const matches = await db
    .select({ recordId: recordValues.recordId })
    .from(recordValues)
    .where(
      and(
        inArray(recordValues.attributeId, attrIds),
        inArray(recordValues.textValue, emails)
      )
    )
    .limit(1);

  if (matches.length === 0) return null;

  const recordRow = await db
    .select({ id: records.id })
    .from(records)
    .where(eq(records.id, matches[0].recordId))
    .limit(1);

  return recordRow.length > 0 ? recordRow[0].id : null;
}

function extractZoomUrl(text: string): string | null {
  const match = text.match(/https:\/\/[\w.]*zoom\.us\/[^\s<>"]+/);
  return match ? match[0] : null;
}
