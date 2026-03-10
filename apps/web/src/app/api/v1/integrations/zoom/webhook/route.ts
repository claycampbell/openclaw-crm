/**
 * Zoom webhook receiver.
 * Handles:
 *   - endpoint.url_validation (CRC check during webhook setup)
 *   - recording.completed (new recording ready)
 *
 * Zoom webhook format:
 *   Headers: x-zm-request-timestamp, x-zm-signature
 *   Body: { event: string, payload: {...} }
 */
import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import {
  verifyWebhookSignature,
  handleRecordingWebhook,
  ZoomRecordingCompletedPayload,
} from "@/services/integrations/zoom";
import { db } from "@/db";
import { integrationTokens } from "@/db/schema";
import { eq } from "drizzle-orm";

// Zoom sends a GET for the validation URL endpoint
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const plainToken = searchParams.get("plainToken");

  if (plainToken) {
    return handleUrlValidation(plainToken);
  }

  return NextResponse.json({ status: "ok" });
}

export async function POST(req: NextRequest) {
  const timestamp = req.headers.get("x-zm-request-timestamp") ?? "";
  const signature = req.headers.get("x-zm-signature") ?? "";
  const rawBody = await req.text();

  // Verify signature
  if (!verifyWebhookSignature(timestamp, rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: { event: string; payload?: Record<string, unknown> };
  try {
    body = JSON.parse(rawBody) as { event: string; payload?: Record<string, unknown> };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Handle URL validation event (can also come as POST)
  if (body.event === "endpoint.url_validation") {
    const plainToken = (body.payload?.plainToken as string) ?? "";
    return handleUrlValidation(plainToken);
  }

  // Handle recording.completed
  if (body.event === "recording.completed") {
    // Determine workspace from Zoom account — for now handle globally
    // In production, map Zoom account_id to workspace_id via integration_tokens
    processRecording(body.payload as unknown as ZoomRecordingCompletedPayload).catch(
      (err) => {
        console.error("[zoom/webhook] Recording processing error:", err);
      }
    );
  }

  // Return 200 immediately for all other events
  return NextResponse.json({ received: true });
}

function handleUrlValidation(plainToken: string): NextResponse {
  const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN ?? "";
  const encryptedToken = createHmac("sha256", secret)
    .update(plainToken, "utf-8")
    .digest("hex");

  return NextResponse.json({ plainToken, encryptedToken });
}

async function processRecording(payload: ZoomRecordingCompletedPayload): Promise<void> {
  // Find the workspace that has Zoom enabled
  // For S2S OAuth, the workspace is determined by the account_id in the token
  // For simplicity, find the workspace with an active Zoom integration token
  const tokens = await db
    .select({ workspaceId: integrationTokens.workspaceId })
    .from(integrationTokens)
    .where(
      eq(integrationTokens.provider, "zoom")
    )
    .limit(1);

  if (tokens.length === 0) {
    console.warn("[zoom/webhook] No Zoom integration found for recording");
    return;
  }

  await handleRecordingWebhook(tokens[0].workspaceId, payload);
}
