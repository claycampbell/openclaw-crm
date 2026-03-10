/**
 * Google Calendar integration — delta sync using syncToken, prep job scheduling,
 * meeting_ended signal emission.
 *
 * Uses the same Gmail OAuth credential (google_calendar provider token).
 * Required env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXT_PUBLIC_APP_URL
 */
import { google } from "googleapis";
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

function buildOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/v1/integrations/gmail/callback`
  );
}

// ─── Calendar sync ────────────────────────────────────────────────────────────

/**
 * Sync Google Calendar events using syncToken for incremental updates.
 * On first sync, fetches events from 30 days ago onward.
 */
export async function syncCalendarEvents(
  workspaceId: string,
  userId: string
): Promise<number> {
  const tokenData = await getValidToken(workspaceId, userId, "google_calendar");
  if (!tokenData) return 0;

  const tokenRows = await db
    .select({
      id: integrationTokens.id,
      providerMetadata: integrationTokens.providerMetadata,
    })
    .from(integrationTokens)
    .where(
      and(
        eq(integrationTokens.workspaceId, workspaceId),
        eq(integrationTokens.userId, userId),
        eq(integrationTokens.provider, "google_calendar")
      )
    )
    .limit(1);

  if (tokenRows.length === 0) return 0;
  const { id: tokenRowId, providerMetadata } = tokenRows[0];
  const meta = (providerMetadata ?? {}) as Record<string, string>;
  const calendarSyncToken = meta.calendarSyncToken ?? null;

  const client = buildOAuth2Client();
  client.setCredentials({ access_token: tokenData.accessToken });
  const calendar = google.calendar({ version: "v3", auth: client });

  let processed = 0;
  let nextSyncToken: string | null = null;
  let pageToken: string | undefined;

  const listParams: Record<string, unknown> = {
    calendarId: "primary",
    singleEvents: true,
    orderBy: "startTime",
  };

  if (calendarSyncToken) {
    listParams.syncToken = calendarSyncToken;
  } else {
    // First sync — go back 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    listParams.timeMin = thirtyDaysAgo.toISOString();
  }

  do {
    if (pageToken) listParams.pageToken = pageToken;

    const res = await calendar.events.list(listParams);
    const items = res.data.items ?? [];
    nextSyncToken = res.data.nextSyncToken ?? null;

    for (const event of items) {
      if (!event.id) continue;

      // Skip cancelled/deleted events
      if (event.status === "cancelled") continue;

      const externalId = event.id;
      const title = event.summary ?? null;
      const description = event.description ?? null;
      const location = event.location ?? null;

      const startRaw = event.start?.dateTime ?? event.start?.date;
      const endRaw = event.end?.dateTime ?? event.end?.date;
      if (!startRaw || !endRaw) continue;

      const startAt = new Date(startRaw);
      const endAt = new Date(endRaw);

      const attendeeEmails = (event.attendees ?? [])
        .map((a) => a.email ?? "")
        .filter(Boolean);

      // Extract meeting URL from description or conferenceData
      const meetingUrl =
        event.hangoutLink ??
        extractZoomUrl(event.description ?? "") ??
        null;

      // Match attendees to a CRM record
      const recordId = await matchEmailsToRecord(workspaceId, attendeeEmails);

      // Upsert calendar event
      await db
        .insert(calendarEvents)
        .values({
          workspaceId,
          recordId,
          provider: "google_calendar",
          externalId,
          title,
          description,
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
            description,
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

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  // Update sync token
  if (nextSyncToken) {
    await db
      .update(integrationTokens)
      .set({
        providerMetadata: { ...meta, calendarSyncToken: nextSyncToken },
        lastSyncAt: new Date(),
      })
      .where(eq(integrationTokens.id, tokenRowId));
  }

  return processed;
}

/**
 * Schedule prep jobs and emit ended signals for calendar events.
 * Call this from the cron job after syncing events.
 */
export async function processCalendarEventLifecycle(workspaceId: string): Promise<void> {
  const now = new Date();

  // Find upcoming events (next 35 minutes) that haven't had prep jobs enqueued
  const thirtyFiveMinutesFromNow = new Date(now.getTime() + 35 * 60 * 1000);

  const upcomingEvents = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.workspaceId, workspaceId),
        eq(calendarEvents.prepJobEnqueued, false),
        lte(calendarEvents.startAt, thirtyFiveMinutesFromNow)
      )
    )
    .limit(20);

  for (const event of upcomingEvents) {
    // Only prep future/near events
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

  // Find past events that haven't had ended signals emitted
  const pastEvents = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.workspaceId, workspaceId),
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
        provider: "google_calendar",
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
 * Register a webhook channel for Google Calendar push notifications.
 */
export async function watchCalendar(workspaceId: string, userId: string): Promise<void> {
  const tokenData = await getValidToken(workspaceId, userId, "google_calendar");
  if (!tokenData) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return;

  const client = buildOAuth2Client();
  client.setCredentials({ access_token: tokenData.accessToken });
  const calendar = google.calendar({ version: "v3", auth: client });

  const channelId = crypto.randomUUID();
  const expiration = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

  await calendar.events.watch({
    calendarId: "primary",
    requestBody: {
      id: channelId,
      type: "web_hook",
      address: `${appUrl}/api/v1/integrations/google-calendar/webhook`,
      expiration: expiration.toString(),
    },
  });
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
