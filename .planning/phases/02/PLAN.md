# Phase 2: Signal Integrations — Execution Plan

**Phase:** 02-signal-integrations
**Depends on:** Phase 1 (Async Infrastructure — pg-boss queue, signal_events bus, integration_tokens table, approval inbox)
**Requirements:** EMAL-01, EMAL-02, EMAL-03, EMAL-04, EMAL-05, EMAL-06, CALR-01, CALR-02, CALR-03, CALR-04, CALR-05, LNKD-01, LNKD-02, LNKD-03, LNKD-04, TELE-01, TELE-02, TELE-03, TELE-04, TELE-05, TELE-06, TMLN-01, TMLN-02, TMLN-03

---

## Goal-Backward Verification

**Phase goal:** Reps can connect their email, calendar, and LinkedIn to the CRM, and every relevant external event (emails sent/received, meetings logged, contacts enriched, calls recorded) flows automatically into the system without manual data entry.

**Observable truths — what must be TRUE when this phase is done:**
1. Rep can connect Gmail or O365 via OAuth and emails to/from deal contacts appear automatically on the deal record
2. Rep can send an email to a contact directly from within the CRM via their connected account
3. Email open and click events on CRM-sent outbound emails are tracked and appear in the timeline
4. When a calendar meeting with a deal contact ends, it is automatically logged to the deal's activity timeline without any rep action
5. A newly created contact is automatically enriched with LinkedIn profile data (title, company, location) when an email address is provided
6. When a Zoom call recording is available, the system fetches it, transcribes with speaker diarization, applies PII redaction, and logs the call to the deal timeline
7. Rep can view a unified chronological timeline on any record showing all touchpoints (emails, calls, meetings, notes, tasks, stage changes) in one place

---

## Wave Structure

```
Wave 1 (parallel):
  02-01: OAuth token infrastructure + integration settings UI
  02-07: LinkedIn enrichment via Proxycurl (independent of email/calendar)

Wave 2 (depends on 02-01):
  02-02: Gmail integration (OAuth, push notifications, sync, send)
  02-03: O365/Outlook integration (OAuth, Graph sync, send)

Wave 3 (depends on 02-02, 02-03):
  02-04: Email open/click tracking (Resend webhooks, outbound tracking)
  02-05: Google Calendar integration (shared Gmail credential, delta sync)
  02-06: Outlook Calendar integration (shared O365 credential, Graph delta)

Wave 4 (depends on 02-02 through 02-06):
  02-08: Zoom + AssemblyAI telephony (webhook, transcription, PII, timeline)

Wave 5 (depends on all above):
  02-09: Activity timeline (unified UNION ALL query, UI component)
```

---

## Dependency Notes

- **Phase 1 MUST be complete first.** Plans 02-01 through 02-09 depend on the following Phase 1 deliverables:
  - `integration_tokens` table with encrypted storage + `expires_at` + proactive refresh
  - `processed_signals` deduplication table with unique `(provider, signal_id)` constraint
  - `signal_events` table and write helpers in `services/signals.ts`
  - pg-boss job queue (`services/job-queue.ts`) for background sync/transcription jobs
  - `generated_assets` table and approval inbox (for telephony AI summaries)

- If Phase 1 deliverables are incomplete, address the specific gaps before starting this phase.

---

## Critical Pre-Build Decisions

Before writing any code in this phase:

1. **Token encryption key:** `ENCRYPTION_KEY` env var must be set (AES-256-GCM, 32 hex bytes). Generate: `openssl rand -hex 32`. If Phase 1 established this, verify it exists.

2. **Google OAuth scopes:** The existing Google OAuth in `auth.ts` is for login only. The Gmail + Calendar integration requires additional scopes: `https://www.googleapis.com/auth/gmail.readonly`, `https://www.googleapis.com/auth/gmail.send`, `https://www.googleapis.com/auth/calendar.readonly`. These are separate OAuth grants stored in `integration_tokens`, NOT the Better Auth session.

3. **Package versions:** Before installing any package, run `npm info <pkg> version` from `apps/web/` to confirm current version. Training-data versions (googleapis ^144, @microsoft/microsoft-graph-client ^3, assemblyai ^4) need npm verification.

4. **Vercel vs. VPS deployment:** If deploying to Vercel, pg-boss workers cannot be persistent processes. Confirm deployment target before writing cron handlers. If VPS/Docker, use `apps/web/src/instrumentation.ts` to start pg-boss in-process.

---

## Plan 02-01: OAuth Token Infrastructure + Integration Settings UI

```yaml
phase: 02-signal-integrations
plan: 02-01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/db/schema/integrations.ts
  - apps/web/src/db/schema/index.ts
  - apps/web/src/services/integrations/token-manager.ts
  - apps/web/src/app/(dashboard)/settings/integrations/page.tsx
  - apps/web/src/app/api/v1/integrations/status/route.ts
autonomous: true
requirements: [EMAL-01, EMAL-02]

must_haves:
  truths:
    - "OAuth tokens for any provider can be stored encrypted in integration_tokens with expires_at tracking"
    - "Token refresh runs proactively 5 minutes before expiry without user action"
    - "invalid_grant detection sets token status to revoked and creates an in-app notification"
    - "Settings > Integrations page shows connection status for Gmail, O365, LinkedIn, Zoom with connect/disconnect buttons"
  artifacts:
    - path: "apps/web/src/db/schema/integrations.ts"
      provides: "integration_tokens table schema"
      contains: "provider, workspace_id, user_id, access_token, refresh_token, expires_at, status, scopes"
    - path: "apps/web/src/services/integrations/token-manager.ts"
      provides: "getValidToken(), storeToken(), revokeToken(), refreshTokenIfNeeded()"
      exports: ["getValidToken", "storeToken", "revokeToken", "refreshTokenIfNeeded"]
    - path: "apps/web/src/app/(dashboard)/settings/integrations/page.tsx"
      provides: "Integration connection hub UI"
  key_links:
    - from: "token-manager.ts getValidToken()"
      to: "integration_tokens table"
      via: "proactive refresh check on expires_at"
      pattern: "expires_at.*<.*addMinutes.*5"
```

### Task 1: integration_tokens schema + token manager service

**Files:**
- `apps/web/src/db/schema/integrations.ts` (NEW)
- `apps/web/src/db/schema/index.ts` (MODIFY — add export)
- `apps/web/src/services/integrations/token-manager.ts` (NEW)

**Action:**

Create `apps/web/src/db/schema/integrations.ts`:

```typescript
import { pgTable, text, timestamp, pgEnum, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { workspaces } from "./workspace";
import { users } from "./auth";

export const integrationProviderEnum = pgEnum("integration_provider", [
  "gmail", "outlook", "google_calendar", "outlook_calendar", "zoom", "linkedin"
]);

export const integrationStatusEnum = pgEnum("integration_status", [
  "active", "revoked", "error", "expired"
]);

export const integrationTokens = pgTable(
  "integration_tokens",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: integrationProviderEnum("provider").notNull(),
    // Encrypted with AES-256-GCM using ENCRYPTION_KEY env var
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    expiresAt: timestamp("expires_at"),
    scopes: text("scopes").array(),
    status: integrationStatusEnum("status").notNull().default("active"),
    // Provider-specific metadata (e.g., Gmail historyId cursor, O365 deltaToken)
    syncCursor: text("sync_cursor"),
    providerMetadata: jsonb("provider_metadata").default({}),
    connectedAt: timestamp("connected_at").notNull().defaultNow(),
    lastRefreshedAt: timestamp("last_refreshed_at"),
    lastSyncAt: timestamp("last_sync_at"),
    errorMessage: text("error_message"),
  },
  (table) => [
    // One active connection per user per provider per workspace
    uniqueIndex("integration_tokens_unique").on(table.workspaceId, table.userId, table.provider),
  ]
);
```

Add to `apps/web/src/db/schema/index.ts`: export all from `./integrations`.

Run `pnpm db:push` to apply schema.

Create `apps/web/src/services/integrations/token-manager.ts`:

- `encryptToken(plaintext: string): string` — AES-256-GCM encrypt using `process.env.ENCRYPTION_KEY`. Output format: `{iv}:{authTag}:{ciphertext}` (hex-encoded, colon-delimited). Throw if `ENCRYPTION_KEY` is not set.
- `decryptToken(encrypted: string): string` — Reverse of above.
- `storeToken(workspaceId, userId, provider, {accessToken, refreshToken, expiresAt, scopes, providerMetadata?}): Promise<void>` — Upsert into `integration_tokens` using `ON CONFLICT (workspace_id, user_id, provider) DO UPDATE`. Encrypt both tokens before storing. Set `status = "active"`.
- `getValidToken(workspaceId, userId, provider): Promise<{accessToken: string, refreshToken?: string} | null>` — Load row; if `status !== "active"` return null; if `expiresAt` is within 5 minutes of now, call `refreshTokenIfNeeded()` first, then return fresh token. If refresh fails with `invalid_grant`, set `status = "revoked"`, create notification, return null.
- `refreshTokenIfNeeded(tokenRow): Promise<string>` — Calls provider-specific refresh URL (Google: `https://oauth2.googleapis.com/token`, Microsoft: `https://login.microsoftonline.com/common/oauth2/v2.0/token`). Updates `access_token_encrypted`, `expires_at`, `last_refreshed_at`. Returns new access token plaintext. Throws on `invalid_grant`.
- `revokeToken(workspaceId, userId, provider): Promise<void>` — Set `status = "revoked"`, call provider revocation endpoint.
- `getConnectionStatus(workspaceId, userId): Promise<Record<provider, "active"|"revoked"|"error"|null>>` — Returns connection state for all providers for a user.

**Note:** Use `node:crypto` — no additional crypto library needed. Do not use `BETTER_AUTH_SECRET` as the encryption key; require a separate `ENCRYPTION_KEY` env var. Add a startup check that throws descriptively if `ENCRYPTION_KEY` is missing.

**Verify:** `pnpm db:push` succeeds. Integration_tokens table exists in DB with correct columns. Import `token-manager.ts` in a test file, call `encryptToken("test")`, confirm roundtrip decryption works.

**Done:** `integration_tokens` table exists with all columns including `status` and `sync_cursor`. Token manager service exports all five functions. Encryption roundtrip verified.

---

### Task 2: Integration settings UI (connect/disconnect hub)

**Files:**
- `apps/web/src/app/(dashboard)/settings/integrations/page.tsx` (NEW)
- `apps/web/src/app/api/v1/integrations/status/route.ts` (NEW)

**Action:**

Create `GET /api/v1/integrations/status` route:
1. `getAuthContext(req)` — unauthorized if null
2. Call `getConnectionStatus(workspaceId, userId)` from token-manager
3. Return `success({ gmail, outlook, google_calendar, outlook_calendar, zoom, linkedin })` — each value is `"active" | "revoked" | "error" | null`

Create `apps/web/src/app/(dashboard)/settings/integrations/page.tsx` as a server component:
- Fetch integration status on server using `getConnectionStatus`
- Render a grid of integration cards, one per provider: Gmail, Outlook/O365, Google Calendar (note: shared with Gmail credential), Outlook Calendar (shared with O365), LinkedIn, Zoom
- Each card shows: provider logo/icon (use lucide-react icons as placeholders), connection status badge (Connected/Disconnected/Error), Connect button (links to OAuth connect route) or Disconnect button (calls disconnect API)
- "Connected" cards show `connectedAt` timestamp
- "Error" and "Revoked" cards show a "Reconnect" button and the `errorMessage` if present
- Google Calendar card explains it shares the Gmail OAuth credential — connecting Gmail also grants calendar access

Add a link to this page from the existing settings navigation. Check `apps/web/src/app/(dashboard)/settings/` for the nav pattern and match it.

**Verify:** Navigate to `/settings/integrations`. All 6 provider cards render. Status endpoint returns `null` for all (since none are connected yet). No TypeScript errors.

**Done:** Settings > Integrations page renders all six provider cards with correct status. Connect buttons are present (links will 404 until OAuth routes are built in 02-02/02-03 — that is expected at this stage).

---

## Plan 02-02: Gmail Integration

```yaml
phase: 02-signal-integrations
plan: 02-02
type: execute
wave: 2
depends_on: [02-01]
files_modified:
  - apps/web/src/db/schema/email-messages.ts
  - apps/web/src/db/schema/index.ts
  - apps/web/src/services/integrations/gmail.ts
  - apps/web/src/app/api/v1/integrations/gmail/connect/route.ts
  - apps/web/src/app/api/v1/integrations/gmail/callback/route.ts
  - apps/web/src/app/api/v1/integrations/gmail/disconnect/route.ts
  - apps/web/src/app/api/v1/integrations/gmail/webhook/route.ts
  - apps/web/src/app/api/v1/integrations/gmail/send/route.ts
  - apps/web/src/app/api/v1/cron/gmail-sync/route.ts
autonomous: true
requirements: [EMAL-01, EMAL-03, EMAL-05, EMAL-06]

must_haves:
  truths:
    - "Rep can click Connect Gmail in Settings and complete OAuth flow, returning to settings showing Gmail as connected"
    - "New emails to/from contacts with a matching email attribute are automatically found and stored in email_messages"
    - "Email thread history is accessible on a contact or deal record page"
    - "Rep can send an email from within a record page and it is sent via their connected Gmail account"
  artifacts:
    - path: "apps/web/src/db/schema/email-messages.ts"
      provides: "email_messages table — stores metadata + snippet, not full bodies"
      contains: "external_id, thread_id, from_email, to_emails, subject, snippet, provider"
    - path: "apps/web/src/services/integrations/gmail.ts"
      provides: "Gmail OAuth + sync + send adapter"
      exports: ["initiateOAuth", "handleCallback", "syncNewMessages", "sendEmail", "watchInbox"]
    - path: "apps/web/src/app/api/v1/integrations/gmail/webhook/route.ts"
      provides: "Gmail push notification receiver"
  key_links:
    - from: "gmail webhook handler"
      to: "processed_signals table"
      via: "deduplication check before processing"
      pattern: "ON CONFLICT.*processed_signals"
    - from: "syncNewMessages()"
      to: "email_messages table"
      via: "INSERT with external_id dedup"
    - from: "email_messages"
      to: "signal_events"
      via: "email_received signal written per new message"
```

### Task 1: email_messages schema + Gmail adapter service

**Files:**
- `apps/web/src/db/schema/email-messages.ts` (NEW)
- `apps/web/src/db/schema/index.ts` (MODIFY)
- `apps/web/src/services/integrations/gmail.ts` (NEW)

**Action:**

**Install:** From `apps/web/`: `pnpm add googleapis`. Verify version first: `npm info googleapis version`.

Create `apps/web/src/db/schema/email-messages.ts`:

```typescript
export const emailProviderEnum = pgEnum("email_provider", ["gmail", "outlook"]);

export const emailMessages = pgTable(
  "email_messages",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    // Link to CRM record (People, Deals — populated by email matching logic)
    recordId: text("record_id").references(() => records.id, { onDelete: "set null" }),
    provider: emailProviderEnum("provider").notNull(),
    // Provider's own message ID — used for deduplication
    externalId: text("external_id").notNull(),
    threadId: text("thread_id"),
    fromEmail: text("from_email").notNull(),
    fromName: text("from_name"),
    toEmails: text("to_emails").array().notNull().default([]),
    ccEmails: text("cc_emails").array().default([]),
    subject: text("subject"),
    // Store snippet only (150 chars) — fetch full body on demand from provider
    snippet: text("snippet"),
    direction: text("direction").notNull(), // "inbound" | "outbound"
    receivedAt: timestamp("received_at").notNull(),
    isRead: boolean("is_read").notNull().default(false),
    labels: text("labels").array().default([]),
    // Populated by tracking for outbound CRM-sent emails
    openedAt: timestamp("opened_at"),
    clickedAt: timestamp("clicked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    // Deduplication: one row per (provider, externalId, workspaceId)
    uniqueIndex("email_messages_external_unique").on(table.workspaceId, table.provider, table.externalId),
    index("email_messages_record_id").on(table.recordId),
    index("email_messages_received_at").on(table.workspaceId, table.receivedAt),
    index("email_messages_thread_id").on(table.workspaceId, table.threadId),
  ]
);
```

Export from `schema/index.ts`. Run `pnpm db:push`.

Create `apps/web/src/services/integrations/gmail.ts`:

**OAuth functions:**
- `initiateOAuth(workspaceId: string, userId: string): string` — Build Google OAuth URL with scopes: `openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.readonly`. Include `state` param containing `{workspaceId, userId}` (base64 JSON). Set `access_type: "offline"`, `prompt: "consent"` to force refresh token issuance. Return the URL.
- `handleCallback(code: string, state: string): Promise<void>` — Exchange `code` for tokens via `googleapis` OAuth2 client. Parse `state` to get `workspaceId, userId`. Call `storeToken()` from token-manager with `provider: "gmail"`.

**Watch/push notification:**
- `watchInbox(workspaceId: string, userId: string): Promise<void>` — Call `gmail.users.watch()` with a Google Cloud Pub/Sub topic. Topic name comes from env var `GOOGLE_PUBSUB_TOPIC`. Store `historyId` returned by watch in `integration_tokens.sync_cursor`. Gmail watch expires in 7 days — schedule renewal via pg-boss `calendar_sync` job with `run_at = now() + 6 days`.

**Sync function:**
- `syncNewMessages(workspaceId: string, userId: string, tokenRow: IntegrationToken): Promise<number>` — Load `sync_cursor` (historyId). Call `gmail.users.history.list()` with the historyId to get only changed messages (delta sync, NOT full inbox scan). For each new message ID: fetch message metadata (headers only, no body) via `gmail.users.messages.get()` with `format: "metadata"`. Extract: `from`, `to`, `subject`, `snippet`, `date`, Gmail labels. Match sender/recipient emails to People records by querying `record_values` where `text_value` IN [email addresses] and attribute type is `email`. INSERT into `email_messages` with `ON CONFLICT DO NOTHING`. Write `signal_events` row (`type: "email_received"`). Update `sync_cursor` in `integration_tokens`. Return count of new messages processed.

**Send function:**
- `sendEmail(workspaceId: string, userId: string, {to, subject, body, recordId?}: SendEmailOptions): Promise<string>` — Get valid token via `getValidToken()`. Build RFC 2822 MIME message. Call `gmail.users.messages.send()`. If `recordId` provided, insert into `email_messages` with `direction: "outbound"`. Write `signal_events` row (`type: "email_sent"`). Return Gmail message ID.

**Verify:** `pnpm db:push` succeeds. `email_messages` table created. No TypeScript compilation errors in `gmail.ts`.

**Done:** Schema deployed. Gmail adapter exports all required functions. TypeScript clean.

---

### Task 2: Gmail OAuth routes + webhook endpoint + send API + cron sync

**Files:**
- `apps/web/src/app/api/v1/integrations/gmail/connect/route.ts` (NEW)
- `apps/web/src/app/api/v1/integrations/gmail/callback/route.ts` (NEW)
- `apps/web/src/app/api/v1/integrations/gmail/disconnect/route.ts` (NEW)
- `apps/web/src/app/api/v1/integrations/gmail/webhook/route.ts` (NEW)
- `apps/web/src/app/api/v1/integrations/gmail/send/route.ts` (NEW)
- `apps/web/src/app/api/v1/cron/gmail-sync/route.ts` (NEW)

**Action:**

`GET /api/v1/integrations/gmail/connect`:
1. `getAuthContext(req)` — unauthorized if null
2. Call `initiateOAuth(workspaceId, userId)` from gmail adapter
3. Return `Response.redirect(oauthUrl)`

`GET /api/v1/integrations/gmail/callback?code=...&state=...`:
1. No auth context needed — callback is from Google
2. Call `handleCallback(code, state)` — stores tokens
3. Call `watchInbox(workspaceId, userId)` — sets up push notifications
4. `Response.redirect("/settings/integrations?connected=gmail")`
5. On any error: `Response.redirect("/settings/integrations?error=gmail_auth_failed")`

`POST /api/v1/integrations/gmail/disconnect`:
1. `getAuthContext(req)` — unauthorized if null
2. Call `revokeToken(workspaceId, userId, "gmail")` from token-manager
3. Return `success({ disconnected: true })`

`POST /api/v1/integrations/gmail/webhook`:
- Gmail push notifications arrive as base64-encoded Pub/Sub messages in the request body
- Parse body: `const { message } = await req.json()` — decode `message.data` with `Buffer.from(data, "base64")`
- The decoded data contains `{ emailAddress, historyId }`
- **CRITICAL:** Return `200` IMMEDIATELY before processing to prevent Pub/Sub retries. Do NOT await sync work inside the webhook handler.
- Deduplication: INSERT into `processed_signals (provider, signal_id, workspace_id)` where `signal_id = historyId`. Use `ON CONFLICT DO NOTHING`. If conflict (already processed), return 200 and stop.
- If new: Enqueue a pg-boss job `{type: "gmail_sync", workspaceId, userId}` — do not sync inline.
- The Gmail push notification does NOT include content — it only says "something changed." The actual email is fetched by the sync job.

`POST /api/v1/integrations/gmail/send`:
1. `getAuthContext(req)` — unauthorized if null
2. Parse body: `{to: string, subject: string, body: string, recordId?: string}`
3. Validate required fields
4. Call `sendEmail(workspaceId, userId, {to, subject, body, recordId})`
5. Return `success({ sent: true, messageId })`

`GET /api/v1/cron/gmail-sync` (Vercel Cron or pg-boss worker):
1. Validate `Authorization: Bearer {CRON_SECRET}` header
2. Query all `integration_tokens` where `provider = "gmail"` AND `status = "active"`
3. For each token: call `refreshTokenIfNeeded()` then `syncNewMessages()`
4. Batch size: max 10 workspaces per cron run to avoid timeout
5. Return `success({ synced: count })`

**Verify:** `curl http://localhost:3001/api/v1/integrations/gmail/connect` (after auth) returns a redirect to Google. Webhook endpoint returns 200 immediately (test with `curl -X POST` and mock payload).

**Done:** All 6 routes exist. OAuth connect redirects to Google. Webhook handler deduplicates and enqueues jobs. Send endpoint callable from the frontend.

---

## Plan 02-03: O365/Outlook Integration

```yaml
phase: 02-signal-integrations
plan: 02-03
type: execute
wave: 2
depends_on: [02-01]
files_modified:
  - apps/web/src/services/integrations/outlook.ts
  - apps/web/src/app/api/v1/integrations/outlook/connect/route.ts
  - apps/web/src/app/api/v1/integrations/outlook/callback/route.ts
  - apps/web/src/app/api/v1/integrations/outlook/disconnect/route.ts
  - apps/web/src/app/api/v1/integrations/outlook/webhook/route.ts
  - apps/web/src/app/api/v1/integrations/outlook/send/route.ts
  - apps/web/src/app/api/v1/cron/outlook-sync/route.ts
autonomous: true
requirements: [EMAL-02, EMAL-03, EMAL-05, EMAL-06]

must_haves:
  truths:
    - "Rep can connect O365 via OAuth and emails to/from deal contacts appear in email_messages"
    - "Rep can send email from CRM via Outlook account"
    - "Outlook webhook subscription is registered and push notifications are received"
  artifacts:
    - path: "apps/web/src/services/integrations/outlook.ts"
      provides: "Microsoft Graph email adapter — same interface as gmail.ts"
      exports: ["initiateOAuth", "handleCallback", "syncNewMessages", "sendEmail", "subscribeToNotifications"]
  key_links:
    - from: "outlook webhook handler"
      to: "processed_signals"
      via: "deduplication on subscription notification id"
    - from: "syncNewMessages()"
      to: "email_messages table"
      via: "shared table, same schema as Gmail"
```

### Task 1: Outlook adapter service

**Files:**
- `apps/web/src/services/integrations/outlook.ts` (NEW)

**Action:**

**Install:** `pnpm add @microsoft/microsoft-graph-client @azure/msal-node`. Verify versions first. `@azure/msal-node` is needed for the token refresh flow (MSAL handles Microsoft's token rotation correctly).

Create `apps/web/src/services/integrations/outlook.ts` — mirror the same function signatures as `gmail.ts`:

- `initiateOAuth(workspaceId, userId): string` — Build Microsoft OAuth URL via `https://login.microsoftonline.com/common/oauth2/v2.0/authorize`. Scopes: `offline_access Mail.Read Mail.Send Calendars.Read openid email profile`. Include `state` = base64 JSON of `{workspaceId, userId}`.
- `handleCallback(code, state): Promise<void>` — Exchange code at `https://login.microsoftonline.com/common/oauth2/v2.0/token`. Store tokens via `storeToken(provider: "outlook")`.
- `subscribeToNotifications(workspaceId, userId): Promise<void>` — POST to Graph API `/subscriptions` endpoint with `changeType: "created"`, `resource: "/me/messages"`, `notificationUrl: {APP_URL}/api/v1/integrations/outlook/webhook`, `expirationDateTime: now + 3 days` (Microsoft Graph limit). Store `subscriptionId` in `integration_tokens.provider_metadata`. Schedule renewal job via pg-boss before expiry.
- `syncNewMessages(workspaceId, userId, tokenRow): Promise<number>` — Use Graph API delta queries: `GET /me/mailFolders/inbox/messages/delta` with `$deltatoken` from `sync_cursor`. For each new message: extract headers (from, to, subject, receivedDateTime, bodyPreview). Match emails to People records. INSERT into `email_messages` with `provider: "outlook"` and `ON CONFLICT DO NOTHING`. Write `signal_events` row. Update `sync_cursor` with new `@odata.deltaLink` token.
- `sendEmail(workspaceId, userId, opts): Promise<string>` — POST to Graph API `/me/sendMail`. Structure body as `{message: {subject, body: {contentType: "HTML", content: body}, toRecipients: [{emailAddress: {address: to}}]}}`. Insert into `email_messages`. Write signal_event. Return Graph message ID.

**Important Graph API gotcha:** O365 Graph subscriptions expire after 3 days maximum (not 7 like Gmail). The renewal job MUST be scheduled before day 3 or push notifications stop silently. Log a warning when a subscription is within 12 hours of expiry.

**Verify:** TypeScript compiles. Unit-level: call `initiateOAuth("ws1", "u1")` — returns a URL starting with `https://login.microsoftonline.com`.

**Done:** Outlook adapter exported from `services/integrations/outlook.ts` with same interface shape as `gmail.ts`. TypeScript clean.

---

### Task 2: O365 OAuth routes + webhook + send + cron

**Files:**
- `apps/web/src/app/api/v1/integrations/outlook/connect/route.ts` (NEW)
- `apps/web/src/app/api/v1/integrations/outlook/callback/route.ts` (NEW)
- `apps/web/src/app/api/v1/integrations/outlook/disconnect/route.ts` (NEW)
- `apps/web/src/app/api/v1/integrations/outlook/webhook/route.ts` (NEW)
- `apps/web/src/app/api/v1/integrations/outlook/send/route.ts` (NEW)
- `apps/web/src/app/api/v1/cron/outlook-sync/route.ts` (NEW)

**Action:**

Follow the exact same structure as the Gmail routes (02-02 Task 2). Key differences:

**Outlook webhook handler specifics:**
- Microsoft Graph sends a validation request during subscription registration: `GET /webhook?validationToken=...`. The handler MUST return the `validationToken` as `text/plain` with 200 status on this initial call, otherwise subscription registration fails.
- Subsequent notification POSTs have body `{value: [{subscriptionId, changeType, resource, ...}]}`.
- Deduplicate on `subscriptionId + resource` as the signal_id.
- Return 202 Accepted immediately; enqueue `outlook_sync` job.

**Cron handler (`GET /api/v1/cron/outlook-sync`):**
- Same pattern as gmail-sync
- Also check each subscription's expiry and renew if within 12 hours

**Verify:** Connect/callback routes exist. Webhook validation flow works (test by calling with `?validationToken=test` — should return "test" as text/plain).

**Done:** All Outlook routes exist. Same patterns as Gmail. Webhook handles both validation and notification payloads.

---

## Plan 02-04: Email Open/Click Tracking

```yaml
phase: 02-signal-integrations
plan: 02-04
type: execute
wave: 3
depends_on: [02-02, 02-03]
files_modified:
  - apps/web/src/app/api/v1/integrations/resend/webhook/route.ts
  - apps/web/src/services/integrations/email-tracking.ts
autonomous: true
requirements: [EMAL-04]

must_haves:
  truths:
    - "When a CRM-sent email is opened, the email_messages row is updated with opened_at timestamp"
    - "When a link in a CRM-sent email is clicked, the email_messages row is updated with clicked_at"
    - "Open/click events emit signal_events rows for automation engine consumption"
  artifacts:
    - path: "apps/web/src/services/integrations/email-tracking.ts"
      provides: "Resend webhook processor — maps open/click events to email_messages updates"
    - path: "apps/web/src/app/api/v1/integrations/resend/webhook/route.ts"
      provides: "Resend webhook endpoint with HMAC signature validation"
  key_links:
    - from: "Resend webhook"
      to: "email_messages.opened_at / clicked_at"
      via: "match by Resend message ID stored at send time"
```

### Task 1: Resend webhook handler + email tracking service

**Files:**
- `apps/web/src/app/api/v1/integrations/resend/webhook/route.ts` (NEW)
- `apps/web/src/services/integrations/email-tracking.ts` (NEW)

**Action:**

**Context:** Resend is already referenced in the project for transactional email. When the CRM sends emails via the `gmail/send` endpoint, CRM-initiated outbound should also optionally flow through Resend (for tracking) or use the provider API directly. For this plan, wire Resend webhooks for emails sent via Resend. Emails sent directly through Gmail/Outlook provider APIs use the open/click data from those APIs during sync — the Resend webhook covers CRM-initiated sequence emails (Phase 3) and any outbound email explicitly routed through Resend.

Create `apps/web/src/services/integrations/email-tracking.ts`:
- `handleResendWebhook(event: ResendWebhookEvent): Promise<void>`:
  - Event types to handle: `email.opened`, `email.clicked`, `email.bounced`, `email.complained`
  - For `email.opened`: Find `email_messages` row by matching `external_id` to Resend's email ID. Update `opened_at = new Date()`. Write `signal_events` row `{type: "email_opened", recordId: email.recordId, payload: {emailId, openedAt}}`.
  - For `email.clicked`: Update `clicked_at`. Write `signal_events` `{type: "email_link_clicked"}`.
  - For `email.bounced`: Update email_messages status (add a `delivery_status` column if not present — check schema from 02-02). Write `signal_events` `{type: "email_bounced"}`.
  - Deduplication: Use `processed_signals` table with `provider = "resend"`, `signal_id = event.data.email_id + ":" + event.type`.

Create `POST /api/v1/integrations/resend/webhook`:
- Validate Resend webhook signature: Resend sends `svix-id`, `svix-timestamp`, `svix-signature` headers. Verify using HMAC-SHA256 with `process.env.RESEND_WEBHOOK_SECRET`. If signature invalid, return 401.
- Parse body as `ResendWebhookEvent`
- Return 200 immediately (before processing to prevent retries)
- Enqueue pg-boss job `{type: "process_resend_event", payload: event}` — do not process inline

Add `RESEND_WEBHOOK_SECRET` to environment variable documentation.

**Verify:** `curl -X POST /api/v1/integrations/resend/webhook` with missing/wrong signature returns 401. With valid signature returns 200. `email_messages.opened_at` is updated when processing a mock `email.opened` event.

**Done:** Resend webhook route validates signature and enqueues jobs. Tracking service updates `email_messages` with open/click timestamps and writes signal_events.

---

## Plan 02-05: Google Calendar Integration

```yaml
phase: 02-signal-integrations
plan: 02-05
type: execute
wave: 3
depends_on: [02-02]
files_modified:
  - apps/web/src/db/schema/calendar-events.ts
  - apps/web/src/db/schema/index.ts
  - apps/web/src/services/integrations/google-calendar.ts
  - apps/web/src/app/api/v1/integrations/google-calendar/webhook/route.ts
  - apps/web/src/app/api/v1/cron/calendar-sync/route.ts
autonomous: true
requirements: [CALR-01, CALR-03, CALR-04, CALR-05]

must_haves:
  truths:
    - "Google Calendar events with deal contact attendees are automatically synced and stored in calendar_events"
    - "When a meeting ends (event end_time < now), a signal_event of type meeting_ended is emitted"
    - "A T-30min pg-boss job is scheduled for each upcoming deal-linked meeting"
    - "Calendar sync uses syncToken delta (not full re-fetch) for efficiency"
  artifacts:
    - path: "apps/web/src/db/schema/calendar-events.ts"
      provides: "calendar_events table"
      contains: "external_id, provider, attendee_emails, start_at, end_at, record_id"
    - path: "apps/web/src/services/integrations/google-calendar.ts"
      provides: "Google Calendar sync adapter"
      exports: ["syncCalendarEvents", "watchCalendar"]
  key_links:
    - from: "syncCalendarEvents()"
      to: "signal_events"
      via: "meeting_ended event when end_time < now and not yet emitted"
    - from: "syncCalendarEvents()"
      to: "pg-boss job queue"
      via: "meeting_prep job scheduled at event.start_at - 30min"
```

### Task 1: calendar_events schema + Google Calendar adapter

**Files:**
- `apps/web/src/db/schema/calendar-events.ts` (NEW)
- `apps/web/src/db/schema/index.ts` (MODIFY)
- `apps/web/src/services/integrations/google-calendar.ts` (NEW)

**Action:**

Create `apps/web/src/db/schema/calendar-events.ts`:

```typescript
export const calendarProviderEnum = pgEnum("calendar_provider", ["google_calendar", "outlook_calendar"]);

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
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
    uniqueIndex("calendar_events_external_unique").on(table.workspaceId, table.provider, table.externalId),
    index("calendar_events_record_id").on(table.recordId),
    index("calendar_events_start_at").on(table.workspaceId, table.startAt),
  ]
);
```

Run `pnpm db:push`.

Create `apps/web/src/services/integrations/google-calendar.ts`:

**Key detail:** Google Calendar OAuth uses the SAME credential as Gmail (`provider: "gmail"` in `integration_tokens`). No additional OAuth flow — the Gmail token already has `calendar.readonly` scope if requested at connect time (which the Gmail adapter does). Read the Gmail token via `getValidToken(workspaceId, userId, "gmail")`.

- `syncCalendarEvents(workspaceId: string, userId: string): Promise<number>` —
  1. Get valid Gmail token (covers Calendar)
  2. Load `sync_cursor` for calendar (store separately in `integration_tokens.provider_metadata.calendarSyncToken`)
  3. Call Google Calendar API `events.list()` with `syncToken` if available (delta sync), or full sync if no token. Use `calendarId: "primary"`.
  4. For each event: extract title, start/end times, attendee emails, conferenceData (for Zoom/Meet links)
  5. Match attendee emails to People records in CRM (query `record_values` for email attributes)
  6. If any attendee matches a CRM contact, link the event to that contact's associated deals (via record_reference attributes)
  7. INSERT into `calendar_events` with `ON CONFLICT (workspace_id, provider, external_id) DO UPDATE` (update title/times if event was modified)
  8. For upcoming events with `prepJobEnqueued = false`: enqueue pg-boss job `{type: "meeting_prep", calendarEventId, run_at: event.startAt - 30min}`. Update `prepJobEnqueued = true`.
  9. For past events with `endedSignalEmitted = false` and `endAt < now`: write `signal_events` `{type: "meeting_ended", recordId, payload: {calendarEventId}}`. Update `endedSignalEmitted = true`.
  10. Update `calendarSyncToken` in `provider_metadata`
  11. Return count of events processed

- `watchCalendar(workspaceId: string, userId: string): Promise<void>` — Register a push notification channel via `calendar.events.watch()`. Store channel ID in `provider_metadata.calendarWatchChannelId`.

**Verify:** `pnpm db:push` succeeds. `calendar_events` table created with `prep_job_enqueued` and `ended_signal_emitted` boolean columns.

**Done:** Schema deployed. Google Calendar adapter syncs events, links to CRM records, schedules prep jobs, emits meeting_ended signals.

---

### Task 2: Calendar webhook + cron route

**Files:**
- `apps/web/src/app/api/v1/integrations/google-calendar/webhook/route.ts` (NEW)
- `apps/web/src/app/api/v1/cron/calendar-sync/route.ts` (NEW)

**Action:**

`POST /api/v1/integrations/google-calendar/webhook`:
- Google Calendar push notifications send a minimal POST with headers: `X-Goog-Channel-ID`, `X-Goog-Resource-State` (exists/sync/not_exists)
- Validate `X-Goog-Channel-ID` exists in `integration_tokens.provider_metadata.calendarWatchChannelId`
- Return 200 immediately
- Enqueue `{type: "calendar_sync", workspaceId, userId}` pg-boss job — do NOT sync inline

`GET /api/v1/cron/calendar-sync`:
- Validate `Authorization: Bearer {CRON_SECRET}` header
- Query all active Gmail integration tokens (covers Google Calendar — same token)
- For each: call `syncCalendarEvents(workspaceId, userId)`
- Also process any pending `meeting_ended` signal emissions (past events where `ended_signal_emitted = false`)
- Return `success({ synced: count })`

**Verify:** Cron endpoint returns 200 with JSON. Calling `syncCalendarEvents` for a workspace with no token returns 0 without throwing.

**Done:** Calendar webhook and cron routes exist. Cron iterates all active connections and syncs.

---

## Plan 02-06: Outlook Calendar Integration

```yaml
phase: 02-signal-integrations
plan: 02-06
type: execute
wave: 3
depends_on: [02-03, 02-05]
files_modified:
  - apps/web/src/services/integrations/outlook-calendar.ts
  - apps/web/src/app/api/v1/integrations/outlook-calendar/webhook/route.ts
autonomous: true
requirements: [CALR-02, CALR-03]

must_haves:
  truths:
    - "Outlook Calendar events with deal contact attendees are synced to calendar_events table"
    - "Outlook calendar sync uses Graph delta tokens (not full re-fetch)"
    - "Outlook calendar push subscriptions are registered and renewed before expiry"
  artifacts:
    - path: "apps/web/src/services/integrations/outlook-calendar.ts"
      provides: "Microsoft Graph Calendar adapter"
      exports: ["syncCalendarEvents", "subscribeToCalendarNotifications"]
  key_links:
    - from: "outlook-calendar sync"
      to: "calendar_events table"
      via: "shared table with google-calendar (provider column distinguishes rows)"
```

### Task 1: Outlook Calendar adapter + webhook route

**Files:**
- `apps/web/src/services/integrations/outlook-calendar.ts` (NEW)
- `apps/web/src/app/api/v1/integrations/outlook-calendar/webhook/route.ts` (NEW)

**Action:**

Create `apps/web/src/services/integrations/outlook-calendar.ts`:

Uses the same O365 token (`provider: "outlook"`) as the email integration. The Graph API covers both email and calendar with the same credential when `Calendars.Read` scope was requested at connect time.

- `syncCalendarEvents(workspaceId: string, userId: string): Promise<number>` — Same logic as google-calendar adapter but using Graph API. Call `GET /me/calendarView/delta` or `GET /me/events/delta` with deltaLink from `provider_metadata.calendarDeltaToken`. For each event: extract subject, start/end (convert to UTC), attendees array, onlineMeeting (for Teams/Zoom links). INSERT into `calendar_events` with `provider: "outlook_calendar"` and `ON CONFLICT DO UPDATE`. Apply same prep-job/ended-signal logic as Google Calendar adapter.

- `subscribeToCalendarNotifications(workspaceId, userId): Promise<void>` — POST to Graph `/subscriptions` with `resource: "/me/events"`, expiry 3 days. Store in `provider_metadata.calendarSubscriptionId`. Same renewal pattern as Outlook email subscriptions.

Create `POST /api/v1/integrations/outlook-calendar/webhook`:
- Handle Microsoft Graph validation challenge (`validationToken` query param) — return plaintext token as in Outlook email webhook
- Subsequent notifications: deduplicate, return 202, enqueue `outlook_calendar_sync` job
- Add Outlook calendar subscription renewal to the existing `outlook-sync` cron handler

**Verify:** TypeScript compiles. Webhook handles validation challenge correctly (returns text/plain).

**Done:** Outlook Calendar adapter and webhook route created. Calendar events from O365 flow into the same `calendar_events` table as Google Calendar events.

---

## Plan 02-07: LinkedIn Enrichment via Proxycurl

```yaml
phase: 02-signal-integrations
plan: 02-07
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/services/integrations/linkedin.ts
  - apps/web/src/app/api/v1/integrations/linkedin/enrich/route.ts
  - apps/web/src/services/records.ts
autonomous: true
requirements: [LNKD-01, LNKD-02, LNKD-03, LNKD-04]

must_haves:
  truths:
    - "When a People record is created with an email address, auto-enrichment is enqueued as a pg-boss job"
    - "Manual enrichment can be triggered from the record page via POST /api/v1/integrations/linkedin/enrich"
    - "Enrichment results (title, company, location, LinkedIn URL) are written as EAV record_values on the People record"
    - "Company enrichment populates company size, industry, description on the Company record"
    - "Enriched records show a 'Last enriched' timestamp"
  artifacts:
    - path: "apps/web/src/services/integrations/linkedin.ts"
      provides: "Proxycurl HTTP client — enrichPerson(), enrichCompany()"
      exports: ["enrichPerson", "enrichCompany"]
  key_links:
    - from: "createRecord() in records.ts"
      to: "pg-boss enqueue linkedin_enrich job"
      via: "post-create hook when email attribute is set"
    - from: "enrichPerson()"
      to: "record_values table"
      via: "upsert EAV values for linkedin_title, linkedin_company, linkedin_url"
```

### Task 1: Proxycurl service + enrichment API route

**Files:**
- `apps/web/src/services/integrations/linkedin.ts` (NEW)
- `apps/web/src/app/api/v1/integrations/linkedin/enrich/route.ts` (NEW)

**Action:**

**No SDK install.** Proxycurl is HTTP-only. Add `PROXYCURL_API_KEY` to `.env.example`.

Create `apps/web/src/services/integrations/linkedin.ts`:

```typescript
const PROXYCURL_BASE = "https://nubela.co/proxycurl/api";

export interface PersonEnrichmentResult {
  linkedinUrl?: string;
  title?: string;
  headline?: string;
  company?: string;
  location?: string;
  summary?: string;
  profileImageUrl?: string;
  enrichedAt: Date;
}

export interface CompanyEnrichmentResult {
  name?: string;
  description?: string;
  industry?: string;
  employeeCount?: number;
  headquarters?: string;
  websiteUrl?: string;
  enrichedAt: Date;
}
```

- `enrichPerson(workspaceId: string, recordId: string, email: string): Promise<PersonEnrichmentResult | null>` —
  1. Check `PROXYCURL_API_KEY` — throw if missing
  2. GET `{PROXYCURL_BASE}/v2/linkedin/person/resolve?email={email}` with `Authorization: Bearer {key}` header
  3. If 404 or no result, return null
  4. Map response fields: `occupation` → `title`, `company_name` → `company`, `city + country` → `location`, `linkedin_profile_url` → `linkedinUrl`
  5. Write enrichment results back to EAV: call the existing records service to upsert `record_values`. Attribute slugs to write (if they exist on the People object): `linkedin-title`, `linkedin-company`, `linkedin-location`, `linkedin-url`, `linkedin-enriched-at` (timestamp). Only write if the attribute slug exists on the workspace's People object — do NOT create new attributes automatically.
  6. Return the result

- `enrichCompany(workspaceId: string, recordId: string, domain: string): Promise<CompanyEnrichmentResult | null>` —
  1. GET `{PROXYCURL_BASE}/v2/linkedin/company?url=linkedin.com/company/{domain}` (or resolve by domain: `{PROXYCURL_BASE}/v2/linkedin/company/resolve?company_domain={domain}`)
  2. Map fields: `description`, `industry`, `employee_count`, `hq_city` + `hq_country` → `headquarters`
  3. Write back to EAV on the Company record. Attribute slugs: `company-size`, `company-industry`, `company-description`, `linkedin-enriched-at`.
  4. Return result

- `scheduleEnrichment(workspaceId: string, recordId: string, objectType: "people" | "company", identifier: string): Promise<void>` — Enqueue pg-boss job `{type: "linkedin_enrich", workspaceId, recordId, objectType, identifier}`.

Create `POST /api/v1/integrations/linkedin/enrich`:
1. `getAuthContext(req)` — unauthorized if null
2. Parse body: `{recordId: string, objectType: "people" | "company"}`
3. Load the record to get the email (for people) or domain (for company) attribute
4. Call `enrichPerson()` or `enrichCompany()` directly (not via job — manual trigger = synchronous for UI feedback)
5. Return `success({ enriched: true, result })`

Handle Proxycurl rate limits: if response is 429, return `badRequest("Enrichment rate limit reached — try again in a minute")`.
Handle missing API key: return `badRequest("Proxycurl API key not configured")`.

**Verify:** `PROXYCURL_API_KEY` not set → `/api/v1/integrations/linkedin/enrich` returns 400 with clear message. TypeScript compiles.

**Done:** LinkedIn service and enrich endpoint created. Enrichment writes to EAV record_values. Missing API key returns helpful error.

---

### Task 2: Auto-enrich hook on People record creation

**Files:**
- `apps/web/src/services/records.ts` (MODIFY — add post-create hook)

**Action:**

In `services/records.ts`, find the `createRecord()` function. After the record is successfully created (and the existing `handleRecordCreated()` side-effect call), add:

```typescript
// Auto-enrich new People records when email is provided
if (objectSlug === "people" && values["email"]) {
  const email = values["email"] as string;
  await scheduleEnrichment(workspaceId, record.id, "people", email);
}
```

Import `scheduleEnrichment` from `services/integrations/linkedin.ts`.

**Important:** This must be fire-and-forget (don't await the job enqueue in the critical path, or make it tolerant of failure). The job enqueue itself is fast (DB insert), so awaiting is acceptable. If `PROXYCURL_API_KEY` is not set, `scheduleEnrichment` should log a warning and return without throwing, so it doesn't break record creation.

Update `scheduleEnrichment` to handle missing API key gracefully:
```typescript
export async function scheduleEnrichment(...): Promise<void> {
  if (!process.env.PROXYCURL_API_KEY) {
    console.warn("[linkedin] PROXYCURL_API_KEY not set — skipping auto-enrichment");
    return;
  }
  // enqueue job...
}
```

**Verify:** Create a People record with an email. Verify a pg-boss job of type `linkedin_enrich` appears in the jobs table (or that the function is called — check with a console.log in the hook temporarily). When `PROXYCURL_API_KEY` is not set, record creation still succeeds.

**Done:** Auto-enrich hook fires on People creation with email. Missing API key does not break record creation.

---

## Plan 02-08: Zoom + AssemblyAI Telephony

```yaml
phase: 02-signal-integrations
plan: 02-08
type: execute
wave: 4
depends_on: [02-02, 02-03, 02-05, 02-06]
files_modified:
  - apps/web/src/db/schema/call-recordings.ts
  - apps/web/src/db/schema/index.ts
  - apps/web/src/services/integrations/zoom.ts
  - apps/web/src/services/integrations/assemblyai.ts
  - apps/web/src/app/api/v1/integrations/zoom/webhook/route.ts
  - apps/web/src/app/api/v1/integrations/zoom/connect/route.ts
  - apps/web/src/app/api/v1/cron/telephony/route.ts
  - apps/web/src/app/(dashboard)/settings/integrations/page.tsx
autonomous: true
requirements: [TELE-01, TELE-02, TELE-03, TELE-04, TELE-05, TELE-06]

must_haves:
  truths:
    - "Zoom recording webhook is received, signature validated, and recording metadata stored in call_recordings"
    - "AssemblyAI transcription job is enqueued after recording is available; transcript is stored when complete"
    - "PII redaction pass runs before transcript is passed to any AI model"
    - "Call is auto-logged to the deal timeline as a signal_event of type call_recorded"
    - "Workspace admin can toggle call recording consent requirement in settings"
  artifacts:
    - path: "apps/web/src/db/schema/call-recordings.ts"
      provides: "call_recordings table with explicit access controls and consent tracking"
      contains: "zoom_meeting_id, recording_url, transcript, transcript_redacted, ai_summary, consent_confirmed"
    - path: "apps/web/src/services/integrations/zoom.ts"
      provides: "Zoom webhook handler + recording fetcher"
    - path: "apps/web/src/services/integrations/assemblyai.ts"
      provides: "AssemblyAI transcription client with PII redaction"
  key_links:
    - from: "Zoom webhook"
      to: "processed_signals dedup"
      via: "dedup on zoom meeting_id + recording event"
    - from: "assemblyai transcript"
      to: "pii_redacted_transcript"
      via: "redactPII() before storing or passing to AI"
    - from: "call_recordings"
      to: "signal_events"
      via: "call_recorded signal written per completed transcription"
```

### Task 1: call_recordings schema + Zoom adapter + AssemblyAI adapter

**Files:**
- `apps/web/src/db/schema/call-recordings.ts` (NEW)
- `apps/web/src/db/schema/index.ts` (MODIFY)
- `apps/web/src/services/integrations/zoom.ts` (NEW)
- `apps/web/src/services/integrations/assemblyai.ts` (NEW)

**Action:**

**Install:** `pnpm add assemblyai`. Verify version: `npm info assemblyai version`. Do NOT install a Twilio SDK unless outbound calling is in scope — Zoom recording is the primary telephony integration.

Create `apps/web/src/db/schema/call-recordings.ts`:

```typescript
export const callRecordingStatusEnum = pgEnum("call_recording_status", [
  "pending", "transcribing", "transcribed", "failed"
]);

export const callRecordings = pgTable(
  "call_recordings",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
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
    uniqueIndex("call_recordings_external_unique").on(table.workspaceId, table.externalRecordingId),
    index("call_recordings_record_id").on(table.recordId),
    index("call_recordings_workspace_id").on(table.workspaceId, table.status),
  ]
);
```

Run `pnpm db:push`.

Create `apps/web/src/services/integrations/zoom.ts`:

- `verifyWebhookSignature(req: Request): boolean` — Zoom sends `x-zm-signature` header containing `v0={HMAC-SHA256(timestamp + "." + rawBody)}`. Also sends `x-zm-request-timestamp`. Verify signature using `node:crypto` HMAC-SHA256 with `process.env.ZOOM_WEBHOOK_SECRET_TOKEN`. Return false if missing or invalid. This is REQUIRED — do not process Zoom webhooks without this check.

- `handleRecordingWebhook(event: ZoomWebhookEvent): Promise<void>` — Handle `recording.completed` event type. Extract `payload.object`: `{id: meetingId, recording_files: [{id, file_type, download_url, status}]}`. Filter `recording_files` for `file_type: "MP4"` or `"M4A"` and `status: "completed"`. Insert into `call_recordings` with `status: "pending"`. Match `host_email` to workspace users; match `participant_emails` to CRM People records. If match found, set `record_id`. Check workspace consent setting — if consent required and `consentConfirmed = false`, skip transcription and log a warning. Enqueue pg-boss job `{type: "transcribe_call", callRecordingId}`.

- `fetchRecordingForTranscription(recordingUrl: string, accessToken: string): Promise<Buffer>` — Download recording audio from Zoom's time-limited download URL using the Zoom OAuth access token. Return the audio buffer. Note: Zoom download URLs expire within minutes — this must be called soon after the webhook arrives.

Create `apps/web/src/services/integrations/assemblyai.ts`:

**Install:** Already done above.

- `redactPII(transcript: string): string` — Apply regex-based redaction before any AI processing. Redact: email addresses (`[EMAIL]`), phone numbers (`[PHONE]`), SSNs (`[SSN]`), credit card numbers (`[CARD]`). Use conservative regex patterns. This is a best-effort pass, not a compliance guarantee — document this clearly. Return redacted string.

- `transcribeCall(callRecordingId: string): Promise<void>` —
  1. Load `call_recordings` row
  2. Get Zoom access token via `getValidToken(workspaceId, userId, "zoom")` (if Zoom OAuth is implemented) — for now, use a Zoom Server-to-Server OAuth app credential stored in env vars: `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_ACCOUNT_ID`.
  3. Download recording audio via `fetchRecordingForTranscription()`
  4. Submit to AssemblyAI: `const client = new AssemblyAI({apiKey: process.env.ASSEMBLYAI_API_KEY})`. Use `client.transcripts.transcribe({audio: audioBuffer, speaker_labels: true, entity_detection: true})` for speaker diarization and entity detection.
  5. AssemblyAI is async — use the polling pattern: `await client.transcripts.waitUntilReady(transcriptId)`.
  6. On completion: store `transcript_raw` (full text with speaker labels), apply `redactPII()` and store `transcript_redacted`.
  7. Generate AI summary using existing `callOpenRouter()` from `ai-chat.ts` with `transcript_redacted` as context. Prompt: "Summarize this sales call transcript. Extract: 1) Key topics discussed, 2) Action items, 3) Next steps, 4) Objections raised. Format as structured markdown." Store in `ai_summary`.
  8. Update `status = "transcribed"`.
  9. Write `signal_events` `{type: "call_recorded", recordId: call.recordId, payload: {callRecordingId, durationSeconds}}`.
  10. Create a `generated_assets` row with `asset_type: "call_summary"`, `status: "draft"`, `content: aiSummary` — surfaces in approval inbox.

**Verify:** `pnpm db:push` succeeds. `call_recordings` table created. `redactPII("My email is test@example.com")` returns `"My email is [EMAIL]"`.

**Done:** Schema, Zoom adapter, and AssemblyAI adapter created. PII redaction runs before AI processing. Transcript stored in dedicated table (not EAV).

---

### Task 2: Zoom webhook route + consent toggle + cron handler

**Files:**
- `apps/web/src/app/api/v1/integrations/zoom/webhook/route.ts` (NEW)
- `apps/web/src/app/api/v1/integrations/zoom/connect/route.ts` (NEW)
- `apps/web/src/app/api/v1/cron/telephony/route.ts` (NEW)
- `apps/web/src/app/(dashboard)/settings/integrations/page.tsx` (MODIFY — add consent toggle)

**Action:**

`POST /api/v1/integrations/zoom/webhook`:
1. Read raw body as text (must do this BEFORE parsing JSON for signature verification)
2. Call `verifyWebhookSignature(req)` — return 401 if invalid. Never process unsigned Zoom webhooks.
3. Parse JSON body
4. Handle `endpoint.url_validation` event type: Zoom sends this during webhook registration setup. Respond with `{plainToken, encryptedToken}` as required by Zoom's URL verification. See Zoom docs for exact response format.
5. For `recording.completed`: dedup via `processed_signals` with `provider: "zoom"`, `signal_id: payload.object.uuid`. Return 200, enqueue `process_zoom_recording` job.
6. For other event types: return 200 and ignore.

`GET /api/v1/integrations/zoom/connect`:
- Zoom uses Server-to-Server OAuth (app-level, not per-user) for recording access. The "connect" flow is configuration-based, not user OAuth.
- This route: validates `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_ACCOUNT_ID` are set, stores them as workspace-level config in `workspaces.settings.zoom`, returns success or error.
- Add UI to settings page for entering Zoom credentials (admin-only, workspace-wide).

Add consent toggle to `settings/integrations/page.tsx`:
- Add a "Recording Consent" section near the Zoom card
- Toggle: "Require explicit consent notice before recording transcription is processed"
- Read/write from `workspaces.settings.zoom_consent_required`
- Workspace admin only. Use `requireAdmin(ctx)` in the backing API route.

`GET /api/v1/cron/telephony`:
- Process pending `call_recordings` with `status: "pending"` by calling `transcribeCall()`
- Only process recordings where `consent_confirmed = true` OR workspace setting `zoom_consent_required = false`
- Max 5 recordings per cron run (transcription is slow)

**Verify:** Zoom URL validation handshake works (call webhook endpoint with `endpoint.url_validation` body — should return correct `encryptedToken`). Webhook with invalid signature returns 401.

**Done:** Zoom webhook validates signatures. URL validation handshake implemented. Consent toggle in settings. Telephony cron processes pending recordings.

---

## Plan 02-09: Unified Activity Timeline

```yaml
phase: 02-signal-integrations
plan: 02-09
type: execute
wave: 5
depends_on: [02-02, 02-03, 02-04, 02-05, 02-06, 02-07, 02-08]
files_modified:
  - apps/web/src/services/activity-timeline.ts
  - apps/web/src/app/api/v1/timeline/[recordId]/route.ts
  - apps/web/src/app/(dashboard)/[objectSlug]/[recordId]/page.tsx
  - apps/web/src/components/activity-timeline.tsx
autonomous: true
requirements: [TMLN-01, TMLN-02, TMLN-03]

must_haves:
  truths:
    - "GET /api/v1/timeline/:recordId returns a unified chronological array of all events for that record"
    - "Timeline includes: email_messages, calendar_events, call_recordings, notes, tasks, signal_events (stage changes)"
    - "Timeline is workspace-scoped — cross-workspace data leakage is impossible"
    - "Timeline is paginated (cursor-based) with a default limit of 50 items"
    - "AI chat can call a getTimeline tool to read timeline context for a record"
  artifacts:
    - path: "apps/web/src/services/activity-timeline.ts"
      provides: "getActivityTimeline(workspaceId, recordId, cursor?, limit?) — UNION ALL query"
      exports: ["getActivityTimeline", "getTimelineSummary"]
    - path: "apps/web/src/components/activity-timeline.tsx"
      provides: "ActivityTimeline React component — renders all event types"
  key_links:
    - from: "getActivityTimeline()"
      to: "email_messages, calendar_events, call_recordings, notes, tasks, signal_events"
      via: "UNION ALL query indexed on (record_id, occurred_at)"
    - from: "ActivityTimeline component"
      to: "GET /api/v1/timeline/:recordId"
      via: "fetch on mount + infinite scroll cursor"
    - from: "getTimelineSummary()"
      to: "AI chat tool calling"
      via: "compact text summary for LLM context"
```

### Task 1: Activity timeline service (UNION ALL query)

**Files:**
- `apps/web/src/services/activity-timeline.ts` (NEW)

**Action:**

Create `apps/web/src/services/activity-timeline.ts`:

```typescript
export type TimelineEventType =
  | "email_received"
  | "email_sent"
  | "email_opened"
  | "meeting"
  | "call"
  | "note"
  | "task"
  | "stage_change"
  | "record_created"
  | "enrichment";

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  occurredAt: Date;
  title: string;
  summary?: string;
  metadata: Record<string, unknown>;
}

export interface TimelineResult {
  events: TimelineEvent[];
  nextCursor?: string; // ISO timestamp of last event for cursor pagination
  totalCount: number;
}
```

Implement `getActivityTimeline(workspaceId: string, recordId: string, cursor?: string, limit = 50): Promise<TimelineResult>`:

Use a single SQL `UNION ALL` query via Drizzle's `sql` template tag. The query must enforce `workspace_id` on EVERY sub-select — workspace scoping is not optional.

```sql
SELECT 'email' as type, id, record_id, received_at as occurred_at,
       COALESCE(subject, '(no subject)') as title,
       snippet as summary,
       json_build_object('from', from_email, 'direction', direction) as metadata
FROM email_messages
WHERE record_id = $recordId AND workspace_id = $workspaceId

UNION ALL

SELECT 'meeting' as type, id, record_id, start_at as occurred_at,
       COALESCE(title, 'Meeting') as title,
       NULL as summary,
       json_build_object('endAt', end_at, 'attendees', attendee_emails) as metadata
FROM calendar_events
WHERE record_id = $recordId AND workspace_id = $workspaceId

UNION ALL

SELECT 'call' as type, id, record_id, started_at as occurred_at,
       'Call Recording' as title,
       ai_summary as summary,
       json_build_object('duration', duration_seconds, 'status', status) as metadata
FROM call_recordings
WHERE record_id = $recordId AND workspace_id = $workspaceId

UNION ALL

SELECT 'note' as type, n.id, n.record_id, n.created_at as occurred_at,
       'Note' as title,
       LEFT(n.content_text, 200) as summary,
       '{}'::json as metadata
FROM notes n
WHERE n.record_id = $recordId
  AND EXISTS (SELECT 1 FROM records r WHERE r.id = n.record_id AND r.workspace_id -- infer from object)

UNION ALL

SELECT 'task' as type, t.id, t.record_id, t.created_at as occurred_at,
       t.title, NULL as summary,
       json_build_object('dueDate', t.due_date, 'completed', t.completed_at IS NOT NULL) as metadata
FROM tasks t
WHERE t.record_id = $recordId

UNION ALL

SELECT 'signal' as type, se.id, se.record_id, se.created_at as occurred_at,
       se.type as title, NULL as summary,
       se.payload as metadata
FROM signal_events se
WHERE se.record_id = $recordId AND se.workspace_id = $workspaceId
  AND se.type IN ('stage_changed', 'record_created')

ORDER BY occurred_at DESC
LIMIT $limit OFFSET $offset
```

**Workspace scoping detail:** Notes and tasks don't have a direct `workspace_id` column — they're scoped through `records`. Join through `records` table to enforce workspace_id: `JOIN records r ON r.id = t.record_id WHERE r.workspace_id = $workspaceId`.

Implement cursor pagination: if `cursor` (ISO timestamp) is provided, add `WHERE occurred_at < cursor` to each sub-select before the ORDER BY.

Implement `getTimelineSummary(workspaceId: string, recordId: string): Promise<string>`:
- Fetches last 20 events via `getActivityTimeline()` with limit 20
- Returns a compact text summary for AI context:
```
Activity Timeline for [record] (last 20 events):
- [date] EMAIL from john@prospect.com: "Re: Proposal follow-up" — opened 3 times
- [date] MEETING: Discovery call (45 min)
- [date] STAGE CHANGE: Discovery → Proposal
...
```
- This function is used by AI document generators (Phase 3) — not called in Phase 2 from the AI chat, but must exist.

**Verify:** Call `getActivityTimeline("ws1", "record1")` returns an object with `events` array and `nextCursor`. Query executes in < 200ms (check EXPLAIN ANALYZE — should use indexes).

**Done:** Timeline service executes a single UNION ALL query. Workspace scoping enforced in every sub-select. Cursor pagination implemented.

---

### Task 2: Timeline API route + UI component

**Files:**
- `apps/web/src/app/api/v1/timeline/[recordId]/route.ts` (NEW)
- `apps/web/src/components/activity-timeline.tsx` (NEW)
- `apps/web/src/app/(dashboard)/[objectSlug]/[recordId]/page.tsx` (MODIFY — add timeline tab)

**Action:**

Create `GET /api/v1/timeline/:recordId`:
1. `getAuthContext(req)` — unauthorized if null
2. Parse `?cursor=` and `?limit=` query params
3. Verify the record belongs to the workspace (load record, check `records.object_id` → `objects.workspace_id`)
4. Call `getActivityTimeline(workspaceId, recordId, cursor, limit)`
5. Return `success({ events, nextCursor, totalCount })`

Create `apps/web/src/components/activity-timeline.tsx` as a client component (`"use client"`):

```typescript
export function ActivityTimeline({ recordId }: { recordId: string }) {
  // Fetches from /api/v1/timeline/:recordId
  // Renders events in chronological order (newest first)
  // Each event type has a distinct icon (use lucide-react):
  //   email: Mail icon
  //   meeting: Calendar icon
  //   call: Phone icon
  //   note: FileText icon
  //   task: CheckSquare icon
  //   stage_change: ArrowRight icon
  // Shows: icon, title, summary (truncated to 2 lines), relative time ("2 hours ago")
  // "Load more" button for cursor-based pagination
  // Loading skeleton state using shadcn/ui Skeleton
}
```

Modify the record detail page (`apps/web/src/app/(dashboard)/[objectSlug]/[recordId]/page.tsx`):
- Find the existing record detail page. If it uses tabs, add an "Activity" tab.
- If no tab UI exists yet, add a section below the existing record fields with `<ActivityTimeline recordId={params.recordId} />`
- Check the existing record page structure — match the layout pattern already in use.

**Verify:** Navigate to a record page. Activity timeline renders (may be empty if no integrations are connected). API endpoint returns correct shape. TypeScript compiles.

**Done:** Timeline API route enforces workspace scoping. ActivityTimeline component renders all event types with distinct icons. Record detail page shows the timeline.

---

## Phase-Level Verification

After all plans (02-01 through 02-09) are complete, verify:

### Success Criteria Checklist

1. **Email integration:** Connect Gmail in Settings. Send an email to a test contact. Verify the email appears in `email_messages` table and on the contact's record page activity timeline within 5 minutes.

2. **Email send from CRM:** On a contact record, use the "Send Email" action. Verify the email is delivered and appears in `email_messages` with `direction: "outbound"`.

3. **Email tracking:** Send a CRM email via Resend. Open it. Verify `email_messages.opened_at` is populated and a `email_opened` signal_event row exists.

4. **Calendar sync:** Connect Google Calendar. Create a calendar event with a CRM contact as an attendee. Run `GET /api/v1/cron/calendar-sync` manually. Verify `calendar_events` row created with `record_id` populated.

5. **LinkedIn enrichment:** Create a People record with an email. Verify a `linkedin_enrich` job appears in the pg-boss jobs table. With `PROXYCURL_API_KEY` set, manually trigger `/api/v1/integrations/linkedin/enrich` — verify `record_values` updated with LinkedIn data.

6. **Zoom telephony:** POST a mock `recording.completed` Zoom webhook to `/api/v1/integrations/zoom/webhook`. Verify: signature validation fires (returns 401 without correct header), `processed_signals` row created, `call_recordings` row inserted, transcription job enqueued.

7. **Activity timeline:** Navigate to any record that has email/meeting/note data. Verify the `/api/v1/timeline/:recordId` endpoint returns events from multiple sources in chronological order. Verify cross-workspace leakage: record in workspace A not accessible to workspace B user.

8. **PII in transcripts:** Manually run `redactPII("Call me at 555-867-5309 or email bob@prospect.com")` — verify phone and email are replaced with `[PHONE]` and `[EMAIL]`.

### E2E Test Coverage

After phase complete, add E2E tests in `apps/web/e2e/`:
- `integration-settings.spec.ts`: Navigate to `/settings/integrations`, verify all 6 provider cards render, connect button exists for each
- `activity-timeline.spec.ts`: Create a note on a record, navigate to record page, verify note appears in the activity timeline section
- `linkedin-enrich.spec.ts`: Create a People record with email, call enrich endpoint, verify response shape

### Security Verification

- [ ] `integration_tokens` table: `accessTokenEncrypted` column contains ciphertext (not plaintext). Verify by querying DB directly.
- [ ] Zoom webhook: POST without `x-zm-signature` header → 401
- [ ] Timeline API: User from workspace B cannot access records from workspace A (test by swapping JWT/session cookies)
- [ ] `call_recordings.transcript_raw` is NOT passed to any AI model — only `transcript_redacted` is used in AI calls

---

## Environment Variables Required (Phase 2)

Add to `apps/web/.env.example`:

```bash
# Token encryption (REQUIRED for email/calendar integrations)
ENCRYPTION_KEY=                   # openssl rand -hex 32

# Gmail + Google Calendar
GOOGLE_CLIENT_ID=                 # Already in .env.example — extend scopes
GOOGLE_CLIENT_SECRET=             # Already in .env.example
GOOGLE_PUBSUB_TOPIC=              # projects/{project}/topics/gmail-notifications

# Outlook + O365 Calendar
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=

# LinkedIn enrichment
PROXYCURL_API_KEY=

# Zoom telephony
ZOOM_CLIENT_ID=                   # Zoom Server-to-Server OAuth app
ZOOM_CLIENT_SECRET=
ZOOM_ACCOUNT_ID=
ZOOM_WEBHOOK_SECRET_TOKEN=        # From Zoom App configuration

# AssemblyAI transcription
ASSEMBLYAI_API_KEY=

# Resend tracking (webhook secret)
RESEND_WEBHOOK_SECRET=

# Cron security
CRON_SECRET=                      # Random string, matches Vercel Cron config
```

---

## User Setup Required (Human Actions)

These steps require human action in external dashboards — Claude cannot complete them:

### Google (Gmail + Calendar)
1. **Google Cloud Console:** Enable Gmail API and Google Calendar API for your project
2. **OAuth Consent Screen:** Add scopes: `gmail.readonly`, `gmail.send`, `calendar.readonly`
3. **Pub/Sub:** Create a topic named `gmail-notifications`. Create a push subscription pointing to `{APP_URL}/api/v1/integrations/gmail/webhook`. Grant `pubsub@system.gserviceaccount.com` Pub/Sub Publisher role.
4. **OAuth Credentials:** Add `{APP_URL}/api/v1/integrations/gmail/callback` as an authorized redirect URI

### Microsoft (Outlook + O365 Calendar)
1. **Azure App Registration:** Create app registration at `portal.azure.com`
2. **API Permissions:** Add delegated permissions: `Mail.Read`, `Mail.Send`, `Calendars.Read`, `offline_access`
3. **Redirect URIs:** Add `{APP_URL}/api/v1/integrations/outlook/callback`

### Zoom
1. **Zoom Marketplace:** Create a Server-to-Server OAuth app
2. **Scopes:** `cloud_recording:read:recording`, `cloud_recording:read:list_recordings`
3. **Event Subscriptions:** Add `recording.completed` event, set URL to `{APP_URL}/api/v1/integrations/zoom/webhook`

### AssemblyAI
1. Sign up at `assemblyai.com`, copy API key to `ASSEMBLYAI_API_KEY`

### Proxycurl
1. Sign up at `proxycurl.com`, copy API key to `PROXYCURL_API_KEY`

---

## Output

After each plan is completed by an executor, create:
`.planning/phases/02/{02-NN}-SUMMARY.md` with:
- What was built
- Files modified
- Any deviations from the plan
- Verification results

After all plans complete, update `.planning/ROADMAP.md` Phase 2 status to reflect completed plans.
