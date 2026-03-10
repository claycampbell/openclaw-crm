# Pitfalls Research

**Domain:** AI-driven CRM — proactive automation, signal processing, multi-channel integrations, document generation
**Researched:** 2026-03-10
**Confidence:** MEDIUM (training data through Aug 2025; no live search available — based on codebase analysis + domain knowledge)

---

## Critical Pitfalls

### Pitfall 1: Proactive AI That Acts Without a Job Queue

**What goes wrong:**
The existing `crm-events.ts` fires agent messages synchronously inside record CRUD operations. Scaling this to actual AI generation (proposal drafts, email sequences, opportunity briefs) means calling OpenRouter inside a request handler. The HTTP request that changed the deal stage now waits for LLM latency — typically 2–15 seconds — before responding. Under load this exhausts server connections. Worse, if the AI call fails, the error silently swallowed by the `try/catch` means users never know the generation didn't happen.

**Why it happens:**
The "fire-and-forget with try/catch" pattern in `handleRecordCreated` looks safe for simple chat messages but becomes a footgun the moment AI generation is added. Teams add one LLM call at a time without refactoring the dispatch mechanism, and by the time it's a problem they have generation logic spread across 10 event handlers.

**How to avoid:**
Introduce a job queue before writing any proactive AI generation logic. Use PostgreSQL itself as the queue (a `background_jobs` table with `status`, `payload`, `run_at`, `workspace_id`) rather than a separate service — no new infrastructure, respects multi-tenancy, transactional enqueue. Drizzle already has a DB connection. Process jobs from a background worker (a separate Node process or a Next.js route hit by a cron). All CRM events enqueue a job; the job runner calls OpenRouter.

**Warning signs:**
- Any `await openRouterCall()` inside a record service function
- `crm-events.ts` handlers growing beyond 50 lines
- P95 latency for record updates creeping above 500ms

**Phase to address:**
Phase handling proactive AI generation — must be the first thing built in that phase, before any individual generators. Do not ship a single proactive feature without the queue in place first.

---

### Pitfall 2: OAuth Token Management for Email/Calendar Integration

**What goes wrong:**
Gmail and O365 integrations require OAuth2 access tokens with 1-hour expiry and refresh tokens that expire if unused for 6 months or if the user revokes access. Teams implement the initial OAuth flow correctly but treat the stored token as permanent. Within a week of shipping, 5–10% of syncs silently fail because tokens expired, rotated, or were revoked. The activity timeline shows gaps, engagement signals stop flowing, and email open tracking breaks — all without any visible error to the user.

**Why it happens:**
The happy path through OAuth is well-documented. The failure modes — token rotation (Google now rotates refresh tokens on use), revocation webhooks, scope changes on re-auth — are scattered across provider changelogs. EAV storage is well-suited to storing tokens as `json_value` on workspace settings, but there's no obvious place to hook token refresh logic.

**How to avoid:**
Store tokens in a dedicated `integration_tokens` table (not workspace settings JSON) with columns: `provider`, `workspace_id`, `access_token` (encrypted), `refresh_token` (encrypted), `expires_at`, `scopes`, `status` (active/revoked/error). On every sync attempt, check `expires_at` and refresh proactively (5 minutes before expiry, not after failure). Implement a catch for `invalid_grant` that sets status to `revoked` and triggers an in-app notification. Encrypt tokens at rest with a workspace-specific key derivation, not a global secret.

**Warning signs:**
- Tokens stored in workspace `settings` JSONB blob
- No `expires_at` tracking
- Sync errors logged but not surfaced to users
- "Works in dev, mysteriously fails after a week"

**Phase to address:**
Email/calendar integration phase — the token management infrastructure must be built before the first sync, not retrofitted after email parsing is working.

---

### Pitfall 3: EAV Impedance Mismatch for AI-Generated Content

**What goes wrong:**
The EAV pattern is excellent for user-defined CRM fields, but AI-generated assets (proposals, decks, email sequences, briefs) are long-form structured documents — not attribute values. Teams attempt to store a proposal as a `json_value` on a deal record attribute. This creates three problems: (1) proposals have their own lifecycle (draft/approved/sent) that doesn't fit the attribute model; (2) the 10-round tool calling loop in `ai-chat.ts` already passes full record values in context — adding large documents makes prompts balloon past context limits; (3) template versioning and regeneration become impossible without custom query patterns that fight the EAV design.

**Why it happens:**
The EAV model is already there and it works — it's the path of least resistance. The typed EAV has a `json_value` column that can hold anything. The mistake is conflating "CRM data fields" (what EAV excels at) with "AI-generated work product" (documents with their own lifecycle).

**How to avoid:**
Create a first-class `generated_assets` table with columns: `id`, `workspace_id`, `record_id`, `asset_type` (proposal/brief/email_sequence/battlecard/etc.), `status` (draft/approved/sent/archived), `content` (JSONB or text), `model_used`, `prompt_version`, `generated_at`, `approved_by`. This table is indexed separately, never put into the AI context window directly, and has its own CRUD service. When AI needs to reference an asset, it gets a summary or excerpt, not the full document.

**Warning signs:**
- Proposal content stored as a deal attribute value
- System prompt includes full document text
- "Why is my AI context running out?" when loading deal details
- No asset status/approval tracking

**Phase to address:**
Asset generation phase — define the `generated_assets` schema before writing any generator. Retrofitting this table after assets are stored as EAV values requires a migration that is painful across all existing workspaces.

---

### Pitfall 4: Signal Deduplication and Idempotency

**What goes wrong:**
Email open tracking, webhook delivery from Gmail/O365/LinkedIn/Zoom, and calendar event sync are all "at least once" delivery systems. Without deduplication, a single email open triggers three engagement score updates, three AI "this contact is hot" notifications, and potentially three tasks created by the proactive AI. The signal-driven architecture amplifies every delivery failure: a webhook retry becomes three duplicate records in the activity timeline, and the AI fires on all three.

**Why it happens:**
Webhook providers document retry behavior in footnotes. Gmail push notifications (Cloud Pub/Sub) can deliver the same historyId multiple times. The existing tool-confirm flow in chat is the only idempotency mechanism in the current codebase, and it only covers user-initiated writes. Proactive AI actions have no equivalent guard.

**How to avoid:**
Every inbound signal must carry a deduplication key stored in a `processed_signals` table (`provider`, `signal_id`, `processed_at`, `workspace_id`) with a unique constraint on `(provider, signal_id)`. Before processing any signal: check for existence, insert if new (using `ON CONFLICT DO NOTHING`), then process. All AI-triggered writes should carry an idempotency key derived from `(trigger_signal_id, action_type, record_id)`. The job queue from Pitfall 1 naturally handles this if jobs are enqueued with an idempotency key.

**Warning signs:**
- Activity timeline showing duplicate email open events
- Users complaining "Aria keeps creating the same task"
- No `processed_signals` or equivalent deduplication table
- Webhook handlers that immediately call the AI without checking prior processing

**Phase to address:**
Signal processing phase — build the deduplication layer before connecting any external signal source. This is cheaper to do upfront than to debug after launch when duplicate records have been in production for weeks.

---

### Pitfall 5: Proactive AI Automation That Erodes Rep Trust

**What goes wrong:**
AI generates a proposal with the wrong pricing (model hallucinated a number), sends it before the rep reviewed it, and the rep loses the deal. Or AI auto-logs a call summary with an incorrect action item, the rep misses the real next step, and the deal stalls. Once this happens once, the rep stops trusting the AI and routes around it — the system becomes noise, not signal.

**Why it happens:**
The existing chat system correctly requires confirmation for write tools (`requiresConfirmation: true`). But proactive AI actions triggered by background events have no such gate because there's no user in the loop. The temptation is to make proactive actions "seamless" — fully automated. The correct default is: AI generates → rep reviews → rep approves → AI executes.

**How to avoid:**
Every proactive AI action must have an explicit approval state. The `generated_assets` table (Pitfall 3) has a `status` field for this reason. No asset is sent, no email is queued, no record is updated by proactive AI without the rep seeing it in a notifications/review inbox first. Exception: read-only actions (creating a draft, posting an observation to a channel) can be automatic. Write actions (sending email, updating deal stage, creating external events) always require approval. Build the review inbox UI before building the generators.

**Warning signs:**
- Proactive AI calls `update_record` or external send APIs without a human in the loop
- "Actions taken" tab that reps don't look at
- No distinct `pending_approval` state on AI-generated actions
- Automation demo looks impressive but reps ask "how do I turn this off?"

**Phase to address:**
Proactive AI framework phase — the review/approval inbox is the first UI component, before the first generator is shipped.

---

### Pitfall 6: LinkedIn Integration Fragility and ToS Risk

**What goes wrong:**
LinkedIn's official API is restricted to Marketing API partners and Sales Navigator Enterprise customers. Teams build LinkedIn enrichment using unofficial scraping, Chrome extensions, or third-party enrichment APIs that themselves scrape LinkedIn. These break on every LinkedIn HTML change, violate LinkedIn's ToS, and create legal liability for the product. The feature is demoed successfully, works for six weeks, then LinkedIn blocks the IP range or changes the DOM and it silently returns empty enrichment data.

**Why it happens:**
LinkedIn is in the PROJECT.md as a required integration for "prospect enrichment, connection status, activity signals." The path of least resistance is to scrape or use a cheap enrichment API without reading its data source. Official LinkedIn integration requires applying for their Partner Program, which takes months.

**How to avoid:**
Use a compliant third-party enrichment provider that has a LinkedIn Data Partnership (Clearbit, Apollo, Clay, People Data Labs all have varying levels of compliance). Budget for API costs upfront. Alternatively, scope the LinkedIn feature as "LinkedIn profile URL enrichment via official enrichment APIs" rather than "LinkedIn integration." Do not build direct LinkedIn scraping into the product. Evaluate whether LinkedIn connection status signals are achievable within ToS — they typically require the Sales Navigator API, which has a waitlist.

**Warning signs:**
- Puppeteer or Playwright in the LinkedIn integration code
- Using a $10/month "enrichment API" without asking about their data source
- No LinkedIn partner application started before development begins
- Feature spec says "real-time LinkedIn activity signals" without a specified API

**Phase to address:**
External integrations phase — before scoping LinkedIn features, confirm which LinkedIn API tier is achievable. Adjust feature scope to what the available API permits, not what the marketing spec assumes.

---

### Pitfall 7: Telephony/Zoom Transcript Ingestion Without PII Controls

**What goes wrong:**
Call recordings and transcripts contain sensitive information: deal terms, pricing concessions, competitor intelligence, personal health disclosures, salary information. Storing raw transcripts in PostgreSQL and passing them to an OpenRouter LLM means that data flows to a third-party AI provider. Customers in regulated industries (healthcare, financial services, legal) will not accept this. Even non-regulated customers may object when they realize their call content is being sent to an AI provider they didn't explicitly consent to.

**Why it happens:**
The existing AI stack uses OpenRouter with workspace-configurable model selection. Adding transcripts as context feels natural — just another record value. Teams add it without considering that transcripts differ from structured CRM data in sensitivity and consent requirements.

**How to avoid:**
Before ingesting any transcript, establish a clear consent and data handling policy surfaced during workspace setup. Implement configurable transcript handling: store transcript (with opt-in), use transcript for AI context (separate opt-in), redact PII before AI processing (names, phone numbers, SSNs using a regex/NLP pass before the LLM sees it). Transcripts should never be stored as plain `text_value` EAV — use a dedicated `call_recordings` table with explicit access controls. Document in your privacy policy exactly what AI providers receive.

**Warning signs:**
- Transcripts stored directly as record notes or attribute values
- No transcript consent checkbox in workspace settings
- OpenRouter calls include full transcript text without redaction
- No data residency or processing location controls

**Phase to address:**
Telephony integration phase — data governance design before any transcript storage or processing is implemented. This cannot be retrofitted cheaply.

---

### Pitfall 8: Context Window Explosion in AI Prompts

**What goes wrong:**
The current `buildSystemPrompt` in `ai-chat.ts` includes all object schemas. Adding deal context (record values, notes, email history, activity timeline, generated assets) to every AI invocation creates prompts that exceed model context limits or cost $0.10+ per proactive trigger. A workspace with 500 deals that gets a "deal stage changed" event on 20 deals per day is making 20 expensive LLM calls per day per workspace — with prompts that include the entire deal history. At scale this breaks both cost and latency.

**Why it happens:**
The reactive chat case is fine: user asks a question, AI responds with their specific deal context. The proactive case is different: many events fire simultaneously, each wanting full context. Teams reuse the reactive prompt-building logic without accounting for volume.

**How to avoid:**
Design a tiered context strategy before building any proactive generator:
- Tier 1 (observation): No LLM call — pure rule-based (deal stage = "Closed Won" → trigger handoff task). Zero cost.
- Tier 2 (light generation): Small model (e.g., `anthropic/claude-haiku`) with minimal context — just the changed record fields and a task template. For notifications and brief summaries.
- Tier 3 (heavy generation): Full model with rich context — only for high-value assets (proposals, competitive briefs) triggered explicitly or at significant milestones. Rate-limit per workspace.

Always pass only the fields that changed plus a compact record summary, never the full workspace schema, to proactive triggers. Cache the object schema portion of the system prompt (it changes rarely).

**Warning signs:**
- `buildSystemPrompt` called for every proactive trigger
- Same prompt-building code used for reactive chat and background jobs
- No cost tracking per workspace per month
- "It works in dev" — dev workspace has 5 records, prod has 5,000

**Phase to address:**
Proactive AI framework phase — define the tiered model strategy in the job schema (which tier does this job use?) before writing any job processor.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store tokens in workspace `settings` JSONB | No new table needed | Impossible to query expired tokens, no encryption isolation, can't revoke one integration without touching the whole settings blob | Never |
| Fire-and-forget AI generation in CRUD handlers | Feels simple, no queue to build | Request latency, silent failures, no retry, no audit trail | Never for LLM calls |
| Reuse reactive `buildSystemPrompt` for proactive triggers | One code path | Context explosion, cost explosion at scale | Never for bulk proactive actions |
| Store generated assets as EAV attribute values | Works immediately | No lifecycle tracking, bloats AI context, no approval workflow | Never |
| Build LinkedIn scraping for "MVP speed" | Feature ships fast | ToS violation, brittle, liability, breaks without warning | Never |
| Single API key for all workspace email connections | Easier OAuth setup | Scope creep, one compromised key exposes all tenant email | Never |
| Skip deduplication for webhook signals initially | Faster to ship first version | Duplicate data impossible to clean retroactively; duplicates are in the AI's context | Never if AI acts on signals |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Gmail API | Using `messages.list` polling instead of push notifications (Cloud Pub/Sub) | Register a push notification topic per workspace; process historyId deltas; dedup at the historyId level |
| Gmail API | Storing full email bodies in PostgreSQL text fields | Store metadata + headers immediately; fetch body on demand; apply retention policy (90-day default) |
| O365/Graph API | Assuming delegated permission works for background sync | Use application permissions with admin consent for background sync; delegated only for interactive flows |
| Google Calendar | Ignoring the `syncToken` pattern | Always store `syncToken` from the last full sync; use incremental sync on subsequent calls to avoid re-fetching entire calendars |
| Zoom webhooks | Not validating the webhook signature | Zoom sends `x-zm-signature` header; validate with HMAC-SHA256 before processing — required, not optional |
| LinkedIn (any) | Building against unofficial APIs | Official Sales Navigator API is the only compliant path; it has a waitlist; plan 2-3 months lead time |
| OpenRouter | No retry on 429/503 | Implement exponential backoff with jitter; workspace AI may hit rate limits during batch processing |
| OpenRouter | Streaming SSE in background jobs | Background jobs can't SSE; use non-streaming completions in the job queue; only stream in interactive chat |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| EAV correlated subquery per attribute in signal filter | Pipeline forecasting query takes 30+ seconds | Materialized summary columns on `records` table (deal_stage, deal_amount) for frequently-filtered fields | ~1,000 records per workspace |
| Loading full activity timeline into AI context | LLM calls time out or return 400 (context too long) | Paginate timeline; summarize periods older than 30 days with a separate digest job | ~50 activity events per deal |
| `buildSystemPrompt` called on every job | Each proactive job fetches all workspace objects and all their attributes | Cache object schema in Redis/memory with 5-minute TTL per workspace | ~10 concurrent jobs |
| Synchronous email sync on request thread | `/api/v1/sync` endpoint times out on first Gmail full sync | Full sync always async via job queue; return job ID immediately; poll for completion | Any account with >500 emails |
| Storing email bodies at full resolution | Database bloat; slow search; full-text index becomes unwieldy | Store only subject, from, to, date, snippet. Fetch full body from provider API on demand. | ~10,000 emails ingested |
| N+1 on activity timeline assembly | Timeline page takes 5+ seconds to load | Single query joining all activity sources (emails, calls, notes, stage changes) with `UNION ALL`; index on `(record_id, occurred_at)` | ~200 timeline events per record |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing OAuth tokens in plaintext in workspace settings JSONB | Any DB read exposure leaks all OAuth tokens for all tenants | Encrypt tokens with AES-256 using a key derived from `BETTER_AUTH_SECRET` + workspace ID; store only ciphertext |
| AI tool calling without workspace scope enforcement | LLM instructed to read records from another workspace | Every tool handler already receives `ctx.workspaceId` — every generated tool (new proactive tools) must enforce this; never trust workspace_id from LLM-generated arguments |
| Webhook endpoint without signature validation | Replay attacks, fake engagement signals poisoning AI context | All webhook endpoints must validate HMAC signatures before processing; return 200 immediately (before processing) to prevent retries |
| Email body content passed to AI without PII scrubbing | Sensitive customer data (NDA terms, health info, salary figures) sent to third-party LLM | Default to opt-in for AI processing of email bodies; apply regex/NLP redaction pass before LLM sees content |
| AI-generated content served to users without output sanitization | Prompt injection via email subjects that reach AI context; stored XSS in generated proposals | Sanitize all AI output before rendering in TipTap or HTML; treat AI output as untrusted user content |
| Approval workflow without re-auth | AI-approved contract sent by anyone who can access the approval UI | High-stakes approvals (contract send, discount approval) require re-authentication or explicit manager confirmation, not just clicking a button |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Aria posts to channels for every record change | Channel becomes noise within a day; reps mute it; AI loses its communication channel | Apply a relevance filter: only post for milestone events (new deal, stage advance past 50%, deal won/lost). Let reps configure notification thresholds per pipeline. |
| AI-generated email drafts in a modal the rep has to dismiss | Reps feel AI is interrupting their workflow | Surface generated drafts as ambient suggestions in a collapsible panel on the deal record, not as blocking modals |
| "AI is thinking..." with no progress visibility for long generation | Rep has no idea if the proposal generator is working or stuck | Show asset generation status in the deal record: queued / generating / ready for review / sent. Never show a spinner with no context. |
| Confirmation dialog for every AI write action | Rep fatigue; they approve everything without reading; defeats the purpose | Batch confirmations where possible. Low-risk actions (create draft note) = no confirmation. High-risk (send email, update stage) = single confirmation. Never chain multiple confirmation dialogs. |
| Win/loss analysis surfaced as a generic summary | Managers dismiss it as already-known information | Surface specific, named-rep pattern deviations: "Deals Jake closes use 2x more competitive battlecards. Deals lost had 40% fewer follow-up touches." Specific beats generic. |
| LinkedIn enrichment showing stale data with no timestamp | Reps make calls based on 8-month-old job titles | Always show enrichment data with a "last enriched" timestamp and a manual re-enrich button |

---

## "Looks Done But Isn't" Checklist

- [ ] **Email integration:** Shows "connected" in settings but token refresh hasn't been tested — verify that a token expiry event (simulate by setting `expires_at` to the past) triggers a transparent refresh, not a silent failure
- [ ] **Signal processing:** Webhook logs show signals received, but check for duplicate signal_ids in the `processed_signals` table — deduplication only works if it's actually being checked, not just inserted
- [ ] **Proactive AI generation:** Asset appears in the deal record — verify the `status` is `draft` (not `sent`) and that no send action was taken without user approval
- [ ] **Activity timeline:** Timeline shows email events — verify events are workspace-scoped: a user with access to two workspaces should not see emails from workspace A on records in workspace B
- [ ] **Contract generation:** Contract PDF renders correctly in the review UI — verify that deal values are populated from actual record data, not LLM hallucinations, by checking generated values against source record attributes
- [ ] **Approval workflow:** Approver clicks "Approve" — verify the approval creates an audit record (`approved_by`, `approved_at`) that cannot be edited later
- [ ] **Win/loss analysis:** Dashboard shows pattern data — verify that closed-lost deals are included, not just closed-won (selection bias in training data is a common oversight)
- [ ] **Rep coaching:** Performance comparison shows patterns — verify it's comparing same-territory, same-product reps, not all reps globally (comparing an SMB AE to an enterprise AE produces meaningless coaching signals)

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Generated assets stored as EAV values (no lifecycle table) | HIGH | Data migration: scan record_values for known asset-type json_value patterns, backfill into new `generated_assets` table, remove from EAV, update all references |
| OAuth tokens stored in workspace settings plaintext | HIGH | Encrypt in place: read all workspace settings, extract tokens, encrypt, write back. Requires downtime window or careful online migration with double-write. |
| No deduplication — duplicate signal records in DB | MEDIUM | Write a one-time dedup script keyed on `(provider, signal_id, workspace_id)`, keep the earliest record, delete duplicates. Then add the unique constraint. |
| AI fired proactive writes without approval gate | HIGH | Audit log review to find unauthorized actions; notify affected customers; add approval gate retroactively; cannot undo already-sent emails |
| Job queue built as fire-and-forget in request handlers | MEDIUM | Extract all `handleRecord*` calls to a new `background_jobs` table; update callers to enqueue instead of calling directly; test rollout per workspace |
| LinkedIn scraping flagged by LinkedIn | HIGH | No in-place fix — feature goes offline. Migrate to a compliant enrichment provider. Timeline: weeks. Data collected during scraping period may need to be deleted. |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| No job queue for proactive AI | Proactive AI framework (first task) | All proactive actions show in a `background_jobs` table with status; no LLM calls inside CRUD service functions |
| OAuth token mismanagement | Email/calendar integration (before first sync) | Token refresh test: set expires_at to past, trigger sync, verify new token fetched without user action |
| EAV misuse for generated assets | Asset generation (schema design before any generator) | `generated_assets` table exists with status column; no AI-generated proposal text in `record_values` |
| Signal deduplication missing | Signal processing (before first webhook connection) | Send same webhook payload twice; verify only one `processed_signals` row inserted and only one action taken |
| No approval gate for AI writes | Proactive AI framework (before any generator ships) | Trigger a deal stage change; verify AI-generated asset appears as `draft` status requiring approval before any write action |
| LinkedIn ToS violation | External integrations scoping (pre-development) | Enrichment provider contract in place; no Puppeteer/Playwright in integration code |
| Transcript PII in AI context | Telephony integration (before ingestion) | Call transcript stored in `call_recordings` table (not EAV); AI context test shows redacted version; consent toggle in workspace settings |
| Context window explosion | Proactive AI framework (define tiered strategy before any generator) | Background job schema includes `context_tier` field; light jobs use haiku-class model; system prompt is not rebuilt from scratch per job |

---

## Sources

- Codebase analysis: `apps/web/src/services/ai-chat.ts`, `apps/web/src/services/crm-events.ts`, `apps/web/src/services/records.ts`
- Architecture review: `CLAUDE.md` (EAV model, auth, multi-tenancy constraints)
- Project requirements: `.planning/PROJECT.md` (active feature list, constraints, key decisions)
- Domain knowledge: LLM tool-calling patterns, OAuth2 lifecycle, webhook delivery guarantees, LinkedIn API ToS — training data through Aug 2025, MEDIUM confidence on external API specifics
- Note: Live web search was unavailable during this research session. LinkedIn API and Gmail push notification specifics should be verified against current official documentation before implementation.

---
*Pitfalls research for: AI-driven CRM — proactive automation, signal processing, multi-channel integrations, document generation*
*Researched: 2026-03-10*
