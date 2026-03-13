# Project Research Summary

**Project:** OpenClaw CRM v2.0
**Domain:** AI-first CRM — brownfield feature integration on an existing Next.js 15 / Drizzle / PostgreSQL stack
**Researched:** 2026-03-11
**Confidence:** HIGH

## Executive Summary

OpenClaw v2.0 is a brownfield upgrade of an existing, well-structured CRM. The v1.0 codebase already has schema stubs, service scaffolding, and API routes for almost every v2.0 feature. The research reveals that the primary challenge is not building new systems from scratch — it is **correctly wiring together systems that already exist but are disconnected or contain concrete bugs**. The most critical finding is that the background job queue is a no-op: `processJobs()` marks every job completed without invoking handlers, and the `enqueueJob` call in `automation-engine.ts` passes arguments in the wrong order (workspaceId as job type, job type as payload). These two bugs silently disable AI generation, integration sync, activity scoring, webhook delivery, and analytics computation. Every async v2.0 feature depends on fixing these first.

The recommended approach follows the existing architectural grain: layered service pattern (API route → service → Drizzle → PostgreSQL), signal-driven reactivity (CRM events emit signal_events, which trigger automation evaluation, which enqueues jobs, which call handlers), and typed EAV for all record data. Net-new library additions are deliberately minimal — 9 packages cover everything (sonner, react-error-boundary, react-hook-form, @hookform/resolvers, @xyflow/react, @tanstack/react-virtual, papaparse, @tiptap/extension-mention, @tiptap/suggestion). The existing stack needs no replacement. Only 4 new database tables are required across all v2.0 features (comments, saved_views, webhook_subscriptions, webhook_deliveries).

The key risks center on three areas: (1) the job system bugs creating silent failures when real handlers are registered, (2) Gmail/Outlook sync edge cases (historyId invalidation, delta token expiry) causing re-sync storms in production with real user mailboxes, and (3) AI generation cost blowout from unthrottled signal-to-job cascades. All three are addressable with well-documented patterns — SKIP LOCKED for jobs, bounded partial-sync recovery for email, per-workspace budget tracking for AI generation — but they must be designed in from the start of each respective phase, not retrofitted.

---

## Key Findings

### Recommended Stack

The existing v1.0 stack (Next.js 15, Drizzle ORM, PostgreSQL 16+, Better Auth, shadcn/ui, TanStack Table v8, TipTap, dnd-kit, Zod, googleapis, assemblyai) is validated and complete. V2.0 adds 9 definite packages and 1 conditional. See `.planning/research/STACK.md` for full rationale.

**Core additions:**

- **sonner ^2.0.7**: Toast notifications — shadcn/ui native integration, imperative `toast()` API, replaces all `window.alert()` calls
- **react-error-boundary ^6.1.1**: Graceful error recovery in client components — wraps route segments and critical UI
- **react-hook-form ^7.54.0 + @hookform/resolvers ^5.2.2**: Form state with Zod integration — shadcn/ui Form component is built on this; handles EAV dynamic field arrays via `useFieldArray`; stay on v7 stable (v8 is in beta)
- **@xyflow/react ^12.10.1**: Visual automation builder UI — connects to existing `automation_rules` schema and `automation-engine.ts`; use for the workflow UI, NOT as a workflow execution engine
- **@tanstack/react-virtual ^3.13.21**: Virtual scrolling for record lists — same TanStack ecosystem as existing TanStack Table; replaces hardcoded `limit=200` across 6+ endpoints
- **papaparse ^5.5.2**: Production-grade CSV parsing with Web Worker support — replaces hand-rolled 60-line `parseCSV()` for import; existing `generateCSV()` for export is fine
- **@tiptap/extension-mention ^3.20.1 + @tiptap/suggestion ^3.20.1**: @mention support — first-party TipTap extensions, version-aligned with installed TipTap ^3.19.x
- **nuqs ^2.x** (conditional): URL state for shareable filtered/paginated table views — evaluate during pagination phase; skip if internal-only views suffice

Do NOT add: pg-boss, BullMQ, Redis, socket.io, Vercel AI SDK, Jotai/Zustand, tRPC, Prisma, xlsx/exceljs, Temporal, or n8n embed. The existing infrastructure handles all these needs at CRM scale.

### Expected Features

See `.planning/research/FEATURES.md` for full prioritization matrix, competitor analysis, and implementation patterns.

**Must have (table stakes — product feels broken without these):**

- Toast notification system (Sonner) — every SaaS product shows action feedback; `window.alert()` is unacceptable
- Confirmation dialogs (shadcn AlertDialog) — replace all `window.confirm()` calls
- Form validation with inline feedback — immediate field-level errors via react-hook-form + Zod
- Record table pagination (cursor-based) — current hardcoded `limit=200` breaks at scale; 6+ endpoints affected
- Background job execution loop — currently a no-op stub; unblocks ALL async features
- Email thread view on record detail — fundamental CRM behavior; every competitor has it
- Email compose on record detail — second most-used CRM action after viewing records
- Export records to CSV — GDPR/regulatory requirement; data portability
- Import with field mapping + dedup — #1 onboarding barrier when migrating from another CRM

**Should have (differentiators — deliver the AI-first promise):**

- AI asset generation pipeline — proposals, decks, follow-ups, battlecards auto-generated from deal context; the core differentiator
- Integration delta sync (Gmail/Outlook/Calendar) — feeds signal events that power all AI automation
- Activity scoring + hot leads dashboard — AI-driven lead prioritization
- Visual workflow automation builder — power user retention via form-based trigger-condition-action UI
- Analytics real calculations (win/loss, coaching, forecast) — wire up existing dashboard services
- Team @mentions and comments — collaboration inside CRM instead of Slack/email
- Saved views (shared filters) — team productivity via persisted filter configurations
- Outbound webhooks — developer ecosystem integration via event-driven delivery

**Defer to v3+:**

- Node-graph workflow editor (n8n/Zapier style) — form-based builder covers 90% of CRM automation use cases
- Duplicate detection on every save — import-only dedup first (expensive at EAV scale)
- Inline spreadsheet-style table editing — record detail editing is sufficient; high bug surface area with 17 attribute types
- Real-time WebSocket notifications — polling adequate for CRM; adds infrastructure complexity
- Built-in email marketing campaigns — different product, different data model, compliance requirements

### Architecture Approach

The architecture is a clean layered system (browser → middleware → API route → `getAuthContext()` → service → Drizzle → PostgreSQL) that all new features must follow without deviation. The core data model is typed EAV (`objects → attributes → records → record_values`). Background work routes through a `background_jobs` table polled by cron endpoints. CRM state changes flow through signal events to automation evaluation to job enqueue. AI generation always runs asynchronously via job handlers — never inline in request handlers. Every new table requires `workspace_id` + cascade deletion for multi-tenancy. Only 4 new tables cover all v2.0 features (comments, saved_views, webhook_subscriptions, webhook_deliveries). See `.planning/research/ARCHITECTURE.md` for component boundaries, data flow diagrams, and patterns to follow and avoid.

**Major components and integration approach:**

1. **Job Execution Engine** — Fix `processJobs()` to call `executeJob()`, add `FOR UPDATE SKIP LOCKED`, fix `enqueueJob` signature mismatch in `automation-engine.ts`. The entire async feature set depends on this.
2. **Signal-Automation Pipeline** — Wire `writeSignalEvent()` to auto-enqueue `signal_evaluate` jobs; connect `automation_rules` table to evaluation logic (currently hardcoded and disconnected from the table).
3. **AI Asset Generation Pipeline** — Build `services/generators/` with one file per asset type; extract shared `callOpenRouter()` from `ai-chat.ts`; register handlers in `instrumentation.ts`.
4. **Integration Delta Sync** — Gmail `history.list` delta sync, Outlook delta tokens with proactive refresh, Calendar `meeting_ended` signal emission. Bounded partial-sync recovery path mandatory before shipping.
5. **Analytics Engine** — Pure SQL aggregation against existing tables; summary/denormalized tables for EAV performance; cache with TTL.
6. **Email Compose + Thread View** — Email tab on record detail; thread view grouped by `thread_id`; compose via provider OAuth API (never SMTP relay for user-addressed mail).
7. **Activity Scoring** — Score as EAV attribute (Option A, recommended); recalculated by `lead_score` job on relevant signals.
8. **Team Collaboration** — Comments table (separate from Notes), @mentions via TipTap extension, saved_views table.
9. **Outbound Webhooks** — Two new tables; HTTP delivery via job queue; HMAC-SHA256 signing; circuit breaker pattern.
10. **Visual Workflow Builder** — Frontend-only CRUD against existing `automation_rules` table and routes; linear trigger-condition-action form UI.
11. **Import/Export** — Multi-step wizard; large imports as background jobs; pre-loaded lookup Map for dedup.

### Critical Pitfalls

See `.planning/research/PITFALLS.md` for all 15 pitfalls with code-level detail and phase-specific warnings.

1. **Job queue race conditions + enqueueJob signature mismatch (Pitfalls 1 and 15)** — processJobs() is a no-op and automation-engine.ts passes arguments in the wrong order. Fix both before registering any real handlers. Use `FOR UPDATE SKIP LOCKED` to prevent double-execution. Without this fix, no async feature works. Address first in the entire project.

2. **Gmail historyId invalidation causing re-sync storms (Pitfall 2)** — Stored historyId can expire after ~30 days or on mailbox changes. Naive full re-sync hits Gmail API quota and loops. Prevention: bounded partial-sync (last 7 days) on invalidation, not full re-sync. Build recovery path before shipping sync to users.

3. **Outlook delta token expiry for inactive users (Pitfall 3)** — Graph delta tokens expire after 7 days of non-use. Graph webhook subscriptions expire after ~3 days and require proactive renewal at 80% of max lifetime. Prevention: background job to proactively refresh delta tokens every 3-4 days; track `webhookExpiresAt` separately.

4. **AI generation cost blowout from signal cascades (Pitfall 4)** — A single busy deal can trigger 5-10 LLM calls/day. At 50 active deals, that is 250-500 calls/day at $0.01-0.10 each. Prevention: per-workspace daily budget tracking, 15-minute deduplication window per (type + recordId), model tiering (cheap models for follow-ups, expensive for proposals).

5. **Email compose deliverability via wrong send path (Pitfall 5)** — Always use user's OAuth token + provider API for email that appears to come from the user's address. SPF/DKIM/DMARC alignment fails with SMTP relay, causing spam classification. Reserve Resend for system notifications from a CRM-owned domain only.

---

## Implications for Roadmap

Based on combined research, the dependency graph is unambiguous and the phase structure follows directly from it. Feature research, architecture analysis, and pitfall research all independently converge on the same ordering.

### Phase 1: Infrastructure + UX Polish

**Rationale:** The job system bugs (Pitfalls 1 and 15) and the signal pipeline gap (writeSignalEvent not auto-enqueuing jobs) must be fixed before any real feature work begins. Simultaneously, UX polish (toasts, forms, pagination, error boundaries) is standalone with zero dependencies and delivers immediate user-visible improvement. These two workstreams can proceed in parallel within the phase.

**Delivers:** Working job execution system with `FOR UPDATE SKIP LOCKED`, correct signal-to-job routing, Sonner toast system throughout the app, shadcn AlertDialog replacing browser confirms, react-hook-form + Zod inline validation on all forms, cursor-based pagination replacing hardcoded `limit=200`, error boundaries on critical client components.

**Addresses features:** Toast notifications, confirmation dialogs, form validation, record pagination, background job execution loop.

**Avoids pitfalls:** Job race conditions (SKIP LOCKED), enqueueJob signature mismatch (fix before any handlers registered), notification fatigue (establish three-tier notification model before any feature adds toasts), cursor pagination ties (composite cursor with record_id tiebreaker).

**Stack additions:** sonner, react-error-boundary, react-hook-form, @hookform/resolvers, @tanstack/react-virtual (+ evaluate nuqs for URL state).

### Phase 2: AI Pipeline + Integration Sync

**Rationale:** The core product differentiator is AI-generated assets triggered by deal context changes. This requires the job system (Phase 1) to be working. Email sync is paired here because synced emails and meetings provide richer AI context and are the primary input to the signal events system. Email thread view is the natural UI output of sync being complete.

**Delivers:** Gmail delta sync with bounded partial-sync recovery, Outlook delta sync with proactive token refresh and webhook subscription renewal, Calendar meeting_ended signal emission, AI generators for opportunity_brief/followup/proposal/battlecard/deck in `services/generators/`, shared `callOpenRouter()` extracted from `ai-chat.ts`, generated asset inbox UI (review/approve/reject), email thread view on record detail.

**Addresses features:** Integration delta sync, AI asset generation pipeline, email thread view.

**Avoids pitfalls:** Gmail historyId invalidation (bounded partial-sync built in before launch), Outlook delta token expiry (proactive refresh jobs), AI cost blowout (per-workspace budget tracking and deduplication windows built into handlers from day one, not retrofitted).

**Stack additions:** No new packages (googleapis already installed, OpenRouter integration already in ai-chat.ts).

### Phase 3: Email Compose + Activity Scoring + Analytics

**Rationale:** These three features all depend on data from Phase 2 (synced emails, signal events, working OAuth tokens) but are independent of each other and can be developed in parallel. Analytics is included here to close the dashboard loop while synced data is fresh.

**Delivers:** Email compose side panel on record detail with TipTap editor, template picker, CC/BCC, open/click tracking, send via OAuth provider API; activity scoring via EAV attribute using tier-based labels (Hot/Warm/Cold) initially, not arbitrary point scores; hot leads dashboard view ordered by score; real win/loss, rep coaching, and forecast calculations with summary tables and cached results.

**Addresses features:** Email compose, activity scoring + hot leads, analytics real calculations.

**Avoids pitfalls:** Email deliverability (always OAuth API, never SMTP relay for user-addressed mail), activity scoring cold-start (ship tier-based labels with outcome feedback loop; calibrate point weights after 50+ closed deals), EAV analytics performance cliff (summary/denormalized tables and TTL cache designed in, not added later).

**Stack additions:** No new packages.

### Phase 4: Power User + Collaboration + Ecosystem

**Rationale:** These features are valuable for retention and expansion but depend on the core product being stable and trusted. They are mostly independent of each other and can be parallelized within the phase. Workflow builder is frontend-only. Team collaboration adds two new tables. Webhooks add two new tables. Import/export extends existing CSV utilities.

**Delivers:** Visual workflow automation builder (form-based trigger-condition-action UI against existing `automation_rules` table and API routes); team @mentions with notification creation in TipTap notes; threaded comments on records (separate from notes); private/team saved views with explicit sharing; multi-step CSV import wizard with PapaParse, field auto-mapping, dedup via pre-loaded lookup Map, batch processing via job queue; outbound webhooks with HMAC signing, exponential backoff, circuit breaker, and delivery log.

**Addresses features:** Visual automation builder, team @mentions and comments, saved views, import/export with field mapping, outbound webhooks.

**Avoids pitfalls:** Workflow builder complexity (form-based trigger-condition-action, not node-graph; defer visual graph to v3), mention resolution leaking across workspaces (always query through workspace_members join table), saved view privacy (default to private, explicit sharing action required), import EAV fuzzy matching performance (pre-loaded lookup Map built once per import, not per-row queries), webhook retry storms (exponential backoff with jitter, circuit breaker per URL after 5 consecutive failures).

**Stack additions:** @xyflow/react (workflow builder), @tiptap/extension-mention + @tiptap/suggestion (@mentions), papaparse (import).

### Phase Ordering Rationale

- **Job system first is non-negotiable.** Every async feature (AI generation, sync, scoring, webhooks, analytics computation) silently fails until the processJobs bug and enqueueJob signature mismatch are fixed. This was identified independently by both architecture and pitfalls research with specific line references.
- **AI pipeline and integration sync are co-dependent.** The AI generators benefit from synced email context; email thread view is the primary UI output of sync working. Building them together in Phase 2 avoids a half-delivered experience.
- **Analytics and activity scoring follow accumulated data.** Both produce meaningful results only after Phase 2 signal data exists. The dashboard threshold gates that already exist in the codebase enforce minimum data requirements.
- **Power user features come last** because they depend on the core product being stable and trusted. Workflow automation is most valuable when reps are already using email compose and AI drafts. Import/export is most valuable when the rest of the product is working. @mentions are most valuable when records are rich with activity.
- **Phase 4 features are highly parallelizable.** All four workstreams (workflow builder, collaboration, import/export, webhooks) are independent. A team can assign them to parallel streams within the same phase.

### Research Flags

Phases likely needing deeper research or prototyping during planning:

- **Phase 2 (Gmail sync):** The bounded partial-sync recovery path and Gmail Pub/Sub push notification setup involve non-trivial Google Workspace API configuration. The historyId invalidation handling specifically needs a test harness with a real old mailbox (not a fresh test account) to validate before shipping.
- **Phase 2 (AI generation prompts):** Research covers architecture and pipeline mechanics but cannot pre-validate prompt quality for each document type (proposal, deck, battlecard, follow-up, opportunity_brief). Initial prompts will require iteration against real deal data. Plan for prompt versioning from the start — the `promptVersion` field exists in the `generated_assets` schema.
- **Phase 3 (analytics summary tables):** The denormalized summary table schema and the background job that populates it need careful design against the EAV model. The specific columns required depend on which analytics reports are prioritized first (win/loss vs coaching vs forecast vs next-best-action).

Phases with well-documented patterns (skip research-phase):

- **Phase 1 (toasts, forms, pagination):** Sonner, react-hook-form, and TanStack Virtual are all well-documented with shadcn/ui integration guides. Cursor pagination is documented in Drizzle's official guides. Standard implementation throughout.
- **Phase 4 (webhooks):** Standard event-driven webhook delivery pattern. Well-documented across Pipedrive, GitHub, and Stripe implementations. HMAC signing and retry patterns are established.
- **Phase 4 (@mentions):** TipTap Mention extension is first-party with complete documentation. The workspace_members query pattern follows existing patterns already in the codebase.

---

## Confidence Assessment

| Area | Confidence | Notes |
| --- | --- | --- |
| Stack | HIGH | All packages verified on npm as of Mar 2026. shadcn/ui integration confirmed for sonner, react-hook-form, AlertDialog. TipTap extension versions verified as aligned with installed TipTap ^3.19.x. react-hook-form stays v7 stable (v8 is in beta with breaking changes). |
| Features | HIGH | Competitor analysis (HubSpot, Pipedrive, Salesforce) cross-referenced. Feature priorities derived from direct codebase inspection confirming what stubs exist vs what is missing. MVP definition grounded in dependency graph, not arbitrary grouping. |
| Architecture | HIGH | Based on direct inspection of 27 schema files, 44 services, 99 API routes. Two concrete bugs identified with exact file and line references. Component boundary table derived from actual code analysis. Anti-patterns identified from existing code decisions, not hypothetical scenarios. |
| Pitfalls | HIGH | 5 critical pitfalls with specific code references to existing codebase. Gmail/Outlook edge cases sourced from official Google/Microsoft documentation. AI cost patterns sourced from production LLM deployment analyses. Job queue pitfalls confirmed by reading the actual code. |

**Overall confidence:** HIGH

### Gaps to Address

- **nuqs (URL state) decision:** Whether shareable filtered views are a v2.0 requirement is a product decision, not a technical one. Confidence is MEDIUM. Evaluate at the start of Phase 1 pagination work. If yes, add nuqs; if internal-only views suffice, skip it.
- **AI prompt quality:** Research covers architecture and pipeline mechanics but cannot pre-validate prompt quality for each document type. Expect iteration cycles after first real-world usage. Build prompt versioning into the generator design from the start (the `promptVersion` field already exists in `generated_assets`).
- **Outlook push notification vs polling trade-off:** The architecture research recommends Graph webhook subscriptions as primary with polling as fallback. However, the 3-day renewal requirement adds operational complexity. If polling-only is preferred for simplicity in v2.0, the 7-day delta token expiry risk (Pitfall 3) must be covered by proactive refresh jobs. Make this decision during Phase 2 planning.
- **Analytics report prioritization:** Which of the four analytics services (win-loss, rep-coaching, forecasting, next-best-action) ship in Phase 3 vs defer affects the summary table schema design. Requires a product decision before Phase 3 implementation begins.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)

- `apps/web/src/services/job-queue.ts` — processJobs() no-op bug at lines 96-101, confirmed
- `apps/web/src/services/automation-engine.ts` — enqueueJob signature mismatch confirmed
- `apps/web/src/db/schema/` (27 files) — complete schema inventory for component boundary analysis
- `apps/web/src/services/` (44 files) — service layer analysis
- `apps/web/src/app/api/v1/` (99 routes) — API surface analysis
- `apps/web/src/lib/job-queue.ts` vs `services/job-queue.ts` — dual implementation and signature gap confirmed
- `apps/web/src/instrumentation.ts` — handler registration stubs confirmed

### Primary (HIGH confidence — official documentation)

- [Drizzle cursor-based pagination guide](https://orm.drizzle.team/docs/guides/cursor-based-pagination)
- [shadcn/ui Sonner component](https://ui.shadcn.com/docs/components/radix/sonner)
- [shadcn/ui Form component with react-hook-form](https://ui.shadcn.com/docs/forms/react-hook-form)
- [@xyflow/react npm — v12.10.1 verified Mar 2026](https://www.npmjs.com/package/@xyflow/react)
- [@tanstack/react-virtual npm — v3.13.21 verified Mar 2026](https://www.npmjs.com/package/@tanstack/react-virtual)
- [@tiptap/extension-mention npm — v3.20.1 verified Mar 2026](https://www.npmjs.com/package/@tiptap/extension-mention)
- [Gmail API synchronization guide](https://developers.google.com/workspace/gmail/api/guides/sync)
- [Gmail API usage limits](https://developers.google.com/workspace/gmail/api/reference/quota)
- [Microsoft Graph delta query overview](https://learn.microsoft.com/en-us/graph/delta-query-overview)
- [Microsoft Graph delta token expiry](https://learn.microsoft.com/en-us/answers/questions/1474436/expiry-details-for-the-deltatoken-used-in-delta-qu)

### Secondary (MEDIUM confidence — community/industry analysis)

- [CRM lead scoring evolution 2025](https://coefficient.io/lead-scoring/crm-lead-scoring) — composite scoring model patterns
- [Lead scoring rules and decay](https://monday.com/blog/crm-and-sales/lead-scoring-rules/) — 25% monthly decay best practice
- [LLM cost optimization guide](https://ai.koombea.com/blog/llm-cost-optimization) — model tiering patterns
- [1200 production LLM deployments analysis](https://www.zenml.io/blog/what-1200-production-deployments-reveal-about-llmops-in-2025) — generation cost patterns at scale
- [DKIM/DMARC/SPF best practices 2025](https://saleshive.com/blog/dkim-dmarc-spf-best-practices-email-security-deliverability/) — email deliverability
- [Outlook bulk sender requirements 2025](https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730) — DMARC enforcement
- [Salesforce Flow 2026 guide](https://www.default.com/post/salesforce-flow-building-visual-workflows-in-salesforce) — workflow builder patterns (what to adopt and what to avoid)
- [Cursor-based pagination deep dive](https://www.milanjovanovic.tech/blog/understanding-cursor-pagination-and-why-its-so-fast-deep-dive) — O(1) page performance regardless of depth
- [Webhook implementation patterns](https://www.leadwithskills.com/blogs/webhook-implementation-event-driven-integrations) — delivery, retry, idempotency

---
*Research completed: 2026-03-11*
*Ready for roadmap: yes*
