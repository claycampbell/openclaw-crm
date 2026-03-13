# Architecture Patterns

**Domain:** AI-first CRM (brownfield v2.0 feature integration)
**Researched:** 2026-03-11
**Confidence:** HIGH (based on direct codebase analysis of 27 schema files, 44 services, 99 API endpoints)

---

## Existing Architecture Overview

The codebase follows a clean layered architecture that all new features must respect:

```
[Browser] --> [Next.js Middleware] --> [API Route Handler]
                                          |
                                    [getAuthContext()]
                                          |
                                    [Service Layer]
                                          |
                                    [Drizzle ORM]
                                          |
                                    [PostgreSQL]
```

**Key invariants:**
- Every API route calls `getAuthContext(req)` first for auth + workspace resolution
- Every database query is scoped by `workspaceId` (multi-tenancy)
- Services are the business logic layer -- called by both API routes and server components
- The typed EAV pattern (`objects` -> `attributes` -> `records` -> `record_values`) is the core data model for all CRM entities
- Background work enqueued to `background_jobs` table, polled by cron endpoint
- Signal events written to `signal_events` table for automation triggers
- AI generation produces drafts in `generated_assets` table for human review

---

## How New Features Integrate with Existing Architecture

### Component 1: Job Execution Engine

**What exists:**
- `background_jobs` table with status enum (pending/running/completed/failed/cancelled), retry count, scheduled `runAt`
- Two job queue implementations: `services/job-queue.ts` (with `registerJobHandler`/`executeJob`/`processJobs`) and `lib/job-queue.ts` (simpler `enqueueJob` used by automation-engine)
- `instrumentation.ts` registers two handlers: `signal_evaluate` and `ai_generate` (placeholder)
- Cron endpoint at `GET /api/v1/cron/jobs` gated by `CRON_SECRET` Bearer token

**Critical bug found:** The `processJobs()` function in `services/job-queue.ts` (lines 96-101) does NOT call `executeJob()`. It marks every job as "completed" without invoking the registered handler. This means the entire job system is a no-op -- jobs are enqueued and silently discarded.

**Integration fix:**
```typescript
// In processJobs(), replace the auto-complete with:
const handled = await executeJob(job.type, {
  ...job.payload as Record<string, unknown>,
  workspaceId: job.workspaceId,
});
if (!handled) {
  console.warn(`[jobs] No handler for job type: ${job.type}`);
}
```

**Additional fixes needed:**
- Add `FOR UPDATE SKIP LOCKED` to the job claim query to prevent double-processing when multiple cron hits overlap
- Consolidate the two `enqueueJob` functions (lib vs service) -- the automation engine imports from `@/lib/job-queue` which has a different signature than `services/job-queue.ts`
- The `retries` column is stored as `text` (not integer) -- works but should be handled carefully in comparisons

**Communicates with:** All components enqueue jobs here. Cron endpoint triggers processing.

**Data flow:**
```
[Any component] --> enqueueJob() --> background_jobs table
                                          |
[Cron GET /api/v1/cron/jobs] --> processJobs() --> executeJob() --> registered handler
```

---

### Component 2: Signal-Automation Pipeline

**What exists:**
- `signal_events` table (immutable log with workspace_id, record_id, type, provider, payload, actor_id)
- `processed_signals` table (deduplication by provider + signal_id unique index)
- `writeSignalEvent()` in `services/signals.ts` -- fire-and-forget insert
- `automation_rules` table with `trigger_type`, `conditions` JSONB, `action_type` enum, `action_payload` JSONB
- `automation-engine.ts` with hardcoded if/else rules (stage_changed -> proposal, meeting_ended -> followup, record_created -> opportunity_brief, note_added -> competitor detection, email_received -> sequence stop)
- `crm-events.ts` that posts to agent channels and triggers close flow / approval evaluation

**Gap identified:** The `automation_rules` table exists with a rich condition/action model, but `evaluateSignalForGeneration()` uses hardcoded logic and never queries this table. The two systems are disconnected.

**Integration approach:**
1. Keep existing hardcoded rules as "system rules" (always-on, not editable)
2. Add a second evaluation pass that queries `automation_rules`:
   ```sql
   SELECT * FROM automation_rules
   WHERE workspace_id = $1
     AND trigger_type = $2
     AND enabled = true
   ```
3. Evaluate `conditions` JSONB against signal payload (simple field/operator/value matching)
4. Dispatch `action_type` with merged `action_payload` to job queue
5. New action types to add to `automationActionEnum`: `send_webhook`, `update_field`, `assign_owner`

**Signal emission gap:** `writeSignalEvent()` writes to the table but does NOT enqueue a `signal_evaluate` job. The automation engine only runs if something explicitly enqueues that job. This means signals are logged but never automatically evaluated unless a caller also enqueues the job.

**Fix:** After `writeSignalEvent()`, auto-enqueue a `signal_evaluate` job:
```typescript
export async function writeSignalEvent(input: SignalEventInput): Promise<string> {
  const [event] = await db.insert(signalEvents).values({...}).returning({ id: signalEvents.id });
  await enqueueJob("signal_evaluate", { signalEventId: event.id }, { workspaceId: input.workspaceId });
  return event.id;
}
```

**Data flow:**
```
[Integration webhook / CRM CRUD] --> writeSignalEvent() --> signal_events + signal_evaluate job
                                                                 |
                                                       evaluateSignalForGeneration()
                                                            /            \
                                                [hardcoded rules]    [automation_rules query]
                                                            \            /
                                                          enqueueJob()
```

---

### Component 3: AI Asset Generation Pipeline

**What exists:**
- `generated_assets` table with 11 asset types, 7 status values, both `content` (markdown) and `structuredContent` (JSON) fields, approval tracking (approvedBy, rejectedBy, rejectionNote)
- `generated-assets.ts` service with createDraft, listDrafts, getAsset, approveDraft, rejectDraft
- Placeholder `ai_generate` handler in `instrumentation.ts` that creates "[Placeholder draft]" strings in non-production
- OpenRouter integration in `ai-chat.ts` with workspace-configurable API key and model
- `services/documents/` directory already exists with `asset-registry.ts`
- `AiGeneratePayload` type in `lib/job-queue.ts` defines: documentType, recordId, contextTier, plus optional meetingId, triggerType, noteText, competitorName, enrollmentId

**What is missing:** Actual generation logic. No prompt templates, no context assembly, no OpenRouter call in the generation path.

**Integration approach:**

Create `services/generators/` with one file per asset type. Each generator follows this pattern:

```typescript
// services/generators/proposal.ts
export async function generateProposal(
  workspaceId: string,
  recordId: string,
  tier: "light" | "full"
): Promise<void> {
  // 1. Assemble context from EAV
  const deal = await getRecord(workspaceId, recordId);
  const notes = tier === "full" ? await getNotesForRecord(recordId) : [];
  const timeline = tier === "full" ? await getActivityTimeline(recordId) : [];

  // 2. Build prompt from template
  const prompt = buildProposalPrompt({ deal, notes, timeline });

  // 3. Call OpenRouter (non-streaming -- background job, no timeout pressure)
  const config = await getWorkspaceAIConfig(workspaceId);
  const result = await callOpenRouter(config, prompt);

  // 4. Store as draft
  await createDraft({
    workspaceId,
    recordId,
    assetType: "proposal",
    content: result.markdown,
    structuredContent: result.structured,
    modelUsed: config.model,
    promptVersion: "v1",
  });

  // 5. Notify deal owner
  await createNotification(workspaceId, dealOwnerId, {
    type: "asset_generated",
    title: "Proposal draft ready for review",
    url: `/inbox?asset=${assetId}`,
  });
}
```

**Build order within this component:** opportunity_brief first (simplest, light context), then followup (triggered by meeting_ended), then proposal (full context), then battlecard (needs competitor detection integration).

**Key decision:** Extract `callOpenRouter()` from `ai-chat.ts` into a shared utility. The chat service uses streaming; generators use non-streaming. Both share the same workspace config resolution.

---

### Component 4: Integration Sync (Gmail/Outlook/Calendar)

**What exists:**
- Full OAuth flows for Gmail, Outlook, Google Calendar, Outlook Calendar, Zoom, LinkedIn
- `integration_tokens` table with AES-256-GCM encrypted tokens, `syncCursor`, `providerMetadata`, `lastSyncAt`
- `email_messages` table with deduplication by (workspace_id, provider, external_id), thread_id, direction, tracking fields
- `calendar_events` table with lifecycle flags (prepJobEnqueued, endedSignalEmitted)
- Token manager (`token-manager.ts`) with store/get/revoke/refresh
- Gmail service with OAuth, scope requesting (readonly + send + modify + calendar), `initiateOAuth`, `handleCallback`
- Cron endpoints at `/api/v1/cron/gmail-sync`, `/api/v1/cron/outlook-sync`, `/api/v1/cron/calendar-sync`
- `markSignalProcessed()` for webhook deduplication

**What is missing:** The sync cron endpoints need to iterate active integrations and perform delta sync. The Gmail service has OAuth but the delta sync function body needs implementation.

**Integration approach for Gmail sync:**
```
1. Query integration_tokens WHERE provider = 'gmail' AND status = 'active'
2. For each token:
   a. refreshToken() if expired
   b. Call Gmail history.list(startHistoryId = syncCursor)
   c. For each new message:
      - Fetch message metadata (not full body -- store snippet only per schema design)
      - Deduplicate via processed_signals (provider: 'gmail', signalId: messageId)
      - Upsert into email_messages
      - matchEmailToRecord() -- query record_values for email attribute matching sender
      - writeSignalEvent("email_received", { recordId, fromEmail, subject })
   d. Update syncCursor to new historyId
   e. Update lastSyncAt
```

**Email-to-record matching** uses the existing EAV query pattern:
```typescript
// Find People/Companies records with matching email attribute
const matches = await db
  .select({ recordId: recordValues.recordId })
  .from(recordValues)
  .innerJoin(attributes, eq(attributes.id, recordValues.attributeId))
  .where(and(
    eq(attributes.type, "email"),
    eq(recordValues.textValue, senderEmail),
    // scope to workspace via join to records
  ));
```

**Calendar event processing:** The `calendar_events` table has `endedSignalEmitted` flag. A cron job (or part of calendar sync) queries events where `end_at < NOW() AND ended_signal_emitted = false`, emits `meeting_ended` signals, sets the flag. This triggers the automation engine to generate meeting follow-ups.

---

### Component 5: Analytics Engine

**What exists:** Four analytics services: `win-loss.ts`, `rep-coaching.ts`, `forecasting.ts`, `next-best-action.ts`. Analytics API routes. Dashboard pages with data threshold gates.

**Integration approach:** Analytics are pure read-path -- SQL aggregation queries against existing tables. No new tables needed.

- **Win/loss:** Aggregate deals by outcome (won/lost stage), group by time period, rep, amount range. Query `records` + `record_values` for deal stage + amount + owner.
- **Forecasting:** Pipeline weighting by stage. Sum deal amounts weighted by stage probability. Query current deal records.
- **Coaching:** Activity pattern analysis. Count signal_events by type per rep per time period. Compare to won-deal benchmarks.
- **Activity scoring** (see Component 7) feeds into coaching and hot leads.

For expensive queries, consider a `analytics_cache` pattern: store computed results as JSONB keyed by (workspace_id, report_type, date_range), refresh on demand or via cron.

---

### Component 6: Email Compose and Thread View

**What exists:**
- `email_messages` table with thread_id, direction, snippet, from/to/cc, tracking fields
- Gmail service with send capability (`gmail.users.messages.send` scope requested)
- Integration tokens with send permissions
- Record detail pages at `/(dashboard)/objects/[slug]/[id]`

**Integration approach:**
- Add "Email" tab to record detail page, showing threads linked via `email_messages.recordId`
- Thread view: group by `thread_id`, order by `receivedAt`, display with collapsible message cards
- Full email body fetched on-demand from provider API (only snippet stored locally -- per schema design decision in `email_messages.snippet` comment)
- Compose form hits new `POST /api/v1/records/[id]/email` route:
  1. Resolve user's integration token for Gmail/Outlook
  2. Send via provider API
  3. Insert outbound record in `email_messages` with direction: "outbound"
  4. `writeSignalEvent("email_sent", { recordId, toEmail, subject })`

**Dependency:** Requires integration sync (Component 4) to be working for inbound email display. But compose can work independently if the user has a connected Gmail/Outlook token.

---

### Component 7: Activity Scoring and Hot Leads

**What exists:**
- `lead_score` job type already dispatched by automation-engine when People/Contacts records are created
- Signal events capture all activity types (email_received, meeting_ended, stage_changed, note_added)
- EAV model supports adding computed attributes to records

**Integration approach:**

Two options for score storage:

**Option A (recommended): EAV attribute.** Add a system-managed "Activity Score" attribute (type: number) to People and Deals objects. Scores are stored in `record_values.number_value`. This means existing filtering, sorting, and table display work on scores automatically -- no new UI needed to display scores in record tables.

**Option B: Dedicated table.** New `record_scores` table. Cleaner separation but requires custom display integration everywhere scores appear.

**Scoring algorithm:**
```
score = sum of weighted signal events in trailing 30 days:
  email_received: 5 points
  email_sent: 3 points (we initiated)
  email_opened: 2 points
  email_clicked: 4 points
  meeting_held: 10 points
  note_added: 2 points
  stage_changed: 8 points
  call_recorded: 7 points
```

**Recalculation trigger:** Enqueue `lead_score` job on relevant signal events. The handler queries `signal_events WHERE record_id = X AND created_at > 30_days_ago`, computes weighted sum, writes to EAV attribute.

**Hot leads dashboard:** Query records ordered by score attribute descending. Use existing `query-builder.ts` filtering infrastructure.

---

### Component 8: Team Collaboration (@mentions, Comments, Saved Views)

**What exists:**
- Chat channels with agent messages (conversations + messages tables)
- Notifications table targeting individual users
- Notes on records (TipTap rich text)
- Workspace members with roles

**New tables needed:**

```sql
-- Comments: lightweight, @mentionable, threaded
comments (id, workspace_id, record_id, user_id, content, parent_id, mentions JSONB, created_at)

-- Saved views: persisted filter/sort/column configurations
saved_views (id, workspace_id, object_id, user_id, name, filters JSONB, sort JSONB, columns JSONB, is_shared BOOLEAN, created_at)
```

**Integration approach:**
- **Comments** are distinct from Notes. Notes are rich-text documents (TipTap). Comments are short threaded text with @mentions. Both appear on the record detail page in separate sections.
- **@mentions:** Parse `@username` in comment text, resolve to user IDs, create notification rows. Frontend uses a mention autocomplete (user list from workspace members).
- **Saved views:** The existing `FilterGroup`/`FilterCondition` types from `packages/shared` define the filter JSONB shape. The saved_views table stores these plus sort order and visible columns. UI adds "Save View" / "Load View" controls to record table pages.
- No real-time collaboration needed (out of scope). Polling-based notification check is sufficient.

---

### Component 9: Outbound Webhooks

**What exists:** No outbound webhook infrastructure. Integration webhook endpoints exist only for INBOUND webhooks (Gmail Pub/Sub, Zoom recording callbacks).

**New tables needed:**

```sql
-- Webhook subscriptions
webhook_subscriptions (id, workspace_id, url, secret, events TEXT[], enabled, created_by, created_at)

-- Delivery log with retry tracking
webhook_deliveries (id, subscription_id, event_type, payload JSONB, status, response_code, attempts, next_retry_at, created_at)
```

**Integration approach:**
- Add `send_webhook` to `automationActionEnum` for rule-driven webhooks
- Also add direct event dispatch: in `crm-events.ts`, after record create/update, check `webhook_subscriptions WHERE workspace_id = X AND events @> ARRAY[event_type] AND enabled = true`
- Enqueue `webhook_send` job for each matching subscription
- Webhook send handler: POST JSON payload to URL, include HMAC-SHA256 signature in `X-Webhook-Signature` header (using subscription.secret), record response in `webhook_deliveries`
- Retry: 3 attempts with exponential backoff (1min, 5min, 30min)
- Admin UI at Settings > Webhooks for subscription CRUD

---

### Component 10: Visual Workflow Automation Builder

**What exists:** `automation_rules` table with CRUD-ready schema. API routes at `/api/v1/automations`. Automation engine evaluates rules on signal events.

**Integration approach:** This is primarily a frontend feature. The backend already supports the data model.

- Build a step-based UI: (1) trigger selector (pick signal type from dropdown), (2) condition builder (field/operator/value rows), (3) action selector (pick from `automationActionEnum`)
- Use a simple linear flow UI (trigger -> filter -> action) rather than a full node-graph editor. The existing `automation_rules` schema supports single-trigger, single-action rules. This is sufficient for v2.0.
- If multi-step workflows are needed later, add a `workflow_steps` table chaining rules. Defer this complexity.
- Frontend needs: list rules, create, update, delete, toggle enabled -- all standard CRUD against existing `/api/v1/automations` routes

---

### Component 11: Import/Export Improvements

**What exists:** `csv-utils.ts` in lib. Basic record CRUD in services.

**Integration approach:**
- Import is a multi-step flow: (1) upload CSV, (2) preview + map columns to object attributes, (3) configure duplicate handling (skip/update/create), (4) process
- Large imports run as background jobs: store CSV content in job payload or temp storage, enqueue `import_records` job, track progress
- Duplicate detection: query `record_values` for matching email/phone/name attributes -- uses the same EAV lookup pattern as email-to-record matching
- Export: query records with selected attributes, stream CSV response from API route
- Register `import_records` handler in `instrumentation.ts`

---

## Component Boundaries Summary

| Component | Owns (Tables) | Reads From | Writes To |
|-----------|---------------|------------|-----------|
| Job Engine | background_jobs | -- | (dispatches to handlers) |
| Signal Pipeline | signal_events, processed_signals, automation_rules | signal_events | background_jobs |
| AI Generation | generated_assets (drafts) | records, record_values, notes, timeline | generated_assets, notifications |
| Integration Sync | email_messages, calendar_events | integration_tokens | signal_events |
| Analytics | -- (pure reads) | records, record_values, signal_events, email_messages | (optional cache) |
| Email Compose | email_messages (outbound) | integration_tokens, records | email_messages, signal_events |
| Activity Scoring | record_values (score attribute) | signal_events, email_messages, calendar_events | record_values |
| Team Collab | comments, saved_views | users, records | comments, notifications, saved_views |
| Webhooks | webhook_subscriptions, webhook_deliveries | automation_rules, crm_events | webhook_deliveries |
| Workflow Builder | -- (UI only) | automation_rules | automation_rules |
| Import/Export | -- (uses jobs) | records, record_values | records, record_values |

---

## End-to-End Data Flow Example

**Scenario:** Deal moves to "Proposal" stage.

```
1. User drags deal card on Kanban board
2. Frontend calls PATCH /api/v1/records/:id
3. API route -> records service -> updates record_values (stage attribute)
4. handleRecordUpdated() fires (crm-events.ts):
   a. Posts "Deal stage updated: Acme Corp -> Proposal" to #deals channel via Aria
   b. evaluateDealForApproval() checks approval rules
   c. writeSignalEvent("stage_changed", { from: "Discovery", to: "Proposal", recordId })
5. writeSignalEvent() auto-enqueues signal_evaluate job [FIX NEEDED]
6. Cron fires -> processJobs() picks up signal_evaluate job -> executeJob() [FIX NEEDED]
7. evaluateSignalForGeneration() runs:
   a. Hardcoded rule: /proposal/ matches newStage -> enqueue ai_generate(type: "proposal")
   b. User rules: query automation_rules for stage_changed trigger -> maybe more jobs
8. Next cron tick -> processJobs() picks up ai_generate job
9. Proposal generator:
   a. assembleContext(recordId, "full") -> deal fields, company, contacts, notes, timeline
   b. Builds prompt from proposal template
   c. Calls OpenRouter (non-streaming) -> structured proposal content
   d. createDraft() -> generated_assets row (status: "draft")
   e. Creates notification for deal owner
10. User sees notification -> opens inbox -> reviews proposal draft
11. User approves -> approveDraft() -> status: "approved"
12. Webhook subscriptions checked -> if "asset_approved" event matched -> enqueue webhook_send
```

---

## Dependency Graph and Build Order

```
Job Execution Engine Fix [MUST BE FIRST -- everything depends on jobs actually running]
    |
    +-- Signal Pipeline Wiring [depends on jobs for signal_evaluate]
    |       |
    |       +-- AI Generation Pipeline [depends on signals triggering ai_generate jobs]
    |       |
    |       +-- Integration Sync [depends on signals for event emission]
    |       |
    |       +-- Activity Scoring [depends on signals for score triggers]
    |       |
    |       +-- Outbound Webhooks [depends on signals for event dispatch]
    |
    +-- Import/Export [depends on jobs for async processing]

Independent of Signal Pipeline (can build in parallel):
    - Analytics Engine (pure SQL reads, no dependencies)
    - Email Compose (needs integration tokens, not signals)
    - Team Collaboration (standalone tables + notifications)
    - Visual Workflow Builder (CRUD UI against existing table)
```

**Recommended phase structure:**

1. **Job Execution + Signal Wiring** (foundation) -- Fix processJobs() to call executeJob(), add FOR UPDATE SKIP LOCKED, wire writeSignalEvent() to auto-enqueue signal_evaluate. Also wire automation_rules evaluation. Estimated: 2-3 days. Unblocks everything.

2. **AI Generation Pipeline** (highest differentiating value) -- Build generators: opportunity_brief, followup, proposal, battlecard. Extract callOpenRouter() from ai-chat.ts. Register handlers in instrumentation.ts. Estimated: 5-7 days.

3. **Integration Sync** (data foundation for signals) -- Gmail delta sync first, then Outlook, then Calendar. Email-to-record matching. Calendar meeting_ended signal emission. Estimated: 5-7 days.

4. **Analytics + Activity Scoring** (builds on accumulated data) -- Real calculations for win/loss, coaching, forecast. Activity score as EAV attribute. Hot leads view. Estimated: 3-5 days.

5. **Email Compose + Webhooks + Workflow Builder + Team Collab + Import/Export** (independent features) -- Can be parallelized. Each is 2-4 days. Order by business priority.

---

## Patterns to Follow

### Pattern 1: Service + API Route + Job Handler

Every new feature follows the same three-layer pattern established in the codebase:

```typescript
// 1. Service: apps/web/src/services/my-feature.ts
export async function doThing(workspaceId: string, params: Params) {
  // business logic + DB queries scoped by workspaceId
}

// 2. API Route: apps/web/src/app/api/v1/my-feature/route.ts
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();
  const body = await req.json();
  const result = await doThing(ctx.workspaceId, body);
  return success(result);
}

// 3. Job Handler: apps/web/src/instrumentation.ts
registerJobHandler("my_job_type", async (payload) => {
  const { workspaceId, ...rest } = payload as { workspaceId: string; [k: string]: unknown };
  await doThing(workspaceId, rest);
});
```

### Pattern 2: Signal-Driven Reactivity

When a CRM event should trigger downstream behavior:

```typescript
import { writeSignalEvent } from "@/services/signals";

// After the primary action completes:
await writeSignalEvent({
  workspaceId,
  recordId,
  type: "my_event_type",
  payload: { relevant: "data" },
});
// Signal auto-enqueues signal_evaluate job [after fix]
// Automation engine routes to appropriate handler
```

### Pattern 3: EAV Cross-Entity Lookup

When you need to find records by attribute value (e.g., find contact by email for email-to-record matching):

```typescript
const matches = await db
  .select({ recordId: recordValues.recordId })
  .from(recordValues)
  .innerJoin(attributes, eq(attributes.id, recordValues.attributeId))
  .innerJoin(records, eq(records.id, recordValues.recordId))
  .where(and(
    eq(records.workspaceId, workspaceId),
    eq(attributes.type, "email"),
    eq(recordValues.textValue, targetEmail)
  ));
```

### Pattern 4: Cron Endpoint for Periodic Work

All periodic work uses the same pattern as the existing `/api/v1/cron/jobs` endpoint:

```typescript
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const result = await doPeriodicWork();
  return NextResponse.json({ result, timestamp: new Date().toISOString() });
}
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Inline AI Generation in Request Handlers

**What:** Calling OpenRouter directly inside a POST/PATCH handler.
**Why bad:** Route handlers have 30-60s timeout limits. LLM generation can take 30-90s. Users get 504s. No retry on failure.
**Instead:** Enqueue an `ai_generate` job and return immediately. The background worker handles generation.

### Anti-Pattern 2: Direct DB Writes Without Signal Emission

**What:** Updating records without calling `writeSignalEvent()`.
**Why bad:** Automations, scoring, and webhooks never fire. The system becomes inconsistent.
**Instead:** Every meaningful state change must emit a signal. The `crm-events.ts` service already handles this for record create/update -- extend it for new event types.

### Anti-Pattern 3: Querying Without Workspace Scope

**What:** Database queries missing `WHERE workspace_id = ?`.
**Why bad:** Data leakage between tenants.
**Instead:** Every query must include workspace scope. The `AuthContext.workspaceId` provides the value.

### Anti-Pattern 4: New Tables Without Multi-Tenancy

**What:** Creating a table without `workspace_id` column + foreign key to workspaces with `onDelete: "cascade"`.
**Why bad:** Cannot scope data, breaks tenant isolation, orphans data on workspace deletion.
**Instead:** Follow the pattern in every existing schema file.

### Anti-Pattern 5: Adding External Job Queue Dependencies

**What:** Introducing pg-boss, BullMQ, or Redis for job processing.
**Why bad:** Adds operational complexity and a new dependency. The existing PostgreSQL table + cron polling handles CRM-scale workloads (thousands, not millions of jobs/day).
**Instead:** Fix the existing `processJobs()` to actually call handlers. Add `FOR UPDATE SKIP LOCKED` for concurrency safety.

### Anti-Pattern 6: Duplicating the OpenRouter Call Infrastructure

**What:** Creating a new LLM calling layer in generators separate from `ai-chat.ts`.
**Why bad:** Two code paths to maintain. Config resolution, error handling, and model selection diverge.
**Instead:** Extract a shared `callOpenRouter(workspaceId, messages, options)` helper from `ai-chat.ts`. Chat uses it with streaming + tools. Generators use it without streaming.

---

## New Schema Requirements

| Table | Purpose | When to Build |
|-------|---------|---------------|
| `comments` | @mentionable comments on records | Team Collab phase |
| `saved_views` | Persisted filter/sort/column configs per user | Team Collab phase |
| `webhook_subscriptions` | Outbound webhook URL + event registration | Webhooks phase |
| `webhook_deliveries` | Delivery log with retry tracking | Webhooks phase |

**No new tables needed for:** Job Engine (exists), Signal Pipeline (exists), AI Generation (exists via `generated_assets`), Integration Sync (exists via `email_messages` + `calendar_events`), Analytics (reads only), Email Compose (uses `email_messages`), Activity Scoring (uses EAV `record_values`), Workflow Builder (uses `automation_rules`), Import/Export (uses `background_jobs` + `records`).

---

## Scalability Considerations

| Concern | At 100 users | At 10K users | At 100K users |
|---------|--------------|--------------|---------------|
| Job processing | Cron every 60s, batch 10 | Cron every 30s, batch 50 | Dedicated worker or pg-boss |
| Signal events | Table grows indefinitely | Add retention (archive > 90 days) | Partition by month |
| Email messages | Small per workspace | Index on receivedAt sufficient | Workspace partitioning |
| AI generation | Sequential per job | Rate limit per workspace | Queue priority + concurrency |
| Analytics queries | Compute on demand | Materialized views | Pre-compute daily aggregates |
| Webhook delivery | Inline in job | Separate queue priority | Dedicated delivery service |

---

## Sources

- **Direct codebase analysis** (HIGH confidence): All 27 schema files, 44 services, `instrumentation.ts`, `middleware.ts`, API route structure, `lib/job-queue.ts`, `services/job-queue.ts`, `services/automation-engine.ts`, `services/signals.ts`, `services/crm-events.ts`, `services/generated-assets.ts`, `services/integrations/gmail.ts`, `services/ai-chat.ts`, `app/api/v1/cron/jobs/route.ts`
- **Critical bug identified in code review**: `services/job-queue.ts` processJobs() lines 96-101 skip handler execution
- **Signal-to-job gap identified**: `writeSignalEvent()` does not auto-enqueue evaluation job
- **Dual enqueueJob implementation gap**: `lib/job-queue.ts` vs `services/job-queue.ts` have different signatures
