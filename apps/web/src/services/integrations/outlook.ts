/**
 * Outlook / O365 integration — OAuth, Microsoft Graph subscriptions, delta sync, send.
 * Uses direct fetch calls to Microsoft Graph API (no SDK required).
 *
 * Required env vars:
 *   MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, NEXT_PUBLIC_APP_URL
 */
import { db } from "@/db";
import {
  integrationTokens,
  emailMessages,
  records,
  attributes,
  recordValues,
} from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { storeToken, getValidToken, revokeToken } from "./token-manager";
import { writeSignalEvent, markSignalProcessed } from "@/services/signals";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const TENANT_ID = "common"; // multi-tenant
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/v1/integrations/outlook/callback`;

const OUTLOOK_SCOPES = [
  "https://graph.microsoft.com/Mail.ReadWrite",
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/Calendars.Read",
  "https://graph.microsoft.com/User.Read",
  "offline_access",
];

// ─── OAuth helpers ────────────────────────────────────────────────────────────

export function initiateOAuth(workspaceId: string, userId: string): string {
  const state = Buffer.from(JSON.stringify({ workspaceId, userId })).toString("base64url");
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: OUTLOOK_SCOPES.join(" "),
    state,
    response_mode: "query",
  });
  return `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?${params}`;
}

export async function handleCallback(
  code: string,
  state: string
): Promise<{ workspaceId: string; userId: string }> {
  const { workspaceId, userId } = JSON.parse(
    Buffer.from(state, "base64url").toString("utf-8")
  ) as { workspaceId: string; userId: string };

  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    }
  );

  const tokens = await res.json() as Record<string, unknown>;

  if (!res.ok || !tokens.access_token) {
    throw new Error(`[outlook] Token exchange failed: ${JSON.stringify(tokens)}`);
  }

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + (tokens.expires_in as number) * 1000)
    : null;

  await storeToken(workspaceId, userId, "outlook", {
    accessToken: tokens.access_token as string,
    refreshToken: (tokens.refresh_token as string) ?? null,
    expiresAt,
    scopes: OUTLOOK_SCOPES,
  });

  // Also store outlook_calendar token (same credential covers both)
  await storeToken(workspaceId, userId, "outlook_calendar", {
    accessToken: tokens.access_token as string,
    refreshToken: (tokens.refresh_token as string) ?? null,
    expiresAt,
    scopes: OUTLOOK_SCOPES,
  });

  // Register Graph change notification subscription
  await subscribeToNotifications(workspaceId, userId).catch((err) => {
    console.warn("[outlook] Failed to register Graph subscription:", err);
  });

  return { workspaceId, userId };
}

// ─── Graph subscriptions (push notifications) ─────────────────────────────────

/**
 * Create a Microsoft Graph change notification subscription for inbox messages.
 * Max lifetime is ~2.9 days (4230 minutes). Must be renewed within 12 hours of expiry.
 */
export async function subscribeToNotifications(
  workspaceId: string,
  userId: string
): Promise<void> {
  const tokenData = await getValidToken(workspaceId, userId, "outlook");
  if (!tokenData) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    console.warn("[outlook] NEXT_PUBLIC_APP_URL not set — skipping subscription");
    return;
  }

  const expirationDateTime = new Date(Date.now() + 4230 * 60 * 1000).toISOString();

  const res = await fetch(`${GRAPH_BASE}/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenData.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      changeType: "created",
      notificationUrl: `${appUrl}/api/v1/integrations/outlook/webhook`,
      resource: "me/mailFolders('Inbox')/messages",
      expirationDateTime,
      clientState: `${workspaceId}:${userId}`,
    }),
  });

  const data = await res.json() as Record<string, unknown>;

  if (!res.ok) {
    console.error("[outlook] Subscription creation failed:", data);
    return;
  }

  const subscriptionId = data.id as string;
  const subscriptionExpiry = data.expirationDateTime as string;

  // Store subscription ID + expiry in providerMetadata
  await db
    .update(integrationTokens)
    .set({
      providerMetadata: {
        subscriptionId,
        subscriptionExpiry,
      },
    })
    .where(
      and(
        eq(integrationTokens.workspaceId, workspaceId),
        eq(integrationTokens.userId, userId),
        eq(integrationTokens.provider, "outlook")
      )
    );
}

/**
 * Renew an existing Graph subscription.
 * Call this when subscriptionExpiry is within 12 hours.
 */
export async function renewSubscription(
  workspaceId: string,
  userId: string
): Promise<void> {
  const tokenData = await getValidToken(workspaceId, userId, "outlook");
  if (!tokenData) return;

  const tokenRows = await db
    .select({ providerMetadata: integrationTokens.providerMetadata })
    .from(integrationTokens)
    .where(
      and(
        eq(integrationTokens.workspaceId, workspaceId),
        eq(integrationTokens.userId, userId),
        eq(integrationTokens.provider, "outlook")
      )
    )
    .limit(1);

  if (tokenRows.length === 0) return;

  const meta = tokenRows[0].providerMetadata as Record<string, string> | null;
  const subscriptionId = meta?.subscriptionId;
  if (!subscriptionId) {
    // No subscription — create one
    await subscribeToNotifications(workspaceId, userId);
    return;
  }

  const newExpiry = new Date(Date.now() + 4230 * 60 * 1000).toISOString();

  const res = await fetch(`${GRAPH_BASE}/subscriptions/${subscriptionId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${tokenData.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expirationDateTime: newExpiry }),
  });

  if (!res.ok) {
    // Subscription may have expired — create a new one
    await subscribeToNotifications(workspaceId, userId);
    return;
  }

  await db
    .update(integrationTokens)
    .set({ providerMetadata: { subscriptionId, subscriptionExpiry: newExpiry } })
    .where(
      and(
        eq(integrationTokens.workspaceId, workspaceId),
        eq(integrationTokens.userId, userId),
        eq(integrationTokens.provider, "outlook")
      )
    );
}

// ─── Delta sync ───────────────────────────────────────────────────────────────

/**
 * Sync new Outlook messages using @odata.deltaLink for incremental changes.
 */
export async function syncNewMessages(
  workspaceId: string,
  userId: string
): Promise<number> {
  const tokenData = await getValidToken(workspaceId, userId, "outlook");
  if (!tokenData) return 0;

  const tokenRows = await db
    .select({
      syncCursor: integrationTokens.syncCursor,
      id: integrationTokens.id,
    })
    .from(integrationTokens)
    .where(
      and(
        eq(integrationTokens.workspaceId, workspaceId),
        eq(integrationTokens.userId, userId),
        eq(integrationTokens.provider, "outlook")
      )
    )
    .limit(1);

  if (tokenRows.length === 0) return 0;
  const { syncCursor, id: tokenRowId } = tokenRows[0];

  const headers = {
    Authorization: `Bearer ${tokenData.accessToken}`,
    "Content-Type": "application/json",
  };

  // Use deltaLink if available, otherwise start fresh delta
  let url = syncCursor
    ? syncCursor // deltaLink from previous sync
    : `${GRAPH_BASE}/me/mailFolders/Inbox/messages/delta?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,isDraft,isRead`;

  let processed = 0;
  let nextDeltaLink: string | null = null;

  while (url) {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error("[outlook] Delta fetch failed:", res.status, await res.text());
      break;
    }

    const data = await res.json() as {
      value?: Array<Record<string, unknown>>;
      "@odata.deltaLink"?: string;
      "@odata.nextLink"?: string;
    };

    nextDeltaLink = data["@odata.deltaLink"] ?? null;

    for (const msg of data.value ?? []) {
      const externalId = msg.id as string;
      if (!externalId) continue;

      const isNew = await markSignalProcessed("outlook", externalId, workspaceId);
      if (!isNew) continue;

      // Skip drafts
      if (msg.isDraft) continue;

      const fromObj = msg.from as { emailAddress?: { address?: string; name?: string } } | undefined;
      const fromEmail = fromObj?.emailAddress?.address ?? "";
      const fromName = fromObj?.emailAddress?.name ?? "";

      const toObjs = (msg.toRecipients as Array<{ emailAddress?: { address?: string } }>) ?? [];
      const ccObjs = (msg.ccRecipients as Array<{ emailAddress?: { address?: string } }>) ?? [];

      const toEmails = toObjs.map((r) => r.emailAddress?.address ?? "").filter(Boolean);
      const ccEmails = ccObjs.map((r) => r.emailAddress?.address ?? "").filter(Boolean);

      const subject = (msg.subject as string) ?? "";
      const snippet = ((msg.bodyPreview as string) ?? "").substring(0, 150);
      const receivedAt = new Date(msg.receivedDateTime as string);

      // Determine direction — no explicit sent label in Graph delta for inbox
      // Inbox messages are inbound
      const direction = "inbound";

      const allEmails = [fromEmail];
      const recordId = await matchEmailToPeopleRecord(workspaceId, allEmails);

      await db
        .insert(emailMessages)
        .values({
          workspaceId,
          recordId,
          provider: "outlook",
          externalId,
          fromEmail,
          fromName: fromName || null,
          toEmails,
          ccEmails,
          subject: subject || null,
          snippet: snippet || null,
          direction,
          receivedAt,
        })
        .onConflictDoNothing();

      if (recordId) {
        await writeSignalEvent({
          workspaceId,
          recordId,
          type: "email_received",
          provider: "outlook",
          payload: { externalId, subject, fromEmail },
        }).catch(() => {});
      }

      processed++;
    }

    url = data["@odata.nextLink"] ?? "";
  }

  // Update delta cursor
  if (nextDeltaLink) {
    await db
      .update(integrationTokens)
      .set({ syncCursor: nextDeltaLink, lastSyncAt: new Date() })
      .where(eq(integrationTokens.id, tokenRowId));
  }

  return processed;
}

// ─── Send email ───────────────────────────────────────────────────────────────

export interface SendEmailInput {
  to: string[];
  subject: string;
  body: string; // HTML body
  replyToThreadId?: string; // Outlook conversation ID
}

export async function sendEmail(
  workspaceId: string,
  userId: string,
  input: SendEmailInput
): Promise<string> {
  const tokenData = await getValidToken(workspaceId, userId, "outlook");
  if (!tokenData) {
    throw new Error("Outlook not connected or token expired");
  }

  const payload: Record<string, unknown> = {
    message: {
      subject: input.subject,
      body: { contentType: "HTML", content: input.body },
      toRecipients: input.to.map((email) => ({
        emailAddress: { address: email },
      })),
      ...(input.replyToThreadId
        ? { conversationId: input.replyToThreadId }
        : {}),
    },
    saveToSentItems: true,
  };

  const res = await fetch(`${GRAPH_BASE}/me/sendMail`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenData.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[outlook] sendMail failed ${res.status}: ${text}`);
  }

  // Graph /sendMail returns 202 with no body — no messageId available
  // Store a placeholder in email_messages
  const externalId = `sent_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  await db
    .insert(emailMessages)
    .values({
      workspaceId,
      provider: "outlook",
      externalId,
      fromEmail: "me", // Will be resolved on next sync
      toEmails: input.to,
      subject: input.subject,
      snippet: input.body.replace(/<[^>]+>/g, "").substring(0, 150),
      direction: "outbound",
      receivedAt: new Date(),
    })
    .onConflictDoNothing();

  return externalId;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function matchEmailToPeopleRecord(
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
