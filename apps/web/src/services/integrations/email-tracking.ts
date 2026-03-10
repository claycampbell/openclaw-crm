/**
 * Email open/click tracking via Resend webhooks.
 * Resend sends webhook events when tracked emails are opened or clicked.
 *
 * Required env vars:
 *   RESEND_WEBHOOK_SECRET — Svix signing secret for webhook verification
 */
import { db } from "@/db";
import { emailMessages } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { writeSignalEvent, markSignalProcessed } from "@/services/signals";

export type ResendWebhookEvent = {
  type: string;
  data: {
    email_id: string;
    from?: string;
    to?: string[];
    subject?: string;
    click?: { link?: string; timestamp?: string };
    bounce?: { message?: string };
    [key: string]: unknown;
  };
};

/**
 * Handle a Resend webhook event.
 * Returns true if the event was processed, false if it was a duplicate.
 */
export async function handleResendWebhook(event: ResendWebhookEvent): Promise<boolean> {
  const emailId = event.data.email_id;
  const eventType = event.type;

  if (!emailId) return false;

  // Deduplicate by (emailId + eventType)
  const dedupeId = `${emailId}:${eventType}`;
  const isNew = await markSignalProcessed("resend", dedupeId);
  if (!isNew) return false;

  // Find the email_messages row by external_id
  const rows = await db
    .select({
      id: emailMessages.id,
      workspaceId: emailMessages.workspaceId,
      recordId: emailMessages.recordId,
      externalId: emailMessages.externalId,
    })
    .from(emailMessages)
    .where(eq(emailMessages.externalId, emailId))
    .limit(1);

  if (rows.length === 0) return false;
  const row = rows[0];

  switch (eventType) {
    case "email.opened": {
      await db
        .update(emailMessages)
        .set({ openedAt: new Date(), isRead: true })
        .where(eq(emailMessages.id, row.id));

      if (row.recordId) {
        await writeSignalEvent({
          workspaceId: row.workspaceId,
          recordId: row.recordId,
          type: "email_opened",
          provider: "resend",
          payload: { emailId },
        }).catch(() => {});
      }
      break;
    }

    case "email.clicked": {
      const clickedAt = event.data.click?.timestamp
        ? new Date(event.data.click.timestamp)
        : new Date();
      await db
        .update(emailMessages)
        .set({ clickedAt })
        .where(eq(emailMessages.id, row.id));

      if (row.recordId) {
        await writeSignalEvent({
          workspaceId: row.workspaceId,
          recordId: row.recordId,
          type: "email_clicked",
          provider: "resend",
          payload: { emailId, link: event.data.click?.link },
        }).catch(() => {});
      }
      break;
    }

    case "email.bounced": {
      await db
        .update(emailMessages)
        .set({ deliveryStatus: "bounced" })
        .where(eq(emailMessages.id, row.id));

      if (row.recordId) {
        await writeSignalEvent({
          workspaceId: row.workspaceId,
          recordId: row.recordId,
          type: "email_bounced",
          provider: "resend",
          payload: { emailId, message: event.data.bounce?.message },
        }).catch(() => {});
      }
      break;
    }

    case "email.complained": {
      await db
        .update(emailMessages)
        .set({ deliveryStatus: "complained" })
        .where(eq(emailMessages.id, row.id));
      break;
    }

    default:
      // Ignore unknown event types
      break;
  }

  return true;
}
