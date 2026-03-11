# Feature Research

**Domain:** AI-first CRM v2.0 -- infrastructure wiring, UX polish, and differentiation features
**Researched:** 2026-03-11
**Confidence:** HIGH (existing codebase inspected, web search verified, CRM competitor patterns well-documented)

## Context

This research covers the NEW features for v2.0. The existing v1.0 foundation includes: Records CRUD, Kanban, Tasks, Notes, Search, Lists, Custom Objects, AI Chat (25 tools), Sequences, Approvals, Contracts, Handoff, Battlecards, Dashboards, Notifications, Settings, Integration OAuth flows, and webhook endpoints. Many v2.0 features have existing schema stubs and service scaffolding that need to be wired up rather than built from scratch.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in any production-grade CRM. Missing these = product feels broken or unfinished.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Toast notification system | Every SaaS product shows feedback on user actions. Browser `alert()`/`confirm()` is amateur hour. Users expect inline success/error/loading feedback on every mutation. | LOW | Sonner is already chosen per PROJECT.md key decisions. 2-3KB gzipped, TypeScript-first, works from anywhere via imperative API (`toast.success()`). shadcn/ui has a native Sonner component. Wire `<Toaster />` at root layout, systematically replace all `window.alert()` and `window.confirm()` calls. Pattern: 3s info, 5s warning, 8s error auto-dismiss, `toast.promise()` for async operations. |
| Confirmation dialogs | Browser `confirm()` blocks the JS thread, cannot be styled, and looks different per OS. Users expect consistent in-app confirmation modals. | LOW | shadcn/ui `AlertDialog` component. Create a reusable `useConfirmDialog` hook or `<ConfirmDialog>` wrapper that accepts title, description, destructive flag, and onConfirm callback. Audit codebase for all `window.confirm()` usage and replace. |
| Form validation with inline feedback | Submitting forms with no validation or only server-side errors feels broken. Users expect immediate field-level error messages. | LOW-MEDIUM | Zod schemas for validation (already in stack via Drizzle). Two approaches: (1) Client-side with react-hook-form + Zod resolver for instant feedback, or (2) Server actions returning `{ fieldErrors }` rendered inline. Recommendation: react-hook-form + Zod for create/edit forms since it handles touched/dirty state and real-time validation. Display errors in red text below each field. |
| Record table pagination | Current hardcoded `limit=200` (found in `use-object-records.ts`, `use-list.ts`, `task-list.tsx`) breaks at scale. Users with 1000+ records see only the first 200. No indication data is truncated. | MEDIUM | Cursor-based pagination using `createdAt` + `id` as composite cursor (PROJECT.md already chose cursor-based). API endpoints already accept `limit` param -- add `cursor` param that returns `{ data, nextCursor, hasMore }`. Client uses TanStack Query `useInfiniteQuery` with `getNextPageParam`. Start with "Load more" button; add Intersection Observer infinite scroll as enhancement. Must update all 6+ endpoints currently using `limit=200`. |
| Email thread view on record detail | Seeing email history on a record is fundamental CRM behavior. Without it, reps alt-tab to Gmail constantly, defeating the purpose of integration. Every competitor (HubSpot, Pipedrive, Salesforce) shows email threads on contact/deal records. | MEDIUM | The `email_messages` schema already exists with `recordId`, `threadId`, `direction`, `snippet`, `receivedAt`, open/click tracking fields. Query by `recordId`, group by `threadId`, render as collapsible conversation threads showing direction arrows (inbound/outbound), sender, snippet, and timestamp. Lazy-load full body from Gmail/Outlook API on thread expand to avoid storing large HTML bodies. |
| Email compose on record detail | Reps expect to send emails without leaving the CRM. This is the second most-used CRM action after viewing records. | MEDIUM | Slide-out compose panel on record detail page (like HubSpot sidebar). TipTap editor for body (already used for notes). Auto-populate "To" from record's email attribute. Template picker for saved templates. CC/BCC expansion. Send via connected Gmail/Outlook OAuth tokens through integration service. Store sent copy in `email_messages` with direction=outbound. Add open pixel and link wrapping for click tracking (schema fields `openedAt`/`clickedAt` already exist). |
| Export records to CSV | Users need their data out. GDPR/regulatory requirement. Also needed for reporting in external tools. | MEDIUM | Flatten EAV to columnar format: query records + attribute values, pivot `record_values` rows into columns using attribute names as headers. Stream large exports using ReadableStream to avoid memory issues. Allow exporting filtered views or all records. Include attribute display names as column headers. |
| Import with field mapping | Migrating from another CRM is the #1 onboarding action. No import = massive adoption barrier. Current import exists but lacks mapping UI. | HIGH | Multi-step wizard: (1) Upload CSV/XLSX via drag-drop zone, (2) Parse headers and auto-map to attributes by fuzzy name match, (3) Manual correction UI for unmapped/mismatched fields with dropdown selectors, (4) Preview first 5 rows with mapped values, (5) Configure dedup strategy (skip/update/create all) with match field selection (email, name+company, or external ID), (6) Execute with progress bar. EAV consideration: each CSV row creates 1 `record` + N `record_values` rows. Batch insert in transactions of 100 rows for performance + rollback safety. |

### Differentiators (Competitive Advantage)

Features that deliver on the "AI does the work" promise and justify switching from established CRMs.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Background job execution loop | Unblocks every async feature. Without this, the AI generation pipeline, integration sync, scoring, and webhooks are all dead code. The `background_jobs` table and `enqueueJob()` exist but the execution loop is a no-op stub. | MEDIUM | Poll `background_jobs` where `status='pending' AND run_at <= now()` on a configurable interval (5-10s). Claim job with `UPDATE SET status='running', started_at=now() WHERE id=? AND status='pending'` (row-level lock prevents double-execution). Route to type-specific handlers: `ai_generate`, `lead_score`, `email_send`, `email_sync`, `calendar_sync`, `webhook_deliver`. Handle failures with retry (3 attempts, exponential backoff). Run via Next.js cron route (`/api/v1/cron`) or instrumentation.ts. |
| AI asset generation pipeline | The core differentiator. No competitor auto-generates proposals, decks, battlecards, and follow-ups from deal context without the rep asking. The automation engine already enqueues these jobs on stage changes and meeting events via `evaluateSignalForGeneration()`. | HIGH | Job handlers for `ai_generate` type: (1) Fetch full record context (deal attribute values, associated notes, emails, related people/companies), (2) Select prompt template by `documentType` (proposal, deck, followup, battlecard, opportunity_brief), (3) Call OpenRouter with context, (4) Store result in `generated_assets` table, (5) Notify the rep. The `generated_assets` schema exists. Need the actual handler implementations + UI to view, edit, and approve generated assets on record detail page. |
| Integration delta sync (Gmail/Outlook/Calendar) | Feeds the signal events system that powers all AI automation. OAuth flows exist; webhook endpoints exist; actual sync processing is stubbed. | HIGH | Gmail: Use `history.list` with stored `historyId` for incremental sync. Outlook: Use delta query with `deltaToken`. Calendar: Use push notifications or polling with sync tokens. Each sync run: fetch new messages/events, deduplicate via `processed_signals`, write to `email_messages`/`calendar_events`, emit `signal_events` for automation engine evaluation. Must handle token refresh, rate limits, and partial failures gracefully. |
| Activity scoring + hot leads | AI-driven lead prioritization is the #1 requested AI feature in CRM. Most CRMs offer basic point rules; AI scoring with time decay is rare outside $150k+ enterprise tiers. | HIGH | Multi-dimensional scoring model: Demographic fit 40% (title match to ICP, company size, industry), Behavioral engagement 40% (email opens +2pts, replies +10, meetings booked +15, notes added +5, stage advances +20), Recency 20% (25% monthly decay without new activity per industry best practice). Store composite score as a system attribute on People/Company records or in a dedicated `lead_scores` table. Background job `lead_score` already exists as a stub type. "Hot Leads" dashboard widget: top 20 records by score with 7-day trend arrows. Configurable ICP criteria per workspace. |
| Visual workflow automation builder | Power users create custom automations without code. The `automation_rules` table and `automation-engine.ts` evaluation logic already exist. This adds the UI. | HIGH | NOT a node-graph canvas (see Anti-Features). Structured form-based builder: (1) Name + enable/disable toggle, (2) Trigger type dropdown mapping to signal types (stage_changed, record_created, email_received, meeting_ended, note_added), (3) Conditions builder with field/operator/value rows using AND logic (matches existing `conditions` jsonb column), (4) Action type dropdown (matches `automationActionEnum`: enqueue_ai_generate, enqueue_email_send, create_task, create_note, etc.), (5) Action-specific payload form. Stores directly into existing `automation_rules` table. Add "test rule" dry run against recent signals. List view of all rules with enable/disable toggles and last-triggered timestamp. |
| Analytics real calculations | Dashboard pages exist with data threshold gates but show placeholder data. Wiring up real win/loss, coaching, and forecast calculations makes the existing UI actually useful. | MEDIUM | Win/loss: Query closed deals grouped by attributes (stage duration, stakeholder count, deal size buckets) to find statistical patterns. Coaching: Compare per-rep activity metrics (emails sent, meetings held, response time) against team averages and top performer benchmarks. Forecast: Weighted pipeline value using stage probabilities calibrated from historical close rates. All calculations run as background jobs and cache results. |
| Team @mentions in notes/comments | Keeps collaboration inside the CRM instead of pushing it to Slack or email. Most mid-market CRMs (HubSpot, Pipedrive, Zoho) support this. | MEDIUM | TipTap already used for notes; it has a Mention extension that provides @-autocomplete with user list. Parse `@username` references on save, resolve to user IDs, create notification records for each mentioned user. Add a lightweight `comments` feature on records (simpler than notes -- short text with @mention support, displayed as a threaded list). This is incremental, not a rewrite -- extends the existing notes system. |
| Saved views (shared filters) | Teams need to share filtered record views ("My open deals", "High-value stale leads"). Individual saved views are expected; shared team views differentiate. | LOW-MEDIUM | Store filter configurations (already have `FilterGroup`/`FilterCondition` in packages/shared) with name, owner_id, workspace_id, object_slug, visibility (private/team), and the filter JSON. Display as a dropdown or sidebar list on object pages. Quick-apply a saved view to load its filters into the table. |
| Outbound webhooks on CRM events | Enables developer integrations without polling. Essential for technical users connecting the CRM to Zapier, n8n, or custom systems. | MEDIUM | Webhook subscriptions table: URL, event types (multi-select), optional HMAC secret, active/inactive toggle, created_by. Events: record.created, record.updated, record.deleted, deal.stage_changed, deal.closed, email.received. Standard envelope: `{ event, timestamp, workspace_id, data }`. Delivery via job queue (async): POST to URL, retry 3x with exponential backoff (1min, 5min, 30min), log each attempt with HTTP status. HMAC-SHA256 signature in `X-Webhook-Signature` header. The signal events system already captures all CRM events -- webhooks subscribe to the same event bus. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems for this project scope and architecture.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full node-graph workflow editor (n8n/Zapier style) | Power users want unlimited flexibility in automation | Massive engineering effort: custom canvas rendering, node type registry, edge routing, execution engine with branching/loops, error handling per node. The existing trigger-condition-action model covers 90% of CRM automation use cases. Node graphs are for integration platforms, not CRMs. | Structured form-based automation builder with trigger/condition/action steps. Covers stage-change automations, task creation, email sending, AI generation. Add multi-action support (sequential actions per rule) if single-action proves limiting. |
| Duplicate detection on every record save | "Always prevent duplicates automatically" | Running dedup on every save is expensive with EAV -- requires cross-record value comparison on text_value columns. High false positive rate frustrates users ("John Smith" matches hundreds of records). Performance degrades with record count. | Dedup during import only (batch operation where cost is acceptable and user expects a review step). Add optional manual "Find duplicates" action that runs as a background job. Merge UI for confirmed duplicate pairs. |
| Inline spreadsheet-style table editing | "Edit records like Excel without opening each one" | Complex with EAV model -- each cell edit needs attribute type awareness, type-specific validation, optimistic updates across typed columns (`text_value`, `number_value`, `date_value`, etc.). High bug surface area with 17 attribute types. | Click-to-edit individual fields on record detail page (existing pattern). Bulk edit via import/re-import with "update existing" dedup mode. Add bulk actions (change status, assign owner) for common multi-record operations. |
| Real-time collaborative editing of notes/documents | "Google Docs-style collaboration in the CRM" | Requires CRDT or OT implementation, persistent WebSocket connections, conflict resolution, cursor presence indicators. CRM notes are short and single-author 99% of the time. PROJECT.md explicitly lists this as out of scope. | @mentions for collaboration. Optimistic locking (last-write-wins with conflict warning if another user edited since you opened). Activity feed shows who edited what. |
| Built-in email marketing (campaigns, newsletters, A/B testing) | "HubSpot has campaigns, we should too" | Fundamentally different product with different data model (lists vs. segments, broadcast vs. 1:1), compliance requirements (CAN-SPAM, GDPR opt-out management), deliverability reputation management. Dilutes the sales-native focus. PROJECT.md explicitly excludes marketing automation. | Sales sequences (already built) for 1:1 SDR outreach. Outbound webhooks let marketing tools subscribe to CRM events. |
| Universal real-time notifications via WebSocket | "Push everything to the browser in real-time" | Requires WebSocket infrastructure (persistent connections, reconnection logic, scaling across multiple Next.js instances). Most CRM notifications are not time-critical enough to justify the complexity. | Poll notifications on a 30-60s interval. Use Sonner toasts for immediate feedback on user-initiated actions. Reserve real-time push for a future version if user demand validates it. |

---

## Feature Dependencies

```
Background Job Processor (infrastructure, unblocks everything)
    +-- AI Asset Generation (needs job execution for ai_generate type)
    +-- Activity Scoring (needs background computation for lead_score type)
    +-- Integration Delta Sync (needs job execution for email_sync/calendar_sync)
    +-- Outbound Webhooks (needs async delivery with retry via job queue)
    +-- Analytics Calculations (needs background aggregation jobs)

Signal Events System (infrastructure, already exists and emits events)
    +-- Automation Engine (evaluates signals, already exists)
    |   +-- Visual Automation Builder (UI for automation_rules table)
    +-- Outbound Webhooks (subscribe to signal event types)
    +-- Activity Scoring (engagement signals feed score computation)

Integration Delta Sync (Gmail/Outlook/Calendar)
    +-- Email Thread View (needs synced email_messages rows to display)
    +-- Email Compose (needs valid OAuth tokens to send via provider API)
    +-- AI Asset Generation (richer context from synced emails/meetings)
    +-- Activity Scoring (email engagement signals)

Toast Notification System (standalone, no dependencies)
    enhances --> Confirmation Dialogs (toast feedback after confirm action)
    enhances --> Form Validation (toast for submit-level errors)
    enhances --> Every mutation across the app

Record Pagination (standalone, no dependencies)

Import/Export (standalone)
    +-- Field Mapping UI (sub-feature of import wizard)
    +-- Duplicate Detection (optional step within import flow)

@Mentions (incremental addition)
    requires --> TipTap Mention Extension (available, not yet installed)
    requires --> Notification System (exists, creates notification records)
    enhances --> Notes (already built with TipTap)
    enables  --> Comments on records (new lightweight feature)

Saved Views
    requires --> Filter System (exists in packages/shared as FilterGroup/FilterCondition)
    enhances --> Object record pages (sidebar filter presets)
```

### Dependency Notes

- **Background Job Processor is the keystone:** AI generation, scoring, sync, webhooks, and analytics ALL depend on jobs actually executing. This must be Phase 1, week 1.
- **Integration Sync enables email features:** Email thread view and compose both require synced `email_messages` data and working OAuth tokens. Sync must precede email UI work.
- **Toast system is standalone and high-impact:** Zero dependencies, immediate UX improvement across the entire app. Ship first.
- **Visual Automation Builder is UI-only:** The engine and schema exist. This is purely a frontend feature that writes/reads `automation_rules` rows. Can be built independently after core infra.
- **@Mentions are incremental:** TipTap Mention extension adds to existing notes. Not a rewrite. Can be added at any point after core features stabilize.
- **Outbound webhooks tap into existing event bus:** Signal events already capture all CRM events. Webhooks just add HTTP delivery as a subscriber. Moderate effort, independent of other v2 features.

---

## MVP Definition

### Phase 1: Infrastructure + UX Polish (build first, unblocks everything)

- [ ] Background job execution loop -- literally everything async depends on this
- [ ] Toast notification system (Sonner) -- immediate UX improvement, zero dependencies
- [ ] Confirmation dialogs (shadcn AlertDialog) -- replace all browser confirms
- [ ] Form validation with inline feedback (Zod + react-hook-form) -- production-grade forms
- [ ] Record pagination (cursor-based + "Load more") -- unblocks working with real data volumes

### Phase 2: Core AI Pipeline + Email (build second, delivers the product promise)

- [ ] Integration delta sync (Gmail/Outlook/Calendar) -- feeds signal events for AI
- [ ] AI asset generation pipeline (proposal, deck, followup, battlecard, brief handlers) -- the differentiator
- [ ] Email thread view on record detail -- makes synced emails visible
- [ ] Email compose on record detail -- send from CRM
- [ ] Activity scoring + hot leads dashboard -- AI-driven prioritization
- [ ] Analytics real calculations (win/loss, coaching, forecast) -- complete the dashboards

### Phase 3: Power User + Collaboration (build third, retention features)

- [ ] Visual workflow automation builder -- power user retention
- [ ] Team @mentions and comments -- collaboration inside CRM
- [ ] Saved views (shared filters) -- team productivity
- [ ] Import/export with field mapping + dedup -- onboarding and data portability
- [ ] Outbound webhooks on CRM events -- developer ecosystem

### Defer to v3+

- [ ] Node-graph workflow editor -- structured builder covers 90% of use cases
- [ ] Duplicate detection on every save -- import-only dedup first
- [ ] Inline table editing -- detail page editing sufficient
- [ ] Real-time WebSocket notifications -- polling adequate for CRM
- [ ] Dashboard widget customization -- role-based layouts sufficient

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Toast notifications (Sonner) | HIGH | LOW | P1 |
| Confirmation dialogs | HIGH | LOW | P1 |
| Form validation (inline) | HIGH | LOW-MEDIUM | P1 |
| Record pagination (cursor) | HIGH | MEDIUM | P1 |
| Background job processor | HIGH (unblocks all) | MEDIUM | P1 |
| Integration delta sync | HIGH | HIGH | P1 |
| AI asset generation pipeline | HIGH | HIGH | P1 |
| Email thread view | HIGH | MEDIUM | P1 |
| Email compose | HIGH | MEDIUM | P2 |
| Activity scoring + hot leads | HIGH | HIGH | P2 |
| Analytics calculations | MEDIUM | MEDIUM | P2 |
| Visual automation builder | MEDIUM | HIGH | P2 |
| Import/export + field mapping | HIGH | HIGH | P2 |
| @Mentions + comments | MEDIUM | MEDIUM | P2 |
| Saved views | MEDIUM | LOW-MEDIUM | P2 |
| Outbound webhooks | MEDIUM | MEDIUM | P3 |

**Priority key:**
- P1: Must have -- unblocks other features or delivers core product promise
- P2: Should have -- significant user value, build when P1 is stable
- P3: Nice to have -- developer-facing ecosystem feature

---

## Competitor Feature Analysis

| Feature | HubSpot | Pipedrive | Salesforce | OpenClaw v2.0 Approach |
|---------|---------|-----------|------------|------------------------|
| Workflow automation | Visual builder on premium tiers ($800+/mo). Trigger-action with branching. Powerful but expensive. | Basic automations on deal stages. No visual builder on starter. | Salesforce Flow -- full node-graph builder. Extremely powerful, steep learning curve. | Form-based builder (trigger + conditions + action). Simpler than Salesforce, more capable than Pipedrive. AI can suggest automations. Ships in base product, not premium tier. |
| Lead/activity scoring | Points-based rules on contact properties + engagement. Predictive scoring on Enterprise only ($3600+/mo). | No native scoring. Requires third-party. | Einstein Lead Scoring -- ML-based, premium add-on ($$$). | AI-first scoring: multi-dimensional (fit + engagement + recency decay). Background-computed, auto-updating. Available to all users, not premium-gated. |
| Email on records | Full email client in contact/deal timeline. Templates, tracking, scheduling. Industry-leading. | Email sync + compose on deals. Thread view. Solid mid-market implementation. | Email-to-Salesforce logging + Lightning compose. Complex setup, powerful once working. | Compose panel with TipTap on record detail. Thread view grouped by threadId. Template insertion. Open/click tracking. Simpler than HubSpot, more native than Salesforce. |
| Import/export | Sophisticated import with property mapping, association handling, dedup by email. Best-in-class. | CSV import with field mapping. Basic dedup. Gets the job done. | Data Import Wizard with complex matching rules. Data Loader for bulk. Enterprise-grade. | Multi-step wizard with auto-map by header name + manual correction. EAV-aware. Dedup by configurable match fields (email, name+company). Progressive -- not as complex as Salesforce, more capable than Pipedrive. |
| Outbound webhooks | Workflow-triggered webhooks. Robust retry/logging. Part of automation suite. | Webhooks on deal/person/activity events. Simple and effective. Developer-friendly. | Platform Events + Outbound Messages + Change Data Capture. Complex but comprehensive. | Event-based webhooks on signal events. HMAC signing, retry, logging. Developer-friendly like Pipedrive without Salesforce complexity. |
| @Mentions | @mention in notes/emails. Creates tasks/notifications. Well-integrated. | No native @mentions. Communication happens in email. | Chatter feed with @mentions. Full social-media-style feed. Can be noisy. | @mentions in TipTap notes with autocomplete. Creates notifications. Lightweight -- not building Chatter-style social feed. |
| Toast/feedback UX | Polished throughout. Sonner-equivalent quality. | Good but inconsistent in some areas. | Variable quality. Some areas still use browser dialogs. | Sonner throughout. Consistent toast patterns on every mutation. |
| Saved views | Multiple saved views per object. Shared views for teams. Mature. | Filters saved as views. Team sharing on higher plans. | List views with sharing. Very mature, highly customizable. | Named filter configurations with private/team visibility. Dropdown on object pages. |

---

## Implementation Patterns (How These Features Work in Production CRMs)

### Workflow Automation Builder Pattern
Modern CRM automation follows a **trigger-condition-action** (TCA) model:
1. **Trigger**: An event occurs (record created, stage changed, field updated, email received, time-based)
2. **Conditions**: Zero or more conditions narrow when the trigger fires (e.g., "only when stage = Proposal", "only when deal value > $10k")
3. **Action**: One or more actions execute (send email, create task, update field, enqueue AI generation, fire webhook)

The visual UI is a structured form, NOT a flowchart. HubSpot and monday.com use this pattern. Salesforce Flow is the outlier with a full graph editor -- and is widely regarded as too complex for most users.

OpenClaw advantage: The existing `automation_rules` schema already implements TCA. The `automation-engine.ts` already evaluates rules. The UI is the only missing piece.

### Activity/Lead Scoring Pattern
Modern scoring uses a **composite model with decay**:
- **Fit score** (static): How well does this lead match the ideal customer profile? Based on firmographic/demographic attributes.
- **Engagement score** (dynamic): How actively is this lead interacting? Based on email opens, replies, meetings, site visits.
- **Recency factor** (time-decay): Industry best practice is 25% monthly reduction without new engagement activity. A lead who was active 6 months ago is not "hot" today.
- **Composite score** = (Fit * 0.4) + (Engagement * 0.4) + (Recency_modifier * 0.2)

Scores are recomputed periodically via background jobs (not real-time). Display as a 0-100 score with color coding (green/yellow/red) and trend arrow (up/down/flat over 7 days).

### Email Compose + Thread View Pattern
CRM email typically follows this architecture:
- **Sync layer**: Delta sync from Gmail/Outlook stores messages in local `email_messages` table (snippets only, full body fetched on demand)
- **Thread view**: Messages grouped by `threadId`, displayed chronologically with direction indicators (sent/received arrows)
- **Compose**: Side panel or modal with rich text editor, auto-populated recipient, template insertion, CC/BCC. Sends via provider API using stored OAuth tokens.
- **Tracking**: Open pixel (1x1 transparent image) in sent emails. Link wrapping for click detection. Both write back to `email_messages` record.

### Import/Export with Field Mapping Pattern
Standard multi-step wizard flow used by HubSpot, Dynamics 365, Zoho:
1. **Upload**: Drag-drop zone accepting CSV/XLSX. Parse on client or upload then parse on server.
2. **Auto-map**: Fuzzy match CSV column headers to CRM field names (Levenshtein distance or simple lowercase/trim comparison). Present auto-mapped fields with green checkmarks, unmapped with yellow warnings.
3. **Manual mapping**: Dropdown selectors for each unmapped column. Option to skip columns.
4. **Dedup config**: Choose match strategy: email (most common), name+company, external ID. Choose action for matches: skip, update, or create anyway.
5. **Preview**: Show 3-5 sample rows with mapped values and type coercion preview.
6. **Execute**: Batch insert with progress bar. Transaction per batch (100 rows). Summary: created/updated/skipped/failed counts.

### Outbound Webhook Pattern
Standard event-driven webhook delivery:
- **Registration**: REST API or settings UI to create subscriptions (URL + event types + optional HMAC secret)
- **Dispatch**: On CRM event, serialize payload with standard envelope `{ id, event, timestamp, workspace_id, data }`, enqueue delivery job
- **Delivery**: HTTP POST with `Content-Type: application/json`, `X-Webhook-Signature` header (HMAC-SHA256 of body using subscriber secret), `X-Webhook-ID` header (idempotency key)
- **Retry**: 3 attempts with exponential backoff (1min, 5min, 30min). Mark subscription as "failing" after 3 consecutive failures. Auto-disable after 10 consecutive failures with notification to admin.
- **Logging**: Store each delivery attempt with timestamp, HTTP status, response time, payload size

### Toast Notification Pattern
Production toast systems (Sonner pattern):
- **Placement**: Bottom-right or top-right. Max 3-5 visible simultaneously.
- **Types**: success (green), error (red), info (blue), warning (yellow), loading (spinner)
- **Durations**: Info 3s, success 3s, warning 5s, error 8s. Errors should be dismissible but not auto-dismissed for critical failures.
- **Promise pattern**: `toast.promise(saveFn(), { loading: "Saving...", success: "Saved!", error: "Failed to save" })` -- eliminates flicker between loading and result states.
- **Action toasts**: Include an "Undo" or "View" action button in the toast for destructive or navigation-worthy operations.

---

## Sources

- [Sonner -- React toast notifications setup and customization](https://simplife.pl/2025/07/27/sonner-react-toast-notifications-setup-examples-customization/) -- implementation patterns
- [shadcn/ui Sonner component](https://www.shadcn.io/ui/sonner) -- component integration
- [Comparing React toast libraries 2025](https://blog.logrocket.com/react-toast-libraries-compared-2025/) -- library comparison confirming Sonner recommendation
- [Cursor-based pagination deep dive](https://www.milanjovanovic.tech/blog/understanding-cursor-pagination-and-why-its-so-fast-deep-dive) -- performance analysis showing consistent query time regardless of page depth
- [Next.js infinite scroll with TanStack Query](https://www.makeuseof.com/next-js-infinite-scrolling-pagination-tanstack-query/) -- client implementation pattern
- [CRM lead scoring evolution 2025](https://coefficient.io/lead-scoring/crm-lead-scoring) -- hybrid scoring model patterns
- [Lead scoring rules and decay](https://monday.com/blog/crm-and-sales/lead-scoring-rules/) -- 25% monthly decay best practice
- [HubSpot lead scoring tool](https://knowledge.hubspot.com/scoring/understand-the-lead-scoring-tool) -- reference implementation
- [Predictive lead scoring with AI](https://brixongroup.com/en/predictive-lead-scoring-with-ai-setup-roi-and-avoiding-costly-pitfalls) -- structured implementation path
- [Salesforce Flow 2026 guide](https://www.default.com/post/salesforce-flow-building-visual-workflows-in-salesforce) -- workflow builder patterns (what to learn from and what to avoid)
- [Webhook implementation for event-driven integrations](https://www.leadwithskills.com/blogs/webhook-implementation-event-driven-integrations) -- delivery, retry, idempotency patterns
- [Webhook vs API for CRM integration](https://www.codelessplatforms.com/webhook-vs-api-for-crm-integration/) -- when to use each
- [CRM collaborative features 2025](https://crm.org/crmland/collaborative-crm) -- @mentions and activity feed patterns
- [Pipedrive email thread management](https://www.pipedrive.com/en/blog/email-thread) -- email thread UX in CRM
- [Dynamics 365 import with duplicate detection](https://learn.microsoft.com/en-us/dynamics365/customer-insights/journeys/import-data) -- field mapping and dedup strategy
- [Zoho CRM CSV import guide](https://getcapt.com/blog/zoho-crm-csv-import) -- auto-mapping implementation reference

---
*Feature research for: OpenClaw CRM v2.0*
*Researched: 2026-03-11*
