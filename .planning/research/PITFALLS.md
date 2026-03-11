# Domain Pitfalls

**Domain:** AI-driven CRM v2.0 -- job processing, AI generation, integration sync, workflow builders, activity scoring, email compose, team collaboration
**Researched:** 2026-03-11
**Overall confidence:** MEDIUM-HIGH (codebase analysis + web research + domain experience)

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or production outages.

---

### Pitfall 1: Job Queue Race Conditions in the Existing processJobs() Implementation

**What goes wrong:**
The current `job-queue.ts` has a classic SELECT-then-UPDATE race condition. `processJobs()` selects pending jobs, then updates each one to "running" individually. If two workers (or two cron invocations) call `processJobs()` simultaneously, they both SELECT the same pending jobs and both attempt to process them. The WHERE clause `eq(backgroundJobs.status, "pending")` on the UPDATE provides some protection, but only one wins the update -- the other silently proceeds to the catch block or succeeds on a stale read depending on isolation level. The job either runs twice or errors silently.

Additionally, the `retries` column is stored as `text` not `integer`, meaning `Number(job.retries) + 1` is fragile and will produce NaN if the value is ever non-numeric.

**Why it happens:**
The stub was designed for "wire it up later" and explicitly skips actual handler execution (line 98: just marks as completed). When real handlers are added -- especially AI generation that takes 5-30 seconds -- the race window becomes large enough to regularly hit.

**Consequences:**
- Duplicate AI asset generation (two proposals for the same deal)
- Duplicate email sends from sequences
- Wasted OpenRouter API credits (double billing)
- Confusing UX where two drafts appear in the asset inbox

**Prevention:**
Use `SELECT ... FOR UPDATE SKIP LOCKED` to atomically claim jobs. This is the standard pattern for PostgreSQL-backed job queues. In Drizzle, use a raw SQL query or transaction with `FOR UPDATE SKIP LOCKED`:
```sql
BEGIN;
SELECT * FROM background_jobs
WHERE status = 'pending' AND run_at <= NOW()
ORDER BY run_at
LIMIT 10
FOR UPDATE SKIP LOCKED;
-- claim and process
COMMIT;
```
Also change `retries` from `text` to `integer`. Consider adopting pg-boss (which handles all of this) rather than maintaining a custom queue, but if staying custom, the SKIP LOCKED pattern is non-negotiable.

**Detection:**
- Duplicate `generated_assets` rows with identical `recordId` + `assetType` + near-identical `createdAt`
- Job table showing two "running" rows for the same logical operation
- Unexpectedly high OpenRouter spend relative to user activity

**Phase to address:** Job processor wiring phase -- this must be the first fix before any real handlers are registered.

---

### Pitfall 2: Gmail historyId Invalidation Causing Full Re-Sync Storms

**What goes wrong:**
Gmail delta sync relies on `history.list(startHistoryId)`. The historyId stored in `integrationTokens.syncCursor` can become invalid in several ways: (1) Google expires history records after ~30 days, (2) mailbox changes like label deletion can reset the history baseline, (3) the user's mailbox is migrated server-side. When `history.list` is called with an invalid historyId, Google returns a 404 `historyId is not valid` error. The naive fix is to do a full sync -- but a full sync of a 10-year mailbox with 50K+ messages hits Gmail's API quota (250 quota units/user/second, ~100 messages.list calls = 500 units) and can take hours, during which the sync cursor is still stale.

**Why it happens:**
The happy path (store historyId, poll with it) works perfectly in development with fresh test mailboxes. The invalidation only surfaces in production with real users who have large, old mailboxes or who disconnect/reconnect their Gmail.

**Consequences:**
- Sync loop: full re-sync starts, hits quota limit, partial sync cursor saved, next poll re-tries full sync, repeat
- Missing emails in CRM for hours/days during sync storm
- Gmail API quota exhausted, blocking all workspace users sharing the same GCP project
- Signal events stop flowing, killing all downstream automation (no follow-ups, no battlecards)

**Prevention:**
1. When historyId is invalid, do NOT full-sync all messages. Instead, do a **bounded partial sync**: fetch only messages from the last 7 days using `messages.list(q: "after:YYYY/MM/DD")`, store the newest historyId, and resume delta from there.
2. Implement per-user rate limiting with exponential backoff (not just per-workspace).
3. Store sync state in a dedicated table with `lastSuccessfulSync`, `lastAttemptedSync`, `failureCount`, `backoffUntil` columns -- not just a single `syncCursor` text field.
4. Use Gmail push notifications (pub/sub webhook) as primary, with polling as fallback -- not polling as primary.

**Detection:**
- `integrationTokens.lastSyncAt` not updating for >1 hour
- Spike in Gmail API 429 responses
- `email_messages` table showing gaps in `receivedAt` timestamps

**Phase to address:** Integration sync phase. Build the bounded-partial-sync recovery path BEFORE shipping delta sync to users.

---

### Pitfall 3: Outlook Delta Token Expiry Without Graceful Degradation

**What goes wrong:**
Microsoft Graph delta tokens for mail expire after **7 days** of non-use. If a user doesn't log in for a week (vacation, weekends for light users), the stored `syncCursor` delta token expires. Graph returns a `syncStateNotFound` error. Unlike Gmail where you can at least list messages by date, Outlook delta requires a full initial sync (fetching all messages page by page with `@odata.nextLink`) which can return the same item multiple times across pages.

Additionally, Graph webhook subscriptions expire after a maximum of **4230 minutes (~3 days)** for mail resources and must be renewed before expiry. If the renewal cron fails once, you lose push notifications silently until the next successful renewal -- potentially days.

**Why it happens:**
Graph's delta + webhook model has tight coupling between subscription lifecycle and delta token freshness. Documentation is clear but the operational requirements (renew subscriptions every 2-3 days, handle token expiry for inactive users) require persistent background infrastructure that doesn't exist yet.

**Consequences:**
- Silent sync gaps for Outlook users who take breaks
- Duplicate email_messages if delta re-sync returns items already processed (dedup index helps but wastes compute)
- Webhook subscription lapses go undetected without monitoring

**Prevention:**
1. Proactively refresh delta tokens for ALL connected users every 3-4 days via a background job, even if they haven't logged in.
2. Webhook subscription renewal: schedule renewal at 80% of max lifetime (renew at ~2.4 days, not at 3 days).
3. Build a `syncState` table tracking `lastDeltaRefresh`, `webhookSubscriptionId`, `webhookExpiresAt`, `webhookRenewedAt`.
4. On `syncStateNotFound`, do incremental catch-up (last 7 days by date filter) not full re-sync.

**Detection:**
- `integrationTokens.syncCursor` is stale (lastSyncAt > 5 days ago)
- Missing `webhookExpiresAt` tracking in provider metadata
- Outlook users reporting missing emails after returning from PTO

**Phase to address:** Integration sync phase, alongside Gmail sync.

---

### Pitfall 4: AI Generation Pipeline Cost Blowout from Unthrottled Signal-to-Job Cascades

**What goes wrong:**
The `automation-engine.ts` already maps signals to jobs: `record_created` (deal) triggers opportunity_brief, `stage_changed` triggers proposal/deck, `note_added` triggers follow-up + competitor detection, `email_received` triggers competitor detection. A single busy deal can trigger 5-10 AI generation jobs per day. Multiply by 50 active deals across a workspace, and that's 250-500 LLM calls/day at $0.01-0.10 per call = $2.50-$50/day per workspace. For a SaaS product, this cost is borne by the platform, not the user.

Worse: the cascade is multiplicative. A note with competitor mentions triggers `runCompetitorDetection`, which enqueues one battlecard job per detected competitor. A note mentioning 3 competitors = 3 battlecard generations + 1 follow-up generation = 4 LLM calls from a single note save.

**Why it happens:**
Each signal-to-job rule is individually sensible. The problem emerges from their composition -- nobody models the aggregate cost of all rules firing across all records across all workspaces. The automation engine has no rate limiting, no per-workspace budget, and no deduplication (saving a note twice triggers two follow-up jobs).

**Consequences:**
- LLM API costs 10-100x higher than projected
- Asset inbox overwhelmed with low-quality drafts nobody reviews
- OpenRouter rate limits hit, blocking the AI chat feature (shared API key per workspace)

**Prevention:**
1. **Per-workspace generation budget**: Track daily/weekly AI generation costs in a `workspace_ai_usage` table. Pause non-critical generation when budget is 80% consumed.
2. **Deduplication window**: Before enqueuing, check if an identical job (same type + recordId + documentType) was enqueued in the last 15 minutes. Skip if duplicate.
3. **Priority tiers**: User-initiated generation (from chat) = high priority, always executes. Signal-driven generation = low priority, subject to budget limits.
4. **Model tiering**: Use cheap models (Haiku/Flash) for follow-ups and briefs, expensive models (Sonnet/GPT-4o) only for proposals and contracts. The `contextTier` field exists in the schema -- wire it to model selection.
5. **Batch generation**: Accumulate signals for 5-10 minutes, then generate one combined follow-up instead of one per signal.

**Detection:**
- OpenRouter billing dashboard showing unexpected spikes
- `generated_assets` table growing faster than `records` table
- Users complaining about "too many AI suggestions"

**Phase to address:** AI generation pipeline phase. Budget tracking must be built into the job handler, not retrofitted.

---

### Pitfall 5: Email Compose "Send-As" Breaking Deliverability

**What goes wrong:**
When a CRM sends email "on behalf of" a user via Gmail/Outlook API, the email's `From` header uses the user's address. But the actual sending infrastructure is the CRM's server (or a transactional email service like Resend). This creates SPF/DKIM/DMARC alignment failures: the `From` domain says `user@company.com` but SPF checks the sending server IP, which belongs to the CRM. As of 2025, both Gmail and Outlook enforce strict DMARC alignment for bulk senders (>5000 emails/day). Even for low-volume CRM sends, misalignment triggers spam classification.

**Why it happens:**
There are two architectures for "send email from CRM":
- **API send**: Use Gmail API `messages.send` with the user's OAuth token -- email is sent through Gmail's own servers, SPF/DKIM align naturally. Correct but requires maintaining a valid OAuth token.
- **SMTP relay**: Use a transactional service (Resend, SendGrid) with a custom `From` header -- cheaper, simpler, but breaks alignment unless the user's domain has SPF records including the relay.

The existing schema stores `emailProviderEnum: ["gmail", "outlook"]` suggesting API send, but the PROJECT.md mentions `RESEND_API_KEY` in env vars, suggesting SMTP relay. If both paths exist, email may be sent via the wrong path depending on context.

**Consequences:**
- CRM-sent emails land in spam
- User's domain reputation damaged (DMARC failure reports)
- Reply threading breaks (Gmail threads by Message-ID + References headers; wrong infrastructure = wrong headers)

**Prevention:**
1. **Always use the user's OAuth token + provider API** for sending CRM emails. Never use a third-party relay for messages that appear to come from the user's address.
2. Reserve Resend/transactional email for **system notifications only** (password resets, workspace invites) sent from a CRM-owned domain (e.g., `notifications@aria-crm.com`).
3. Store `In-Reply-To` and `References` headers from synced emails to maintain threading when composing replies.
4. Validate that the user's integration token has `gmail.send` or `Mail.Send` scope before showing the compose UI.

**Detection:**
- Test emails from CRM landing in spam folder
- DMARC aggregate reports showing alignment failures
- Reply emails appearing as new threads instead of replies

**Phase to address:** Email compose phase. Architecture decision (API send vs relay) must be made before any compose UI is built.

---

## Moderate Pitfalls

---

### Pitfall 6: Visual Workflow Builder Becoming an Untestable State Machine

**What goes wrong:**
Visual workflow builders (drag-and-drop nodes with conditions and actions) produce complex directed graphs stored as JSON. The graph can contain cycles (retry loops), parallel branches, and conditional paths. Testing these requires enumerating all paths through the graph. The existing `automationRules` schema stores conditions as `jsonb("conditions")` with `{field, operator, value}` objects -- this is flat evaluation. A visual builder implies nested logic (if-then-else branches, wait-for timers, parallel execution), which requires a fundamentally different execution model.

**Why it happens:**
Teams start with a simple "trigger + condition + action" model (which the current schema supports well), then add a visual builder to make it "more powerful." The visual builder implies capabilities the execution engine doesn't support: branching, looping, wait states, error handling per node. The gap between what the UI can express and what the engine can execute creates bugs users can't diagnose.

**Consequences:**
- Workflows that look valid in the builder fail silently at runtime
- Support burden from users creating invalid graphs
- Execution engine becomes the most complex and least-tested part of the codebase

**Prevention:**
1. **Start with "trigger + conditions + actions" not a graph builder.** The current `automationRules` schema is the right starting point. Add a nice UI for creating rules with dropdowns and filters -- this covers 80% of CRM automation needs.
2. If a visual builder is truly needed later, use a **DAG (no cycles)** model with a proven library (ReactFlow) and constrain the UI to prevent invalid graphs.
3. Store workflow definitions as versioned, immutable snapshots. A running workflow instance references a specific version. Editing a workflow creates a new version; in-flight instances finish on the old version.
4. Every node type needs a timeout and an error-handling strategy (retry, skip, fail-workflow).

**Detection:**
- Workflow JSON growing beyond 50 nodes without test coverage
- Users creating workflows that never complete
- Support tickets about "my automation didn't fire"

**Phase to address:** Workflow automation builder phase. Ship the simple trigger-condition-action UI first. Visual builder is a separate, later effort.

---

### Pitfall 7: Activity Scoring Cold-Start Producing Meaningless Results

**What goes wrong:**
Activity scoring assigns points to CRM interactions (email opened = 5 pts, replied = 20 pts, meeting booked = 50 pts) to rank leads. The cold-start problem: new workspaces have no historical conversion data to calibrate scores. A lead with 2 emails opened (10 pts) and a lead with 1 meeting booked (50 pts) look quantitatively different, but without outcome data (which leads actually closed?), the point values are arbitrary. Users see "hot leads" that never convert and lose trust in the feature.

**Why it happens:**
Product teams ship scoring with hardcoded point values based on industry averages. But every business is different -- for one company, email replies strongly predict conversion; for another, demo bookings do. Without calibration against actual outcomes, scores are guesses dressed as data.

**Consequences:**
- Sales reps ignore the "hot leads" dashboard after a few false positives
- Feature perceived as gimmick rather than tool
- Scoring becomes a maintenance burden (constant requests to "tune the weights")

**Prevention:**
1. **Ship with explicit "uncalibrated" labeling.** Show "Activity Level: High/Medium/Low" not "Score: 87/100." Avoid fake precision.
2. **Use rule-based tiers initially**, not point-based scores. "Hot" = has meeting in last 7 days OR replied to email in last 3 days. "Warm" = opened email in last 7 days. "Cold" = no activity in 14+ days. Users understand and can customize these rules.
3. **Collect outcome data from day one.** When a deal is won/lost, log it as a training signal. After 50+ closed deals, offer to "calibrate scores based on your data."
4. **Decay scores over time.** A lead who was active 3 months ago but silent since is not "hot." Apply a half-life decay (score halves every 14 days without new activity).

**Detection:**
- Users not clicking on "Hot Leads" dashboard after first week
- High-scored leads with 0% conversion rate
- No outcome feedback loop in the scoring pipeline

**Phase to address:** Activity scoring phase. Ship tier-based (High/Medium/Low) first, point-based scoring as a later enhancement.

---

### Pitfall 8: Toast/Notification Fatigue from Over-Notifying on Background Events

**What goes wrong:**
When background jobs complete (AI asset generated, email synced, workflow triggered), the natural instinct is to show a toast notification. But with 10+ active automations per workspace, users see a toast every few minutes: "Proposal draft ready," "3 new emails synced," "Follow-up generated," "Battlecard updated." Users develop notification blindness and start missing the ones that matter (e.g., "Deal stage changed by client").

**Why it happens:**
Each feature team adds notifications for their feature independently. No one owns the aggregate notification experience. The existing `notifications` table (CRUD, read/unread, bulk mark) can handle storage, but there's no prioritization or batching layer.

**Consequences:**
- Users disable all notifications
- Critical alerts lost in noise
- UX feels "noisy" and unprofessional

**Prevention:**
1. **Three notification tiers**: (a) Toast = user-initiated action confirmations only ("Record saved," "Email sent"). (b) Badge/counter = background events that need attention ("3 AI drafts ready for review"). (c) Silent log = informational events ("Email sync completed").
2. **Batch background notifications**: Instead of one toast per synced email, show "12 new emails synced" once per sync cycle.
3. **Never toast for automated actions.** AI generation results go to the asset inbox with a badge count, not a toast.
4. Use sonner (already chosen) with a max visible toast limit of 3 and auto-dismiss at 4 seconds for confirmations.

**Detection:**
- More than 5 toasts visible simultaneously
- Users asking "how do I turn off notifications"
- Toast appearing for events the user didn't trigger

**Phase to address:** Toast/notification system phase -- establish the tier system before any other feature adds notifications.

---

### Pitfall 9: EAV Query Performance Cliff with Analytics Aggregations

**What goes wrong:**
The Typed EAV model works well for CRUD and filtering (the `query-builder.ts` uses `EXISTS` subqueries efficiently). But analytics queries need aggregation across many records and many attributes: "sum of deal values by stage by month" requires joining `records` to `record_values` (for deal value), to `record_values` again (for stage), grouping by month from `record_values` (for close date). Each attribute access is a separate join or subquery. A win/loss analysis across 10K deals with 20 attributes each generates queries with 5-10 joins that take 5-30 seconds.

**Why it happens:**
EAV is optimized for flexibility (custom fields, no migrations) at the cost of query complexity. OLTP queries (show me this record's values) are fast because they're single-record lookups. OLAP queries (aggregate across all records) fight against the EAV grain. Teams discover this when they build the first real analytics dashboard.

**Consequences:**
- Analytics pages timeout or show loading spinners for 10+ seconds
- Users stop using analytics features
- Pressure to "just add a regular column" breaks the EAV abstraction

**Prevention:**
1. **Materialized views or summary tables for analytics.** Create `deal_analytics_summary` with denormalized columns (deal_value, stage, close_date, owner_id, created_at) populated by a background job whenever a deal's record_values change.
2. **Cache analytics results** with a TTL (15 minutes). Show "Last updated: 10 minutes ago" rather than computing in real-time.
3. **Limit analytics scope**: Last 12 months, max 10K records per query. Show a "data threshold" gate (which already exists per PROJECT.md) that requires minimum data before displaying analytics.
4. **Use PostgreSQL-specific features**: partial indexes on `record_values` for common attribute types, covering indexes for the most-queried attributes.

**Detection:**
- Analytics API routes taking >3 seconds
- Drizzle query logs showing queries with 5+ joins
- Database CPU spikes correlating with analytics page views

**Phase to address:** Analytics phase. Build summary tables as part of the analytics implementation, not as a later optimization.

---

### Pitfall 10: Import/Export Duplicate Detection Failing on EAV Fuzzy Matching

**What goes wrong:**
CSV import needs duplicate detection: "Does this imported contact already exist?" In a traditional schema, you'd match on email or phone. In the EAV model, email and phone are `record_values` rows, not columns. Duplicate detection requires: (1) find the email attribute ID for this object, (2) search `record_values` where `attribute_id = X AND text_value ILIKE imported_email`, (3) repeat for phone, name, company. For a 10K row import, that's 10K x 3 attributes = 30K subqueries. This either takes minutes or times out.

**Why it happens:**
EAV makes per-record lookups fast but bulk matching slow. The `record_values` table has indexes on typed columns, but ILIKE queries (needed for fuzzy matching) don't use B-tree indexes well.

**Consequences:**
- Import of 5K+ contacts takes 10+ minutes or times out
- False negatives (duplicates not caught because fuzzy matching was disabled for performance)
- False positives (common names matching incorrectly)

**Prevention:**
1. **Pre-load lookup table**: Before import, build an in-memory Map of `{email -> recordId, phone -> recordId}` for the target object. This is one query with a join, loaded once.
2. **Exact match first, fuzzy match opt-in**: Default to exact email match (fast). Offer fuzzy name matching as an opt-in step that processes in background via job queue.
3. **Use PostgreSQL `pg_trgm` extension** for trigram similarity matching on names. Create a GIN index on `text_value` for the trigram operator.
4. **Process imports in batches** of 100-500 rows via background jobs, showing progress to the user.

**Detection:**
- Import timing out for files >1000 rows
- Users reporting "it found 0 duplicates" when they know duplicates exist
- Import page showing spinner for >30 seconds

**Phase to address:** Import/export phase. Build the lookup-table approach from the start; do not attempt per-row duplicate queries.

---

## Minor Pitfalls

---

### Pitfall 11: Webhook Delivery Reliability and Retry Storms

**What goes wrong:**
Outbound webhooks fire on CRM events (record created, deal stage changed). If the receiving endpoint is slow or down, naive retry logic (retry 3x immediately) creates thundering herd problems. If 100 records update in a batch import, that's 100 webhook fires. If the endpoint is temporarily down, that's 300 retry attempts in quick succession.

**Prevention:**
1. Exponential backoff with jitter: retry at 1min, 5min, 30min, 2hr, 24hr.
2. Circuit breaker per webhook URL: after 5 consecutive failures, pause delivery and notify the workspace admin.
3. Dead-letter queue: failed webhooks stored in a table for manual retry.
4. Payload size limit (256KB) to prevent memory issues with large record payloads.

**Phase to address:** Outbound webhooks phase.

---

### Pitfall 12: @Mentions and Comments Without Workspace-Scoped User Resolution

**What goes wrong:**
@mention autocomplete needs to search workspace members. The naive approach queries the `users` table directly, but users can be in multiple workspaces. Mentioning `@John` in Workspace A should only match members of Workspace A. If user resolution queries the global user table, mentions can leak user existence across workspaces (privacy violation in multi-tenant SaaS).

**Prevention:**
1. Always resolve mentions through the `workspace_members` join table, never directly from `users`.
2. Autocomplete endpoint must accept `workspaceId` and filter through membership.
3. Stored mention format should use `userId` not `userName` (names change, IDs don't).
4. Render mentions with display name at view time, not at storage time.

**Phase to address:** Team collaboration phase.

---

### Pitfall 13: Cursor-Based Pagination Breaking on Sort Column Ties

**What goes wrong:**
Cursor-based pagination uses `WHERE (sort_column, id) > (cursor_value, cursor_id)` for stable paging. But if the sort column has many ties (e.g., sorting by `status` where 500 records have status "Active"), the cursor must break ties using a secondary sort (typically `id`). If the cursor implementation only uses the primary sort column, it skips records or shows duplicates when paginating through tied values.

**Prevention:**
1. Always use a composite cursor: `(sort_column_value, record_id)`.
2. The `id` tiebreaker must be included in both the ORDER BY and the WHERE clause.
3. For EAV sorted by attribute values: the cursor must include both the `record_values.text_value` (or appropriate typed column) AND the `records.id`.

**Phase to address:** Pagination phase.

---

### Pitfall 14: Saved Views Sharing Leaking Private Filter Criteria

**What goes wrong:**
Saved views store filter configurations (which attributes, which values, which sort). A user creates a private view "My High-Value Deals > $100K" with filters. If another user can view the saved view's filter definition, they learn the criteria even if they can't see the matching records. In workspaces with role-based access, this can leak strategic information (e.g., a rep seeing the manager's "At Risk" filter criteria).

**Prevention:**
1. Saved views have explicit visibility: `private` (only creator), `team` (workspace members), `public` (anyone with link -- probably not needed).
2. Default to `private`. Sharing requires explicit action.
3. Filter criteria are stored with the view; don't expose the full filter JSON in API responses for views the user doesn't own.

**Phase to address:** Team collaboration / saved views phase.

---

### Pitfall 15: enqueueJob Signature Mismatch Between job-queue.ts and automation-engine.ts

**What goes wrong:**
The existing codebase has a **concrete bug**: `job-queue.ts` defines `enqueueJob(type, payload, options)` where `workspaceId` is in `options`, but `automation-engine.ts` calls `enqueueJob(workspaceId, "ai_generate", {...})` -- passing `workspaceId` as the first argument (the `type` parameter). This means every job enqueued by the automation engine has `type = workspaceId` (a UUID) and `payload = "ai_generate"` (a string, not an object). No jobs from the automation engine will ever match a registered handler.

**Why it happens:**
The automation engine was written against a planned API that was later changed, or vice versa. The stub never executes real handlers, so the mismatch was never caught at runtime.

**Prevention:**
1. Fix the signature mismatch before wiring up real job handlers.
2. Add TypeScript strict typing to `enqueueJob` -- use a discriminated union for job types and their payloads so the compiler catches mismatches.
3. This is exactly the kind of integration bug that E2E tests should catch. Write a test that creates a deal, verifies a background job is enqueued with the correct type and payload.

**Detection:**
- Already present in the codebase. Grep for `enqueueJob` calls and compare signatures.

**Phase to address:** Job processor wiring phase -- must be fixed as the very first task.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Job processor wiring | Race conditions in processJobs (Pitfall 1), signature mismatch (Pitfall 15) | Use FOR UPDATE SKIP LOCKED, fix enqueueJob API, add typed job payloads |
| AI generation pipeline | Cost blowout from cascading signals (Pitfall 4) | Per-workspace budgets, deduplication windows, model tiering |
| Gmail/Outlook sync | historyId invalidation (Pitfall 2), delta token expiry (Pitfall 3) | Bounded partial sync recovery, proactive token refresh, webhook subscription renewal jobs |
| Analytics | EAV aggregation performance cliff (Pitfall 9) | Materialized summary tables, cached results with TTL |
| Toast/notifications | Notification fatigue (Pitfall 8) | Three-tier notification model, never toast for background events |
| Email compose | Deliverability from send-as identity (Pitfall 5) | Always use user's OAuth token + provider API for sending |
| Workflow builder | Untestable state machine (Pitfall 6) | Start with trigger-condition-action, not visual graph builder |
| Activity scoring | Cold-start meaningless scores (Pitfall 7) | Ship tier-based labels, collect outcome data, calibrate later |
| Import/export | EAV fuzzy matching performance (Pitfall 10) | Pre-loaded lookup tables, batch processing via job queue |
| Outbound webhooks | Retry storms (Pitfall 11) | Exponential backoff, circuit breaker, dead-letter queue |
| Team collaboration | Mention resolution leaking across workspaces (Pitfall 12), saved view privacy (Pitfall 14) | Always resolve through workspace_members, default views to private |
| Pagination | Cursor ties on sort columns (Pitfall 13) | Composite cursor with record_id tiebreaker |

---

## Sources

- [pg-boss serverless discussion](https://github.com/timgit/pg-boss/discussions/403)
- [pg-boss connection termination issue](https://github.com/timgit/pg-boss/issues/381)
- [Gmail API synchronization guide](https://developers.google.com/workspace/gmail/api/guides/sync)
- [Gmail API usage limits](https://developers.google.com/workspace/gmail/api/reference/quota)
- [Microsoft Graph delta query overview](https://learn.microsoft.com/en-us/graph/delta-query-overview)
- [Microsoft Graph delta token expiry](https://learn.microsoft.com/en-us/answers/questions/1474436/expiry-details-for-the-deltatoken-used-in-delta-qu)
- [Microsoft Graph webhooks best practices](https://www.voitanos.io/blog/microsoft-graph-webhook-delta-query/)
- [LLM cost optimization guide](https://ai.koombea.com/blog/llm-cost-optimization)
- [1200 production LLM deployments analysis](https://www.zenml.io/blog/what-1200-production-deployments-reveal-about-llmops-in-2025)
- [DKIM/DMARC/SPF best practices 2025](https://saleshive.com/blog/dkim-dmarc-spf-best-practices-email-security-deliverability/)
- [Outlook bulk sender requirements 2025](https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730)
- [Cold-start lead scoring](https://blog.clickpointsoftware.com/cold-start-lead-scoring)
- [CRM workflow automation mistakes](https://medium.com/@david.brown_4812/5-common-workflow-automation-mistakes-and-how-to-avoid-them-10a0af99a749)
- [Next.js background jobs discussion](https://github.com/vercel/next.js/discussions/33989)
- [CRM rate limit synchronization](https://www.stacksync.com/blog/overcoming-api-rate-limits-in-real-time-crm-synchronization)
- Codebase analysis: `apps/web/src/services/job-queue.ts`, `apps/web/src/services/automation-engine.ts`, `apps/web/src/db/schema/jobs.ts`, `apps/web/src/db/schema/integrations.ts`, `apps/web/src/db/schema/email-messages.ts`
