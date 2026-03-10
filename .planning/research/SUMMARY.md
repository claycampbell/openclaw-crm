# Project Research Summary

**Project:** OpenClaw CRM — AI-Driven Sales Pipeline Automation
**Domain:** B2B Sales CRM with proactive AI automation, multi-channel signal ingestion, and document generation
**Researched:** 2026-03-10
**Confidence:** MEDIUM (codebase examined directly; external API specifics unverified due to no live web search)

## Executive Summary

OpenClaw is evolving from a reactive CRM (AI responds when users ask) to a proactive one (AI acts when signals arrive). This is a well-understood architectural pattern in the AI-CRM category — the same shift Gong, Outreach, and Salesloft made — but it requires three new layers that the current codebase does not yet have: a signal ingestion layer (email/calendar/telephony webhooks), a durable background job system (to decouple AI generation from request handlers), and an AI action engine (to evaluate automation rules and dispatch document generators). None of the four research areas found significant disagreement about how to build this; the approach is mature and the patterns are established.

The recommended approach centers on a PostgreSQL-native job queue (pg-boss) that eliminates the need for Redis or external job platforms, a provider-adapter pattern for email/calendar integrations (one file per provider, shared interface), and a `generated_assets` table as the canonical home for all AI-produced content. The existing EAV architecture, OpenRouter AI integration, and agent channel system are all correct foundations — the new work extends them rather than replacing them. Email integration is the keystone feature: without it, the activity timeline is sparse, the AI has no signal data, and every differentiating feature is blind. Build email first.

The primary risk cluster is trust erosion from proactive AI that acts without human review. Every research area independently converged on the same guard: all AI-generated content must land in a `draft` state requiring explicit rep approval before any customer-facing action is taken. The secondary risk cluster is data hygiene — OAuth tokens must have dedicated encrypted storage with proactive refresh, email signals require deduplication, and transcripts require PII controls and consent gates. Both risk clusters are cheap to prevent during initial build and extremely expensive to retrofit after launch.

---

## Key Findings

### Recommended Stack

The existing stack (Next.js 15, Drizzle ORM, PostgreSQL 16+, Better Auth, OpenRouter, shadcn/ui) is solid and unchanged. Net-new additions are deliberately minimal: pg-boss for job queuing (PostgreSQL-backed, zero new infrastructure), googleapis and @microsoft/microsoft-graph-client for email/calendar OAuth, @aws-sdk/client-s3 for generated file storage, @react-pdf/renderer and pptxgenjs for document generation, twilio and assemblyai for telephony, and the Vercel AI SDK for structured LLM output. Proxycurl (not LinkedIn's official API) is the correct path for LinkedIn enrichment. No workflow engines, no Redis, no external job platforms — all deferred or rejected due to operational overhead relative to benefit at current scale.

**Core technologies (net-new):**
- `pg-boss ^10.x`: Durable job queue backed by existing PostgreSQL — eliminates Redis, enables retry/audit, Vercel Cron compatible
- `googleapis ^144.x` + `@microsoft/microsoft-graph-client ^3.x`: Gmail/Outlook OAuth sync, push notifications, calendar access
- `@aws-sdk/client-s3 ^3.x`: Store generated PDFs and PPTX without bloating the database
- `@react-pdf/renderer ^4.x` + `pptxgenjs ^3.x`: Server-side PDF/deck generation without a headless browser
- `twilio ^5.x` + `assemblyai ^4.x`: Call recording access and structured transcript extraction (chapters, action items, sentiment)
- `ai ^3.x` (Vercel AI SDK): `generateObject()` with Zod schemas for typed structured AI output — coexists with existing raw OpenRouter calls
- **Proxycurl** (HTTP only, no SDK): LinkedIn profile enrichment via compliant third-party — do not use the official LinkedIn API for enrichment

**Critical version checks needed before install:** All package versions are from August 2025 training data. Run `npm info <package> version` before installing. Pay particular attention to `@react-pdf/renderer` React 19 compatibility.

---

### Expected Features

Email integration and proactive AI asset generation on deal stage change are both table stakes and the core differentiator — they must ship together in v1 to validate the product promise. Every competitor monetizes AI features as premium add-ons; OpenClaw's opportunity is delivering all of it at the base price.

**Must have — v1 (table stakes or core differentiator):**
- Bi-directional Gmail / O365 sync with open/click tracking — reps will not adopt a CRM that doesn't auto-log email
- Activity timeline (unified: emails, meetings, calls, notes, tasks, stage changes) — the first thing managers open
- Deal stage change event hooks + async job queue — the infrastructure every proactive feature depends on
- Proactive AI asset generation on stage advance (proposal draft, opportunity brief) — this IS the product promise
- Meeting prep briefs (delivered T-30min before a linked calendar event) — immediate rep delight
- Post-meeting follow-up drafts (triggered when a meeting ends or notes are added) — closes every meeting loop automatically
- Calendar integration (Google / O365 meeting auto-log) — meetings are the highest-value sales events
- Role-based dashboards (rep + manager views) — managers block adoption without pipeline visibility

**Should have — v1.x (competitive differentiation):**
- AI outbound email sequence generation and execution
- Lead scoring with AI qualification explanation
- Approval workflow engine (discount routing, contract routing)
- Competitive battlecard auto-generation from deal signals
- Contract / SOW generation from deal data
- Signal-driven AI nudges (website visit / engagement scoring)

**Defer to v2+:**
- Win/loss pattern analysis (requires 90+ days of closed deal history)
- Rep performance coaching (requires multi-rep workspace data)
- Pipeline forecasting with AI confidence scores (requires historical close rates)
- Telephony / Zoom call recording + AI summarization (highest complexity, email covers most signal value first)
- LinkedIn integration and prospect enrichment (API access gating, compliance risk)
- Customer handoff brief to CS

**Hard anti-features (never build):**
- Full marketing automation / broadcast campaigns (different product, different persona)
- Custom SQL report builder (AI-generated summaries replace 90% of use cases)
- Native iOS/Android apps in v1 (responsive PWA covers the gap)
- Real-time collaborative proposal editing (async draft/review is correct model)
- LinkedIn scraping (ToS violation, liability, brittle)

---

### Architecture Approach

The architecture adds three layers to the existing foundation without changing it: an Integration Connector layer (per-provider adapter services that normalize external webhooks into internal signal events), a Signal Event Bus (a `signal_events` PostgreSQL table written transactionally with record mutations), and a Background Job Processor (pg-boss queue consumed by a cron-triggered worker). On top of these sits an extended AI Action Engine: the existing `crm-events.ts` plus a new `automation-engine.ts` that evaluates workspace automation rules and dispatches `ai_generate` jobs, which call new document generator services (`services/documents/proposal.ts`, `brief.ts`, `followup.ts`, etc.). All AI-generated content lands in a new `generated_assets` table with a `status` column (draft / approved / sent / archived) — never in EAV `record_values`.

**Major components:**
1. **Integration Connectors** (`services/integrations/gmail.ts`, `outlook.ts`, `google-calendar.ts`, `zoom.ts`) — per-provider OAuth and webhook normalization; each exports a shared interface so providers are interchangeable
2. **Signal Event Bus** (`signal_events` table, `services/signals.ts`) — transactional outbox pattern; every CRM state change and external signal writes a row here; the audit log and trigger source for all automation
3. **Background Job Queue** (pg-boss + `services/job-queue.ts`) — `ai_generate`, `email_send`, `email_sync`, `calendar_sync`, `signal_evaluate` job types; workers called by Vercel Cron route handlers at `/api/v1/cron/`
4. **Automation Engine** (`services/automation-engine.ts`) — rule evaluator that reads signal events and dispatches appropriate jobs; rules stored per-workspace
5. **Document Generators** (`services/documents/`) — context assemblers + LLM callers for each asset type; output to `generated_assets` table; notify rep via existing agent channels
6. **Generated Assets Table** (`ai_drafts` / `generated_assets`) — first-class lifecycle table for all AI-produced content; never the EAV model
7. **Activity Timeline** (`services/activity-timeline.ts`) — unified read view over signal events, emails, calls, notes, and stage changes; UNION ALL query indexed on `(record_id, occurred_at)`

---

### Critical Pitfalls

1. **No job queue before proactive AI features** — Firing OpenRouter calls inside record CRUD handlers causes request timeouts, silent failures, and no retry. The job queue must be built before any AI generator is written. No exceptions.

2. **OAuth token mismanagement** — Tokens expire (Google: 1 hour access, 6 months refresh on inactivity), rotate, and get revoked. Storing them in the workspace `settings` JSONB blob is unrecoverable. Build a dedicated `integration_tokens` table with `expires_at`, proactive refresh (5 minutes before expiry), and `invalid_grant` detection before the first OAuth sync.

3. **EAV misuse for AI-generated content** — Storing proposals, briefs, or sequences as `json_value` attribute values conflates CRM data (what EAV is for) with work product (which has its own lifecycle). Build the `generated_assets` table schema before writing any generator. Retrofitting this later requires a cross-workspace data migration.

4. **Signal deduplication gap** — Gmail Pub/Sub, Zoom webhooks, and O365 Graph subscriptions all deliver at-least-once. Without a `processed_signals` deduplication table with a unique constraint on `(provider, signal_id)`, every webhook retry creates duplicate activity events, duplicate AI triggers, and potentially duplicate sends. Build this before connecting any external signal source.

5. **Proactive AI writes without approval gates** — The existing chat system correctly gates writes behind `requiresConfirmation`. Background AI actions have no equivalent. Every proactive AI action must land as `status: "draft"` in `generated_assets` and require explicit rep approval before any customer-facing output is sent. Build the review/approval inbox UI before shipping the first generator — not after.

6. **Context window explosion** — Reusing `buildSystemPrompt` for background jobs passes the full workspace schema into every proactive generation call. At scale (20 stage changes/day per workspace, each triggering a generation), this is cost-prohibitive and hits context limits. Define a tiered context strategy (rule-based / light model / full model) in the job schema before writing any job processor.

---

## Implications for Roadmap

### Phase 1: Background Job Infrastructure
**Rationale:** Every proactive AI feature depends on async job processing. This has zero user-visible value on its own but is the prerequisite for every phase that follows. Building it first means every subsequent phase can use it immediately and the "fire-and-forget in CRUD handlers" anti-pattern never enters the codebase.
**Delivers:** `background_jobs` table (pg-boss schema), job enqueue/dequeue helpers (`services/job-queue.ts`), worker cron endpoint (`/api/v1/cron/sync`), retry logic with exponential backoff, dead-letter handling, job monitoring visibility.
**Addresses:** Pitfall 1 (no job queue), Pitfall 6 (context window tiering — define `context_tier` in job schema now).
**Avoids:** Any LLM calls inside CRUD service functions.

### Phase 2: Signal Event Bus + Automation Engine
**Rationale:** The signal event bus is the architecture's nervous system — everything reacts to it. Before email integration ships, establish the pattern: CRM events write to `signal_events` transactionally, a rule evaluator dispatches jobs. This phase makes the system "proactive" at the infrastructure level. Stage-change hooks are the most critical signal; they can be wired without email integration.
**Delivers:** `signal_events` table, `services/signals.ts` write helpers, `services/automation-engine.ts` rule evaluator, workspace-scoped automation rules table, stage-change-to-job dispatch wired through existing `records.ts`.
**Addresses:** Deal stage change event hooks (P1 feature), the architectural inflection point from reactive to proactive.
**Avoids:** Pitfall 4 (signal deduplication — build `processed_signals` table here before any external signals arrive).

### Phase 3: Email Integration (Gmail + O365)
**Rationale:** Email is the keystone dependency for the activity timeline, AI sequences, and post-meeting follow-ups. It is also the highest-complexity integration. Build it early so signal data starts accumulating. Gmail-first is correct — build O365 second using the same provider-adapter interface.
**Delivers:** `integration_tokens` table with encrypted storage + proactive refresh, Gmail OAuth connect/callback/disconnect flow, Gmail push notifications (Cloud Pub/Sub webhook), inbox delta sync (historyId cursor), email-to-record matching by contact email, `email_messages` table (not EAV storage), activity timeline email events, open/click tracking via Resend webhooks for outbound.
**Stack:** `googleapis ^144.x`, `ENCRYPTION_KEY` env var, `@google-cloud/pubsub` (optional — can use gcloud CLI for Pub/Sub subscription management).
**Addresses:** Pitfall 2 (OAuth token mismanagement — build `integration_tokens` before first sync), Performance Trap (email body storage — store metadata + snippet only, fetch body on demand).
**Research flag:** Gmail push notification quota limits and watch expiry duration should be verified against current Google documentation before implementation. O365 Graph subscription renewal requirements need verification.

### Phase 4: AI Document Generators + Generated Assets Table
**Rationale:** With the job queue, signal bus, and email integration in place, proactive document generation can ship. This phase delivers the product's core promise: "when a deal moves to Proposal, the AI drafts the proposal." The `generated_assets` schema must be defined before any generator is written.
**Delivers:** `generated_assets` table (id, workspace_id, record_id, asset_type, status, content, model_used, prompt_version, generated_at, approved_by), review/approval inbox UI, proposal generator, opportunity brief generator, meeting prep brief generator (pre-meeting trigger), post-meeting follow-up draft generator, rep approval flow (draft → approved → queued for send), agent channel notification for new drafts.
**Stack:** `ai ^3.x` (Vercel AI SDK `generateObject()` with Zod schemas), tiered context strategy (light model for notifications, full model for proposals).
**Addresses:** Pitfall 3 (EAV misuse), Pitfall 5 (no approval gate), Pitfall 8 (context window explosion), Proactive AI Asset Generation (P1), Post-Meeting Follow-up Drafts (P1), Meeting Prep Briefs (P1).
**Avoids:** Review/approval inbox ships before first generator, not after.

### Phase 5: Calendar Integration
**Rationale:** Calendar integration enables meeting auto-logging (which populates the activity timeline with the most valuable event type) and provides the trigger for meeting prep briefs. It depends on document generators already existing (meeting prep brief = a document generator triggered by calendar event T-30min).
**Delivers:** Google Calendar OAuth (shared credential with Gmail — single OAuth flow), calendar event delta sync (syncToken cursor), meeting-to-deal association (attendee email matching), meeting auto-log to activity timeline, meeting prep brief trigger (T-30min scheduled job), post-meeting follow-up trigger (meeting end event).
**Stack:** `googleapis` Calendar API (already installed in Phase 3).
**Addresses:** Calendar integration (P1 table stakes), meeting auto-log.

### Phase 6: Activity Timeline (Unified View)
**Rationale:** By Phase 6, signal events from email and calendar are accumulating. Now build the unified query layer that assembles them into a single chronological view. This is a read-only query (UNION ALL across signal_events, email_messages, notes, tasks, stage changes) — no new writes.
**Delivers:** `services/activity-timeline.ts` unified query, activity timeline UI component (deal record page), indexed on `(record_id, occurred_at)`, workspace-scoped (cross-workspace leakage prevention), AI-readable summary for deal context assembly.
**Addresses:** Activity timeline (P1 table stakes), Performance Trap (N+1 on timeline — UNION ALL with single query).

### Phase 7: Role-Based Dashboards
**Rationale:** Managers won't adopt without pipeline visibility. This phase adds the rep (my pipeline), manager (team pipeline), and leadership (revenue forecast) views using existing EAV query infrastructure and TanStack Table. No new backend work beyond aggregation queries.
**Delivers:** Rep pipeline dashboard, manager team pipeline view, basic pipeline summary (deal count, weighted value, stage distribution), configurable per-user view preferences.
**Addresses:** Role-based dashboards (P1 table stakes).

### Phase 8: Email Sequences
**Rationale:** With email integration stable and approval flow established, extend to sequence orchestration. This is the "AI fills the pipeline" phase — SDR outbound at scale. Requires the job queue (step scheduling), email integration (send execution), and approval flow (no sequence sends without rep review of generated steps).
**Delivers:** Sequence CRUD, sequence step scheduler (job-based), contact enrollment, reply detection to stop sequence, A/B variant tracking, Resend integration for outbound delivery.
**Stack:** No new dependencies — builds on job queue + email integration.
**Addresses:** AI outbound email sequences (P2).
**Research flag:** Send-time optimization and reply detection patterns — may need specific research into provider webhook detection for reply signals.

### Phase 9: Approval Workflow Engine + Contract/SOW Generation
**Rationale:** Enterprise deals stall without approval routing. Approval workflow is a prerequisite for contract generation (contracts must route before dispatch). Both are relatively self-contained but depend on the `generated_assets` table (Phase 4) and role-based permissions (already in place).
**Delivers:** `approval_requests` table (record_id, type, status, requested_by, approved_by, due_at), configurable rules per workspace (discount threshold, contract value threshold), escalation via pg-boss scheduled jobs for overdue approvals, contract/SOW generator service (`services/documents/contract.ts`), PDF output via `@react-pdf/renderer`, S3 storage for generated PDFs.
**Stack:** `@react-pdf/renderer ^4.x`, `@aws-sdk/client-s3 ^3.x`.
**Addresses:** Approval workflow engine (P2), Contract/SOW generation (P2), Pitfall 5 (high-stakes approvals require explicit re-authentication or manager confirmation, not just button click).

### Phase 10: Lead Scoring + Competitive Battlecards
**Rationale:** By Phase 10, engagement signals (email opens, meeting attendance, stage velocity) are accumulating from previous phases. Lead scoring is now a weighted formula over real data — meaningful rather than speculative. Battlecard generation requires competitor mention detection in emails and notes, which is also now available.
**Delivers:** Lead scoring engine (pg-boss job, weighted formula over `engagement_events`, score written as EAV `number_value`), AI qualification explanation (plain-language score rationale), competitive battlecard generator (`services/documents/battlecard.ts`, competitor mention detection in email subjects/note text), workspace-scoped battlecard library.
**Addresses:** Lead scoring + AI qualification (P2), Competitive battlecards (P2).

### Phase 11: Telephony Integration (Zoom + Call AI Summarization)
**Rationale:** Telephony is the highest-complexity, highest-value remaining integration. Deferred to Phase 11 because email and calendar cover the majority of signal collection. Telephony adds call recordings and transcripts — new signal types with significant PII implications requiring consent infrastructure built before any transcript is stored.
**Delivers:** Zoom recording webhook (`/api/v1/integrations/zoom/webhook`), transcript fetch via Zoom API, AssemblyAI structured transcription (chapters, action items, sentiment, speaker diarization), call auto-log to activity timeline, `call_recordings` table with explicit access controls, PII redaction pass before AI processing, per-workspace consent toggle.
**Stack:** `twilio ^5.x` (optional outbound calling), `assemblyai ^4.x`.
**Addresses:** Telephony + call AI summarization (P3), Pitfall 7 (transcript PII controls), Security Mistake (call content to AI without redaction).
**Research flag:** Zoom webhook signature verification, AssemblyAI async webhook pattern, PII redaction approach — research before implementation.

### Phase 12: Analytics + Forecasting (Data-Dependent)
**Rationale:** These features require 90+ days of closed deal history to produce meaningful insights. Building infrastructure now but surfacing insights only after data accumulates. Win/loss analysis requires confirmed win/loss labels on a statistically significant sample. Rep coaching requires multiple reps in a workspace with comparable territories.
**Delivers:** Win/loss pattern analysis (read-only query layer, AI narrative summary), rep performance coaching (cohort analysis, specific named deviations not generic), pipeline forecasting with AI confidence scores, engagement-signal-weighted probability.
**Addresses:** Win/loss pattern analysis (P3), Rep performance coaching (P3), Pipeline forecasting (P3).
**Avoids:** UX Pitfall (generic summaries dismissed by managers — surface specific, named-rep deviations; filter coaching by same-territory/same-product cohorts).
**Research flag:** This phase is data-dependent, not code-dependent. Defer surfacing insights until workspace has sufficient history (target: 30+ closed deals, 90+ days of activity).

---

### Phase Ordering Rationale

- **Infrastructure before features:** Job queue (Phase 1) and signal bus (Phase 2) are prerequisites for every proactive feature. Building them first means no anti-patterns enter the codebase and every subsequent phase builds on solid ground.
- **Email before calendar:** Email is the higher-volume signal source and the harder integration. Calendar OAuth can piggyback on Gmail credentials (single OAuth flow). Email must come first.
- **Document generators require approval UI:** Phase 4 ships the review/approval inbox before the first generator ships in the same phase. This is a hard constraint from pitfall research.
- **Sequences require stable email:** Phase 8 (sequences) comes after Phase 3 (email integration) is proven stable.
- **Contracts require approval workflow:** Phase 9 pairs approval workflow with contract generation because contracts without approval routing are unusable in enterprise deals.
- **Lead scoring and battlecards require signal data:** Phase 10 requires months of email signals (Phase 3) and note data to detect competitor mentions.
- **Telephony last of the integrations:** Highest complexity, most PII risk, least blocking. Email and calendar cover most signal collection.
- **Analytics last:** Strictly data-dependent. Code can be written earlier but surfacing is gated on data volume.

---

### Research Flags

Phases needing deeper research during planning:
- **Phase 3 (Email Integration):** Gmail push notification quota limits, watch expiry duration, and token rotation behavior should be verified against current Google documentation. O365 Graph subscription renewal (currently 3-day expiry per research) needs verification. Verify `googleapis ^144.x` is the current stable version.
- **Phase 8 (Email Sequences):** Reply detection via Gmail/O365 webhook signals — verify the specific webhook event types that indicate a sequence recipient replied.
- **Phase 9 (Contracts):** Verify `@react-pdf/renderer ^4.x` React 19 compatibility before install. PDF generation for legally-significant documents may have formatting requirements worth researching.
- **Phase 11 (Telephony):** Zoom webhook signature format, AssemblyAI async transcription webhook pattern, PII redaction approach (regex vs NLP) — all need research before implementation begins.
- **Phase 12 (Analytics):** Statistical significance thresholds for win/loss pattern claims — research what minimum deal volume produces reliable patterns to avoid surfacing misleading insights.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Job Queue):** pg-boss is well-documented. Pattern is established.
- **Phase 2 (Signal Bus):** Transactional outbox is a known pattern. Direct implementation from architecture research.
- **Phase 4 (Document Generators):** LLM context assembly + Vercel AI SDK `generateObject()` — standard pattern, no research needed.
- **Phase 5 (Calendar):** Same OAuth credential as Gmail. Calendar delta sync (syncToken) is documented.
- **Phase 6 (Activity Timeline):** Read-only UNION ALL query — no research needed.
- **Phase 7 (Dashboards):** TanStack Table already in stack. Aggregation queries over existing EAV data.
- **Phase 10 (Lead Scoring):** Weighted formula over existing data. No external API research needed.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Existing stack (HIGH). Net-new packages: versions from August 2025 training data, unverified against current npm registry. Verify all versions before install. |
| Features | MEDIUM | Core features from PROJECT.md and codebase (HIGH). Competitor feature parity claims from training data through August 2025 — may be stale as Salesforce Agentforce and HubSpot Breeze evolved in late 2024/early 2025. |
| Architecture | HIGH | Patterns derived from direct codebase examination plus well-established CRM architecture patterns. The transactional outbox, provider adapter, and tiered AI context patterns are mature and validated. |
| Pitfalls | MEDIUM-HIGH | Pitfalls derived from codebase analysis (HIGH confidence for existing code smell) and domain knowledge (MEDIUM for external API specifics). OAuth token rotation behavior and LinkedIn API access policy should be verified before implementation. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **LinkedIn API access:** Research confirms LinkedIn's official API does not provide enrichment data without a Sales Navigator license and partner program membership (months-long approval). Proxycurl is the recommended alternative. Gap: confirm Proxycurl's current pricing and data freshness guarantees, and determine whether the product needs real-time LinkedIn signals (not available through any compliant API) or static enrichment (available through Proxycurl).
- **Package version verification:** All net-new package versions are from August 2025 training data. Run `npm info <package> version` for every package in STACK.md before the first install command in any phase.
- **Deployment model for pg-boss workers:** Architecture research identifies a Vercel-specific constraint — pg-boss workers cannot run as persistent processes on serverless. If deploying to Vercel, a separate worker process on Railway/Fly.io is required. This deployment decision should be made before Phase 1 and documented in the project constraints.
- **OpenRouter model selection for tiered context strategy:** Phase 4 defines a tiered context strategy (rule-based / light model / full model). The specific model choices (e.g., claude-haiku equivalent on OpenRouter for light tier) depend on current model availability and pricing. Validate during Phase 4 planning.
- **Competitor feature parity:** The feature research competitor table is from August 2025 training data. Salesforce Agentforce and HubSpot Breeze both launched significant AI features in late 2024/early 2025. Review current competitor documentation before using feature comparison in sales or marketing materials.

---

## Sources

### Primary (HIGH confidence)
- Codebase direct examination — `services/ai-chat.ts`, `services/crm-events.ts`, `services/records.ts`, `db/schema/`, `CLAUDE.md` architecture overview
- `.planning/PROJECT.md` — feature requirements from product owner
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/INTEGRATIONS.md` — existing system capabilities and gaps
- `.planning/CONCERNS.md` — technical constraints affecting feature complexity

### Secondary (MEDIUM confidence)
- Training data through August 2025 — pg-boss v10, googleapis v144, @react-pdf/renderer v4, Vercel AI SDK v3, AssemblyAI v4, Twilio v5 patterns
- Vercel Cron Jobs documentation (official, verified 2026-02-27) — scheduling pattern, HTTP GET trigger
- Salesforce Einstein / HubSpot Breeze / Close CRM / Outreach / Gong product knowledge through August 2025

### Tertiary (LOW confidence)
- LinkedIn API access restrictions — training data; LinkedIn changes API policies frequently; verify current access tiers before scoping LinkedIn features
- Gmail push notification quota limits and watch expiry — verify against current Google Cloud documentation before implementation
- O365 Graph subscription expiry duration — verify against current Microsoft documentation

---

*Research completed: 2026-03-10*
*Ready for roadmap: yes*
