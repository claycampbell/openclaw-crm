/**
 * Zoom integration — webhook verification, recording.completed event processing,
 * Server-to-Server OAuth for API access.
 *
 * Required env vars:
 *   ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_ACCOUNT_ID (S2S OAuth)
 *   ZOOM_WEBHOOK_SECRET_TOKEN (for webhook signature verification)
 */
import { createHmac } from "node:crypto";
import { db } from "@/db";
import { callRecordings, integrationTokens } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { markSignalProcessed } from "@/services/signals";
import { enqueueJob } from "@/services/job-queue";

// ─── Webhook signature verification ──────────────────────────────────────────

/**
 * Verify a Zoom webhook signature.
 * Zoom signature: HMAC-SHA256("v0:{timestamp}:{rawBody}")
 * Returns true if the signature matches.
 */
export function verifyWebhookSignature(
  timestamp: string,
  rawBody: string,
  signature: string
): boolean {
  const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  if (!secret) {
    console.warn("[zoom] ZOOM_WEBHOOK_SECRET_TOKEN not set — skipping signature verification");
    return true;
  }

  const signedContent = `v0:${timestamp}:${rawBody}`;
  const expectedSig = `v0=${createHmac("sha256", secret)
    .update(signedContent, "utf-8")
    .digest("hex")}`;

  return signature === expectedSig;
}

// ─── Recording webhook handler ────────────────────────────────────────────────

export interface ZoomRecordingCompletedPayload {
  object: {
    id: string; // meeting UUID
    uuid: string;
    host_id: string;
    host_email: string;
    topic: string;
    type: number;
    start_time: string;
    duration: number;
    recording_files?: Array<{
      id: string;
      file_type: string;
      download_url: string;
      status: string;
      recording_start: string;
      recording_end: string;
    }>;
    participant_audio_files?: Array<{
      id: string;
      download_url: string;
      recording_start: string;
      recording_end: string;
    }>;
  };
}

/**
 * Handle a Zoom recording.completed webhook event.
 * Deduplicates, checks consent setting, stores recording, enqueues transcription.
 */
export async function handleRecordingWebhook(
  workspaceId: string,
  payload: ZoomRecordingCompletedPayload
): Promise<void> {
  const meeting = payload.object;
  const meetingId = meeting.uuid || meeting.id;

  // Find the best recording file (prefer MP4 or M4A)
  const recordingFiles = meeting.recording_files ?? [];
  const audioFile =
    recordingFiles.find((f) => f.file_type === "M4A" && f.status === "completed") ??
    recordingFiles.find((f) => f.file_type === "MP4" && f.status === "completed") ??
    recordingFiles.find((f) => f.status === "completed");

  if (!audioFile) {
    console.log(`[zoom] No completed recording files for meeting ${meetingId}`);
    return;
  }

  const recordingId = audioFile.id;

  // Deduplicate by recording file ID
  const isNew = await markSignalProcessed("zoom", recordingId, workspaceId);
  if (!isNew) return;

  // Check workspace consent setting
  const workspaceRow = await db
    .select({ settings: integrationTokens.providerMetadata })
    .from(integrationTokens)
    .where(
      and(
        eq(integrationTokens.workspaceId, workspaceId),
        eq(integrationTokens.provider, "zoom")
      )
    )
    .limit(1);

  const settings = (workspaceRow[0]?.settings ?? {}) as Record<string, unknown>;
  const consentRequired = settings.consentRequired as boolean | undefined;

  const startedAt = audioFile.recording_start ? new Date(audioFile.recording_start) : null;
  const endedAt = audioFile.recording_end ? new Date(audioFile.recording_end) : null;
  const durationSeconds = startedAt && endedAt
    ? Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000).toString()
    : null;

  // Insert call recording row
  await db
    .insert(callRecordings)
    .values({
      workspaceId,
      provider: "zoom",
      externalMeetingId: meetingId,
      externalRecordingId: recordingId,
      recordingUrl: audioFile.download_url,
      durationSeconds,
      startedAt,
      endedAt,
      attendeeEmails: [], // Will be populated from Zoom meeting participants API later
      status: "pending",
      consentConfirmed: !consentRequired, // If consent not required, auto-confirm
    })
    .onConflictDoNothing();

  // Only enqueue transcription if consent is confirmed (or not required)
  if (!consentRequired) {
    const recordingRows = await db
      .select({ id: callRecordings.id })
      .from(callRecordings)
      .where(
        and(
          eq(callRecordings.workspaceId, workspaceId),
          eq(callRecordings.externalRecordingId, recordingId)
        )
      )
      .limit(1);

    if (recordingRows.length > 0) {
      await enqueueJob(
        "transcribe_call",
        { callRecordingId: recordingRows[0].id },
        { workspaceId }
      );
    }
  }
}

// ─── Server-to-Server OAuth ───────────────────────────────────────────────────

let cachedZoomToken: { token: string; expiresAt: number } | null = null;

/**
 * Get a Zoom Server-to-Server OAuth access token.
 * Caches the token until 60 seconds before expiry.
 */
export async function getZoomAccessToken(): Promise<string> {
  if (cachedZoomToken && cachedZoomToken.expiresAt > Date.now() + 60_000) {
    return cachedZoomToken.token;
  }

  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  const accountId = process.env.ZOOM_ACCOUNT_ID;

  if (!clientId || !clientSecret || !accountId) {
    throw new Error("[zoom] ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, and ZOOM_ACCOUNT_ID are required");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  const data = await res.json() as Record<string, unknown>;

  if (!res.ok || !data.access_token) {
    throw new Error(`[zoom] Token fetch failed: ${JSON.stringify(data)}`);
  }

  const expiresIn = (data.expires_in as number) ?? 3600;
  cachedZoomToken = {
    token: data.access_token as string,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  return cachedZoomToken.token;
}
