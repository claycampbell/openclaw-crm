/**
 * Resend webhook receiver for email open/click tracking.
 * Resend uses Svix for webhook signing.
 * Signature is HMAC-SHA256 over: svix-id + "." + svix-timestamp + "." + rawBody
 *
 * Required env vars:
 *   RESEND_WEBHOOK_SECRET — signing secret from Resend dashboard
 */
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { handleResendWebhook, ResendWebhookEvent } from "@/services/integrations/email-tracking";

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // If no secret configured, skip signature check (dev mode)
    console.warn("[resend/webhook] RESEND_WEBHOOK_SECRET not set — skipping signature verification");
  }

  const rawBody = await req.text();

  if (secret) {
    const svixId = req.headers.get("svix-id") ?? "";
    const svixTimestamp = req.headers.get("svix-timestamp") ?? "";
    const svixSignature = req.headers.get("svix-signature") ?? "";

    // Verify timestamp is not too old (within 5 minutes)
    const timestampMs = parseInt(svixTimestamp, 10) * 1000;
    if (isNaN(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
      return NextResponse.json({ error: "Timestamp too old" }, { status: 400 });
    }

    // Build expected signature
    const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
    const secretBytes = Buffer.from(secret.replace("whsec_", ""), "base64");
    const expectedSig = `v1,${createHmac("sha256", secretBytes)
      .update(signedContent, "utf-8")
      .digest("base64")}`;

    // svix-signature may contain multiple sigs (space-separated)
    const providedSigs = svixSignature.split(" ");
    const isValid = providedSigs.some((sig) => {
      try {
        return timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
      } catch {
        return false;
      }
    });

    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(rawBody) as ResendWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Process async — return 200 immediately to prevent Resend retries
  handleResendWebhook(event).catch((err) => {
    console.error("[resend/webhook] Processing error:", err);
  });

  return NextResponse.json({ received: true });
}
