# Architecture Research

**Domain:** AI-driven CRM — proactive automation, signal processing, multi-channel integration, document generation
**Researched:** 2026-03-10
**Confidence:** HIGH (codebase examined directly; patterns drawn from established CRM/AI architecture knowledge and existing service structure)

---

## Standard Architecture for AI-Driven CRM

### System Overview

The evolution from reactive to proactive AI requires adding three new architectural layers on top of the existing foundation: a signal ingestion layer, a background processing layer, and an AI action engine.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL SIGNAL SOURCES                           │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│  │  Gmail/O365  │ │Google/O365   │ │  LinkedIn    │ │  Zoom/Phone  │   │
│  │  (email)     │ │  Calendar    │ │  (social)    │ │  (telephony) │   │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘   │
└─────────┼────────────────┼────────────────┼────────────────┼────────────┘
          │ webhooks/      │ webhooks/       │ webhooks/      │ webhooks/
          │ polling        │ polling         │ polling        │ callbacks
┌─────────▼────────────────▼────────────────▼────────────────▼────────────┐
│                       INTEGRATION CONNECTORS                              │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  /api/v1/integrations/[provider]/webhook  (inbound webhook layer)  │  │
│  │  /api/v1/integrations/[provider]/connect  (OAuth connect flow)     │  │
│  │  services/integrations/[provider].ts       (per-provider adapter)  │  │
│  └────────────────────────────┬───────────────────────────────────────┘  │
└───────────────────────────────┼─────────────────────────────────────────┘
                                │ normalize → enqueue
┌───────────────────────────────▼─────────────────────────────────────────┐
│                        SIGNAL EVENT BUS                                   │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  signal_events table (PostgreSQL)                                   │  │
│  │  type: email_opened | email_received | stage_changed | meeting_held │  │
│  │  payload: {recordId, workspaceId, metadata}                         │  │
│  └────────────────────────────┬───────────────────────────────────────┘  │
└───────────────────────────────┼─────────────────────────────────────────┘
                                │ polled by
┌───────────────────────────────▼─────────────────────────────────────────┐
│                      BACKGROUND JOB PROCESSOR                            │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  job_queue table (PostgreSQL — pg-boss pattern)                     │  │
│  │  Job types:                                                         │  │
│  │    signal_evaluate   → score signal, determine if action needed     │  │
│  │    ai_generate       → call LLM, produce asset draft                │  │
│  │    email_send        → dispatch outbound email via provider         │  │
│  │    email_sync        → pull new messages from Gmail/O365            │  │
│  │    calendar_sync     → pull meetings from Google/O365 Calendar      │  │
│  │    transcript_ingest → process Zoom/call recording                  │  │
│  └────────────────────────────┬───────────────────────────────────────┘  │
└───────────────────────────────┼─────────────────────────────────────────┘
                                │ results stored as
┌───────────────────────────────▼─────────────────────────────────────────┐
│                    AI ACTION ENGINE (existing + extended)                 │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  Proactive triggers:                                                │  │
│  │    crm-events.ts (existing) → extend with richer context            │  │
│  │    automation-engine.ts (new) → evaluate rules → dispatch jobs      │  │
│  │                                                                     │  │
│  │  Document generators (new services):                                │  │
│  │    services/documents/proposal.ts  → proposal drafts               │  │
│  │    services/documents/brief.ts     → opportunity/meeting briefs     │  │
│  │    services/documents/followup.ts  → post-meeting follow-ups        │  │
│  │    services/documents/battlecard.ts → competitive intel             │  │
│  │    services/documents/contract.ts  → SOW/contract generation        │  │
│  └────────────────────────────┬───────────────────────────────────────┘  │
└───────────────────────────────┼─────────────────────────────────────────┘
                                │ stored in
┌───────────────────────────────▼─────────────────────────────────────────┐
│                    EXISTING CORE (foundation stays unchanged)             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│  │  EAV Records  │ │   AI Chat    │ │  Agent Chs   │ │  Notes/Tasks │   │
│  │  + Query      │ │  (OpenRouter)│ │  (channels)  │ │  + Activity  │   │
│  │  Builder      │ │  + Tools     │ │              │ │  Timeline    │   │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

| Component | Responsibility | Talks To |
|-----------|---------------|----------|
| Integration Connectors | Receive inbound webhooks from Gmail, Calendar, LinkedIn, Zoom. Handle OAuth connect/callback flows. Normalize external events into internal signal format. | Signal Event Bus, Integration Credentials table |
| Integration Credentials | Store per-workspace OAuth tokens (access + refresh), provider metadata. Workspace-scoped. | Database only |
| Signal Event Bus | Ordered, persistent record of all external signals and internal CRM events (stage changes, record creation). Acts as audit log and trigger source. | Job Queue (enqueues evaluation jobs), Records table |
| Background Job Queue | PostgreSQL-backed job queue (pg-boss pattern). Owns retry logic, failure handling, dead-letter. Runs within Next.js API route handlers triggered by Vercel Cron. | Signal Event Bus, AI Action Engine, Integration Adapters |
| Automation Engine | Rule evaluator. Given a signal, determines which automation(s) should fire. Rules stored per-workspace. Enqueues `ai_generate` or `email_send` jobs. | Job Queue, Automation Rules table, Records |
| AI Action Engine | Calls OpenRouter with deal context + template instruction. Returns structured draft (markdown or JSON). Stores draft in `ai_drafts` table. Posts to agent channels. | OpenRouter (via existing ai-chat.ts), Records, Notes, Agent Channels |
| Document Generators | Specialized prompts for proposal, brief, follow-up, battlecard, contract. Each assembles context (deal data, company data, contact data, notes) then calls AI. | Records service, Notes service, OpenRouter |
| Activity Timeline | Unified chronological log of all touchpoints: emails sent/received, calls, meetings, stage changes, AI actions. Replaces manual activity logging. | Signal Event Bus, Records, Integrations |
| Lead Scoring | Aggregate engagement signals into a score per contact/deal. Recalculated on signal events. Stored as EAV attribute on record. | Signal Event Bus, Records service |
| Approval Workflows | State machine for discount/contract approvals. States: `pending`, `approved`, `rejected`. Notifies stakeholders. Unblocks deal progression. | Records (status attribute), Notifications, Agent Channels |
| Analytics / Forecasting | Read-only queries over closed deals and pipeline data. Win/loss patterns, rep coaching, pipeline forecast. Presented as dashboards. | Records (read-only), Record Values |
| Inbound Lead Capture | Web form submission handler. Email-to-lead parser. Creates/updates People and Company records. Fires signal event. | Records service, Signal Event Bus |

---

## Recommended Project Structure (additions to existing)

```
apps/web/src/
├── services/
│   ├── integrations/           # Per-provider adapters
│   │   ├── gmail.ts            # Gmail API: OAuth, watch(), sync, send
│   │   ├── outlook.ts          # Microsoft Graph: OAuth, subscribe, sync, send
│   │   ├── google-calendar.ts  # Google Calendar: OAuth, watch, sync
│   │   ├── outlook-calendar.ts # Microsoft Graph calendar
│   │   ├── linkedin.ts         # LinkedIn API: profile lookup, activity
│   │   └── zoom.ts             # Zoom: recording webhooks, transcript fetch
│   ├── documents/              # AI document generators
│   │   ├── proposal.ts         # Proposal/deck generation
│   │   ├── brief.ts            # Opportunity & meeting prep briefs
│   │   ├── followup.ts         # Post-meeting follow-up drafts
│   │   ├── battlecard.ts       # Competitive intelligence
│   │   └── contract.ts         # SOW/contract generation
│   ├── automation-engine.ts    # Rule evaluation → job dispatch
│   ├── signals.ts              # Signal event write/read helpers
│   ├── job-queue.ts            # Job enqueue/dequeue/ack helpers
│   ├── lead-scoring.ts         # Engagement score calculator
│   ├── activity-timeline.ts    # Unified timeline query
│   └── email-sequences.ts      # Sequence scheduling and step execution
├── app/api/v1/
│   ├── integrations/
│   │   ├── gmail/
│   │   │   ├── connect/route.ts     # Initiate OAuth
│   │   │   ├── callback/route.ts    # OAuth callback
│   │   │   ├── webhook/route.ts     # Gmail push notifications
│   │   │   └── disconnect/route.ts  # Revoke tokens
│   │   ├── outlook/...             # Same pattern
│   │   ├── google-calendar/...     # Same pattern
│   │   ├── zoom/...                # Same pattern
│   │   └── linkedin/...            # Same pattern
│   ├── automations/
│   │   ├── route.ts                # CRUD for automation rules
│   │   └── [id]/route.ts
│   ├── documents/
│   │   ├── generate/route.ts       # Trigger document generation
│   │   └── [id]/route.ts           # Fetch/update generated docs
│   ├── sequences/
│   │   ├── route.ts                # CRUD for email sequences
│   │   └── [id]/
│   │       ├── route.ts
│   │       └── enroll/route.ts     # Enroll record in sequence
│   ├── signals/
│   │   └── route.ts                # Query signal history for a record
│   └── cron/
│       ├── sync/route.ts           # Cron: pull new emails/events
│       ├── sequences/route.ts      # Cron: advance sequence steps
│       └── scores/route.ts         # Cron: recalculate lead scores
└── db/schema/
    ├── integrations.ts             # oauth_connections, sync_cursors
    ├── signals.ts                  # signal_events
    ├── job-queue.ts                # jobs (pg-boss pattern)
    ├── documents.ts                # ai_drafts
    ├── sequences.ts                # sequences, sequence_steps, sequence_enrollments
    └── automations.ts              # automation_rules
```

### Structure Rationale

- **services/integrations/:** One file per external provider. Each exports `connect()`, `syncEmails()`, `sendEmail()`, `watchInbox()` functions. Route handlers are thin — they call into these. This means adding a new provider (e.g., Outlook) is a new file, not scattered changes.
- **services/documents/:** Each document type has its own context-assembly and prompt logic. They share a common `callLLM(prompt, config)` helper from the existing `ai-chat.ts` but have distinct schemas for what data to assemble.
- **app/api/v1/cron/:** Vercel Cron-compatible endpoints. Each is a simple GET handler that processes a batch of pending work. Authorization checked via `CRON_SECRET` header (Vercel best practice).
- **db/schema/:** One schema file per new domain. Keeps migration history clean and reviewable.

---

## Architectural Patterns

### Pattern 1: Transactional Outbox (Signal Event Bus)

**What:** When a CRM event occurs (stage changed, record created, email received), write a row to `signal_events` in the same database transaction as the record mutation. A background job then reads unprocessed signals and dispatches work.

**When to use:** Any time a state change should trigger automation. Avoids calling async side-effects inline in request handlers where failures lose the event.

**Trade-offs:** Adds latency (event processed within seconds, not milliseconds). Requires a polling job or LISTEN/NOTIFY. Gain: events are never lost, retryable, auditable.

**Example:**
```typescript
// In records.ts updateRecord():
await db.transaction(async (tx) => {
  await tx.update(records).set(updated).where(eq(records.id, recordId));
  await tx.insert(signalEvents).values({
    workspaceId,
    type: "stage_changed",
    recordId,
    payload: { from: oldStage, to: newStage },
    processedAt: null,
  });
});
```

### Pattern 2: PostgreSQL-Backed Job Queue (pg-boss pattern)

**What:** Store jobs as rows in a `jobs` table with status (`pending`, `running`, `completed`, `failed`), retry count, and scheduled time. A cron-triggered worker polls for pending jobs, claims them with a status update (optimistic locking), executes them, then marks complete.

**When to use:** Background tasks in a PostgreSQL-only stack. Avoids Redis/BullMQ/SQS dependency. Works with Vercel Cron (HTTP GET every minute triggers the worker).

**Trade-offs:** Not real-time (up to 60s latency with minute-granularity cron). Cannot do sub-second scheduling. Suitable for async AI generation, email sends, and sync tasks where near-real-time is fine. The pg-boss library implements this pattern well and can be added as a dependency.

**Example:**
```typescript
// Enqueue job
await db.insert(jobs).values({
  workspaceId,
  type: "ai_generate",
  payload: { recordId, documentType: "proposal" },
  status: "pending",
  runAt: new Date(),
});

// Worker (called by cron route)
const batch = await db
  .update(jobs)
  .set({ status: "running", startedAt: new Date() })
  .where(and(eq(jobs.status, "pending"), lte(jobs.runAt, new Date())))
  .returning();

for (const job of batch) {
  try {
    await processJob(job);
    await db.update(jobs).set({ status: "completed" }).where(eq(jobs.id, job.id));
  } catch (err) {
    await db.update(jobs).set({
      status: job.retryCount < 3 ? "pending" : "failed",
      retryCount: job.retryCount + 1,
      runAt: addMinutes(new Date(), 5 * (job.retryCount + 1)),
    }).where(eq(jobs.id, job.id));
  }
}
```

### Pattern 3: Provider Adapter Pattern (Integration Connectors)

**What:** Each external provider (Gmail, Outlook, Zoom, etc.) is wrapped in a single adapter service that normalizes its API into the internal domain model. All callers interact with the adapter, never directly with the provider SDK.

**When to use:** Any time there are 2+ email providers, or the API might change. Keeps swap cost low.

**Trade-offs:** Adds one layer of indirection. Worth it because Gmail API and Microsoft Graph have different token refresh flows, different webhook shapes, and different sync cursor patterns.

**Example:**
```typescript
// services/integrations/gmail.ts
export interface EmailMessage {
  id: string; externalId: string; from: string; to: string[];
  subject: string; bodyHtml: string; bodyText: string;
  receivedAt: Date; threadId: string;
}

export async function syncNewMessages(
  workspaceId: string, connectionId: string
): Promise<EmailMessage[]> { /* Gmail-specific impl */ }

// services/integrations/outlook.ts — same interface, different impl
export async function syncNewMessages(...): Promise<EmailMessage[]> { /* Graph API impl */ }
```

### Pattern 4: Document Generation via Context Assembly

**What:** Before calling an LLM to generate a document (proposal, brief, etc.), assemble all relevant context from the EAV store: deal attributes, linked company data, linked contacts, recent notes, stage history, email thread excerpts. Pass this as structured context in the system prompt, then use a document-type-specific instruction prompt.

**When to use:** All AI document generation. The quality of LLM output is proportional to the quality of context provided.

**Trade-offs:** More database queries per generation call. Acceptable because generation is async (background job), not in a request-response cycle.

**Example:**
```typescript
// services/documents/proposal.ts
export async function generateProposal(
  workspaceId: string, dealId: string
): Promise<string> {
  const deal = await getRecord("deals", dealId);
  const company = await getRecord("companies", deal.values.company_id);
  const contacts = await listLinkedRecords("people", dealId);
  const notes = await getNotesForRecord(dealId);
  const recentEmails = await getEmailsForRecord(dealId, { limit: 5 });

  const context = assembleContext({ deal, company, contacts, notes, recentEmails });
  const prompt = `Based on the following CRM data, generate a professional proposal...

  ${context}`;

  const config = await getAIConfig(workspaceId);
  return callLLM(config, prompt);
}
```

### Pattern 5: Dual-Path AI Response (Proactive vs Interactive)

**What:** The existing AI system is interactive (user sends message, AI replies in chat). Proactive AI runs without a user prompt — triggered by events, outputs stored as agent channel messages or `ai_drafts`, surfaced in the UI as notifications. These two paths share the same LLM infrastructure but diverge at the trigger layer.

**When to use:** Proactive actions always use the background job path. Interactive chat stays on the SSE streaming path.

**Trade-offs:** Two code paths to maintain. The payoff is that proactive AI doesn't block the request cycle and can generate longer, richer content without timeout pressure.

```
Interactive path:
User message → SSE stream → tool calls → inline response in chat

Proactive path:
Signal event → job queue → AI generate → ai_drafts table → agent channel message → UI notification
```

---

## Data Flow

### Signal Flow: Email Received → Proactive Follow-Up Draft

```
Gmail webhook → /api/v1/integrations/gmail/webhook
    ↓
Verify signature + parse payload
    ↓
services/integrations/gmail.ts → fetchMessage(messageId)
    ↓
Normalize to EmailMessage + determine linked record (match by contact email)
    ↓
INSERT signal_events (type: "email_received", recordId, payload)
    ↓
INSERT jobs (type: "signal_evaluate", signalEventId)
    ↓
[async — Vercel Cron fires within 60s]
    ↓
/api/v1/cron/sync → claim job → automation-engine.ts evaluateSignal()
    ↓
Rule match: "email received on deal in Negotiation stage → generate follow-up"
    ↓
INSERT jobs (type: "ai_generate", documentType: "followup", recordId)
    ↓
[next cron tick]
    ↓
/api/v1/cron/sync → claim job → services/documents/followup.ts
    ↓
Assemble context (deal + contacts + email thread) → call OpenRouter
    ↓
INSERT ai_drafts (recordId, type: "followup", content: "...", status: "draft")
    ↓
postAgentMessage(dealsChannel, "I drafted a follow-up for [deal]. Review it here.")
    ↓
UI: agent channel shows notification → user clicks → sees draft → approves/edits → sends
```

### Signal Flow: Deal Stage Change → Proposal Generation

```
PATCH /api/v1/objects/deals/records/[id] (stage attribute changed)
    ↓
services/records.ts updateRecord() → detect stage change in changedFields
    ↓
handleRecordUpdated() (existing crm-events.ts, fire-and-forget)
    ↓ ALSO:
INSERT signal_events (type: "stage_changed", from: "Discovery", to: "Proposal")
INSERT jobs (type: "signal_evaluate")
    ↓
automation-engine.ts: rule "stage = Proposal → generate proposal draft"
    ↓
INSERT jobs (type: "ai_generate", documentType: "proposal", recordId)
    ↓
services/documents/proposal.ts → assemble context → call OpenRouter
    ↓
INSERT ai_drafts + notify rep via agent channel
```

### Email Sync Flow (Polling Pattern)

```
/api/v1/cron/sync (GET, fired by Vercel Cron every 5min)
    ↓
For each workspace with connected Gmail/O365:
    Load sync cursor (last processed historyId / deltaToken)
    Call provider API: fetch messages since cursor
    For each new message:
        Match sender to People record (by email attribute)
        INSERT email_messages (stored in integration tables, not EAV)
        INSERT signal_events (type: email_received | email_sent)
        UPDATE sync cursor
    ↓
Enqueue signal_evaluate jobs for new signal events
```

### OAuth Connect Flow

```
User clicks "Connect Gmail"
    ↓
GET /api/v1/integrations/gmail/connect
    ↓
Generate state token → store in session → redirect to Google OAuth URL
    ↓
User authorizes → Google redirects to /api/v1/integrations/gmail/callback?code=...
    ↓
Exchange code for access + refresh tokens
    ↓
INSERT oauth_connections (workspaceId, provider: "gmail", accessToken, refreshToken, expiresAt)
    ↓
Register Gmail push notification watch (POST gmail.users.watch)
    ↓
Redirect to settings page: "Gmail connected"
```

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k workspaces | Single PostgreSQL, pg-boss job queue, Vercel Cron — this is fine for launch |
| 1k-10k workspaces | Add connection pooling (PgBouncer). Job queue becomes the bottleneck — partition `jobs` table by workspace, increase cron frequency with multiple workers. Consider Redis for rate-limit tracking per integration provider. |
| 10k+ workspaces | External job queue (BullMQ + Redis or SQS). Dedicated worker process separate from Next.js. Read replicas for analytics queries. |

### Scaling Priorities

1. **First bottleneck:** Job queue under load — many workspaces, each with active integrations, generates high job volume. Fix: batch processing, table partitioning, dedicated worker.
2. **Second bottleneck:** OpenRouter API rate limits per API key — many concurrent AI generation jobs hit the same key. Fix: per-workspace API keys (already in place), request queuing with exponential backoff.
3. **Third bottleneck:** Gmail/O365 API rate limits — providers impose per-user and per-app quotas. Fix: sync cursor with delta queries (not full inbox scans), honor `Retry-After` headers, workspace-level token refresh queuing.

---

## Anti-Patterns

### Anti-Pattern 1: Inline AI Generation in Request Handlers

**What people do:** Call OpenRouter directly inside a POST handler when a deal stage changes — `await generateProposal(...)` inside the route.

**Why it's wrong:** Route handlers have a request timeout (Vercel default: 60s function timeout). LLM generation can take 30-90 seconds for complex documents. Users get 504s or partial results. There's no retry on failure.

**Do this instead:** The route handler enqueues a job and returns immediately (202 Accepted). The background worker does the generation. The result appears in the agent channel when done.

### Anti-Pattern 2: Storing Email Bodies in EAV record_values

**What people do:** Create a `body` attribute on a `People` object and store email content as a `text_value` per email.

**Why it's wrong:** Emails are append-only log data with large bodies, not structured CRM attributes. Querying the EAV model for email threads is inefficient. The `record_values` table is designed for sparse structured attributes, not for large text blobs at volume.

**Do this instead:** Store emails in a dedicated `email_messages` table linked to records by `record_id`. Add a `signal_events` row for each email. Query the `email_messages` table for thread views. The EAV model stores only derived metadata (engagement score, last_contacted_at).

### Anti-Pattern 3: Shared OAuth Token for All Workspaces

**What people do:** Use a single app-level Gmail OAuth credential to sync all workspaces.

**Why it's wrong:** Each rep has their own inbox. You need per-user (or per-workspace) OAuth tokens so that rep A's emails stay in rep A's workspace and rep B's stay in rep B's. App-level credentials can't differentiate senders.

**Do this instead:** Per-user OAuth: each workspace member connects their own Gmail account. Store `oauth_connections` scoped to `(workspaceId, userId, provider)`. Email sync runs per-connection.

### Anti-Pattern 4: Treating Proactive AI Outputs as Final

**What people do:** Have the AI generate an email sequence and immediately send it, or generate a proposal and attach it to the deal without a human review step.

**Why it's wrong:** AI hallucinations are real. Wrong pricing, wrong contact names, wrong competitor references. In sales, these errors are reputation-damaging. The architecture must have a human-in-the-loop gate for any customer-facing output.

**Do this instead:** All AI-generated content goes into `ai_drafts` with `status: "draft"`. The agent surfaces it to the rep ("I drafted a follow-up — want me to send it?"). Only after explicit approval (`status: "approved"`) does it dispatch to `email_send` job.

### Anti-Pattern 5: Rebuilding Chat Tool Infrastructure for Proactive Paths

**What people do:** Create a completely separate LLM calling layer for background automation, duplicating the tool definitions and prompt building that already exist.

**Why it's wrong:** The existing `ai-chat.ts` already has `callOpenRouter()`, `buildSystemPrompt()`, `getAIConfig()`, and tool infrastructure. Duplicating it creates drift.

**Do this instead:** Extract a shared `callLLM(workspaceId, messages, tools?)` helper that both the interactive chat path and background generation path use. Document generators call `callLLM` without tools (pure generation). Interactive chat calls it with the full tool set.

---

## Integration Points

### External Services

| Service | Integration Pattern | Auth | Key Constraints |
|---------|---------------------|------|-----------------|
| Gmail | Push notifications (watch API) + REST polling fallback | Per-user OAuth 2.0 (refresh token) | 7-day watch expiry, must re-register. 1B quota units/day per project. |
| Microsoft Graph (Outlook) | Change notifications (subscriptions) + delta queries | Per-user OAuth 2.0 (MSAL) | Subscription expiry 3 days (must renew). Delta tokens for efficient sync. |
| Google Calendar | Push notifications (watch) + Events list polling | Per-user OAuth 2.0 (same credential as Gmail if requested scope) | 7-day watch expiry. Same renewal pattern as Gmail. |
| O365 Calendar | Graph API subscriptions + delta | Per-user OAuth 2.0 | Same as Outlook email — unified Microsoft credential. |
| LinkedIn | Profile lookups via Sales Navigator API or People API | OAuth 2.0 (user-level) | API access gated — requires LinkedIn partnership or Sales Navigator license. This is the riskiest integration. |
| Zoom | Recording webhooks + transcript download | App-level OAuth (webhook credential) | Webhooks deliver `recording.completed` events. Transcript requires `cloud_recording:read` scope. |
| OpenRouter | HTTP POST for LLM inference | Per-workspace API key (existing) | Rate limits vary by model. Implement retry with exponential backoff. |
| Resend | Transactional email (CRM-to-contact sends) | API key | Already optional dep for system email. Extend for outbound sales emails. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Route handlers ↔ Job Queue | Direct DB insert (same PostgreSQL) | No message broker needed at this scale |
| Job Queue ↔ Integration Adapters | Function call within worker | Worker calls adapter.syncMessages() per job |
| Integration Adapters ↔ Signal Event Bus | Direct DB insert | Adapter inserts signal_events after normalizing |
| Automation Engine ↔ Document Generators | Function call within worker | Engine calls documents/proposal.ts etc. |
| Document Generators ↔ AI Chat service | Shared callLLM() helper | Not duplicated — extracted from ai-chat.ts |
| Document Generators ↔ Agent Channels | postAgentMessage() (existing) | Aria posts draft notification to deals channel |
| Approval Workflows ↔ Records | Record status attribute update | Approval state stored as EAV status attribute |
| Activity Timeline ↔ Signal Events | SELECT query on signal_events | Timeline is a read view — no write coupling |

---

## Suggested Build Order

This order respects dependency chains and delivers user value incrementally:

**1. Background Job Infrastructure (enables everything else)**
Jobs table, worker cron endpoint, retry logic. No features yet — but all async work depends on this foundation. Build first so every subsequent phase can use it.

**2. Email Integration (highest signal value, most-used channel)**
Gmail OAuth connect, webhook receive, inbox sync, auto-log to activity timeline, email-to-record matching. This delivers real value immediately (no more manual logging) and provides the signal source for proactive automation.

**3. Signal Event Bus + Automation Engine (the "proactive" layer)**
signal_events table, automation rule evaluation. Wire stage-change events through the engine. First automation: deal enters Proposal stage → enqueue proposal generation. This is the architectural inflection point from reactive to proactive.

**4. AI Document Generators (the value delivery of proactive AI)**
Proposal, opportunity brief, meeting prep brief, follow-up draft. Each is a document generator service + ai_drafts table + agent channel notification. Build on top of the automation engine.

**5. Calendar Integration (meeting context for document generation)**
Google Calendar sync, meeting auto-log to activity timeline. Enables meeting prep briefs (pre-meeting) and follow-up drafts (post-meeting transcript). Depends on document generators already existing.

**6. Inbound Lead Capture (top of funnel)**
Web forms, email-to-lead parsing. Creates records automatically, fires signal events. Depends on signal event bus.

**7. Email Sequences (outbound automation)**
Sequence CRUD, step scheduling, enrollment, send execution. Depends on email integration and job queue. Approval gate required before any send.

**8. Telephony Integration (Zoom/call recording)**
Webhook receive, transcript fetch, auto-summarization, call auto-log. Depends on document generators (call summary = a document type).

**9. LinkedIn Integration (enrich + signal)**
Profile lookup, connection status. Build last — LinkedIn API access is the most uncertain (requires partnership or Sales Navigator). Architecture supports it but shouldn't block other phases.

**10. Analytics + Forecasting (requires data accumulation)**
Win/loss analysis, rep coaching, pipeline forecast. These are read-only query layers over existing data. Build last because they require months of deal data to be meaningful.

---

## Sources

- Codebase direct examination: `services/ai-chat.ts`, `services/crm-events.ts`, `services/agent-channels.ts`, `db/schema/chat.ts`, `db/schema/records.ts`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/INTEGRATIONS.md` — HIGH confidence
- Next.js route handler documentation (official, verified 2026-02-27): background task patterns via cron + route handlers — HIGH confidence
- Vercel Cron Jobs documentation (official, current): scheduling pattern, HTTP GET trigger, `vercel.json` config — HIGH confidence
- Gmail API push notification pattern (knowledge base, August 2025 cutoff): `users.watch()`, 7-day renewal, historyId cursor — MEDIUM confidence (verify current quota limits and watch expiry duration before implementation)
- Microsoft Graph change notifications pattern (knowledge base): subscription expiry, delta queries for O365 — MEDIUM confidence (verify current subscription renewal requirements)
- pg-boss PostgreSQL job queue pattern (knowledge base): job table schema, optimistic locking, retry — MEDIUM confidence (verify current API surface before adopting as dependency)
- LinkedIn API access requirements (knowledge base): Sales Navigator dependency, partnership gating — LOW confidence (verify current API availability — LinkedIn frequently changes access policies)

---

*Architecture research for: AI-driven CRM — proactive automation, signal processing, multi-channel integration*
*Researched: 2026-03-10*
