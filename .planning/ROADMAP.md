# Roadmap: OpenClaw CRM

## Milestones

- **v1.0 Foundation** - Phases 1-5 (features shipped ad-hoc, phases unexecuted)
- **v2.0 Complete & Polish** - Phases 6-11 (planned)

## Overview

OpenClaw is evolving from a reactive CRM to a proactive one — the AI watches deal activity, ingests external signals, and does the work. This roadmap builds that capability in five coarse phases: first the async infrastructure that makes proactive behavior possible, then the integrations that feed signal data in, then the AI engines that act on those signals, then the full close-flow that completes the sales pipeline, and finally the analytics layer that becomes meaningful once data has accumulated. Each phase delivers observable capability that reps and managers can use before the next phase begins.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

### v1.0 Foundation (Phases 1-5)

- [ ] **Phase 1: Async Infrastructure** - Background job queue, signal event bus, OAuth token storage, generated assets table, and approval inbox — the foundation every proactive feature depends on
- [ ] **Phase 2: Signal Integrations** - Email (Gmail + O365), calendar (Google + Outlook), LinkedIn enrichment, telephony (Zoom + AssemblyAI), and the unified activity timeline that reads all signals
- [ ] **Phase 3: AI Asset Generation + Outbound** - Proactive AI document generation triggered by deal events, email sequences for outbound, and lead scoring — the product's core promise
- [ ] **Phase 4: Close Flow + Dashboards** - Role-based dashboards, approval workflow engine, contract/SOW generation, and customer handoff — full pipeline coverage through close
- [ ] **Phase 5: Analytics + Intelligence** - Win/loss pattern analysis, rep performance coaching, pipeline forecasting, and next-best-action suggestions — data-dependent, meaningful after 90+ days of history

### v2.0 Complete & Polish (Phases 6-11)

- [ ] **Phase 6: Infrastructure + UX Polish** - Fix job execution, wire signal-to-automation pipeline, add toasts, error boundaries, confirmation dialogs, form validation, and cursor-based pagination
- [ ] **Phase 7: Integration Sync + Email Compose** - Gmail/Outlook delta sync, calendar meeting detection, email-to-record matching, email compose from records, and thread view
- [ ] **Phase 8: AI Asset Generation + Activity Scoring** - Signal-triggered AI generation of briefs/proposals/battlecards with budget controls, plus composite activity scoring and hot leads dashboard
- [ ] **Phase 9: Workflow Automation + Team Collaboration** - Form-based automation builder, @mentions in notes, threaded comments on records, and saved filter views
- [ ] **Phase 10: Import/Export + Outbound Webhooks** - Multi-step CSV import with field mapping and dedup, filtered CSV export, webhook subscriptions with HMAC signing and circuit breaker
- [ ] **Phase 11: Analytics** - Real win/loss pattern analysis, rep coaching vs benchmarks, weighted pipeline forecast, and per-deal next-best-action suggestions

## Phase Details

### Phase 1: Async Infrastructure

**Goal**: The system can process work asynchronously, emit and consume signal events, store OAuth tokens securely, and hold AI-generated drafts in a reviewable approval inbox — without any of this happening inside synchronous request handlers

**Depends on**: Nothing (first phase)

**Requirements**: INFR-01, INFR-02, INFR-03, INFR-04, INFR-05, INFR-06, INFR-07

**Success Criteria** (what must be TRUE):

1. A background job submitted to the queue is retried automatically on failure and lands in a dead-letter table after exhausting retries — verifiable by triggering a failing job
2. When a deal stage changes in the CRM, a signal event row appears in the signal_events table within the same database transaction — no stage change goes unrecorded
3. When a workspace automation rule matches a signal event, an appropriate background job is dispatched — verifiable by creating a rule and advancing a deal stage
4. Rep can open an approval inbox, see AI-generated draft items, and approve, edit, or reject each one before any customer-facing action occurs
5. An OAuth token stored in integration_tokens is proactively refreshed before expiry and a duplicate external signal is silently deduplicated rather than processed twice

**Plans**: 4 plans

- [ ] 01-01-PLAN.md — pg-boss job queue: background_jobs schema, enqueue/processJobs helpers, cron worker at /api/v1/cron/jobs, retry with exponential backoff, dead-letter via status=failed
- [ ] 01-02-PLAN.md — Signal event bus: signal_events table, processed_signals deduplication table, writeSignalEvent()/deduplicateSignal() helpers, stage-change and record-creation hooks in API routes
- [ ] 01-03-PLAN.md — Automation engine: automation_rules table, evaluateSignalById() rule evaluator, job dispatch on signal match, CRUD API at /api/v1/automations
- [ ] 01-04-PLAN.md — Generated assets + approval inbox: generated_assets schema, integration_tokens schema, draft lifecycle service, approve/reject API, /inbox dashboard page

### Phase 2: Signal Integrations

**Goal**: Reps can connect their email, calendar, and LinkedIn to the CRM, and every relevant external event (emails sent/received, meetings logged, contacts enriched, calls recorded) flows automatically into the system without manual data entry

**Depends on**: Phase 1

**Requirements**: EMAL-01, EMAL-02, EMAL-03, EMAL-04, EMAL-05, EMAL-06, CALR-01, CALR-02, CALR-03, CALR-04, CALR-05, LNKD-01, LNKD-02, LNKD-03, LNKD-04, TELE-01, TELE-02, TELE-03, TELE-04, TELE-05, TELE-06, TMLN-01, TMLN-02, TMLN-03

**Success Criteria** (what must be TRUE):

1. Rep can connect their Gmail or O365 account via OAuth and emails to/from deal contacts automatically appear on the deal record, including open and link-click events on outbound emails
2. Rep can send an email to a contact directly from within the CRM using their connected account
3. When a calendar meeting with a deal contact ends, a meeting event is automatically logged to the deal's activity timeline without the rep doing anything
4. A newly created contact is automatically enriched with LinkedIn profile data (title, company, location) when an email address is provided
5. When a Zoom call recording is available, the system fetches the recording, transcribes it with speaker diarization, applies PII redaction, and logs the call to the deal timeline
6. Rep can view a unified chronological timeline on any record showing all touchpoints — emails, calls, meetings, notes, tasks, and stage changes — in one place

**Plans**: TBD

- [ ] 02-01: integration_tokens table + OAuth token storage/refresh — encrypted storage, proactive refresh, invalid_grant detection
- [ ] 02-02: Gmail integration — OAuth flow, push notifications, delta sync, email-to-record matching, email_messages table
- [ ] 02-03: O365/Outlook integration — OAuth flow, Graph API sync, push notifications, delta sync
- [ ] 02-04: Email open/click tracking — outbound tracking via Resend webhooks, tracking pixel, link wrapping
- [ ] 02-05: Google Calendar integration — OAuth (shared Gmail credential), delta sync, meeting-to-deal matching, auto-log
- [ ] 02-06: Outlook Calendar integration — OAuth (shared O365 credential), delta sync, meeting-to-deal matching
- [ ] 02-07: LinkedIn enrichment via Proxycurl — contact enrichment, company enrichment, auto-enrich on create, manual trigger
- [ ] 02-08: Zoom + AssemblyAI telephony — webhook receive, recording fetch, transcription, PII redaction, call timeline auto-log, consent toggle
- [ ] 02-09: Activity timeline — unified UNION ALL query service, timeline UI component on record pages, AI-readable summary

### Phase 3: AI Asset Generation + Outbound

**Goal**: The CRM proactively generates deal assets (proposals, briefs, follow-ups, battlecards) when deal events trigger them, enables reps to run AI-personalized outbound email sequences, and scores and qualifies inbound leads — without the rep asking

**Depends on**: Phase 2

**Requirements**: AGEN-01, AGEN-02, AGEN-03, AGEN-04, AGEN-05, AGEN-06, AGEN-07, AGEN-08, SEQN-01, SEQN-02, SEQN-03, SEQN-04, SEQN-05, LEAD-01, LEAD-02, LEAD-03, LEAD-04

**Success Criteria** (what must be TRUE):

1. When a new deal is created with sufficient context, an opportunity brief draft appears in the rep's approval inbox within minutes — without the rep requesting it
2. When a deal advances to the proposal stage, a proposal draft appears in the approval inbox; when it advances to the presentation stage, a deck draft appears — both require explicit rep approval before any customer sees them
3. Thirty minutes before a deal-linked calendar event, a meeting prep brief (with talking points, recent touchpoints, and objection handling) appears in the rep's approval inbox
4. Rep can create a multi-step email sequence, enroll contacts into it, and the sequence stops automatically when a recipient replies
5. Each lead has a numeric score with a plain-language AI explanation (e.g., "Title matches ICP, 3 pricing page visits") and reps can capture inbound leads via embeddable web forms

**Plans**: TBD

- [ ] 03-01: Generated assets pipeline setup — Vercel AI SDK generateObject(), tiered context strategy (rule-based / light / full), asset type registry
- [ ] 03-02: Opportunity brief + proposal + deck generators — context assemblers, LLM callers, draft-to-approval-inbox flow
- [ ] 03-03: Meeting prep brief + post-meeting follow-up generators — calendar trigger (T-30min job), meeting-end trigger, context from timeline
- [ ] 03-04: Competitive battlecard generator — competitor mention detection in emails/notes/transcripts, battlecard service, workspace library
- [ ] 03-05: Email sequences — sequence CRUD, step scheduler (job-based), contact enrollment, reply detection, A/B variant tracking, metrics
- [ ] 03-06: Lead scoring + inbound capture — scoring engine (weighted formula over engagement events), AI explanation, web form embed, email parsing

### Phase 4: Close Flow + Dashboards

**Goal**: Reps and managers have role-appropriate dashboard views of their pipeline, high-stakes actions route through configurable approval workflows, contracts and SOWs are generated from deal data, and closed-won deals trigger an automated customer handoff brief

**Depends on**: Phase 3

**Requirements**: DASH-01, DASH-02, DASH-03, APRV-01, APRV-02, APRV-03, APRV-04, CNTR-01, CNTR-02, CNTR-03, CNTR-04, CLOS-01, CLOS-02

**Success Criteria** (what must be TRUE):

1. Rep can open a personal pipeline dashboard showing their deals, open tasks, and the AI draft queue in one view; manager can see aggregate team pipeline and per-rep metrics; leadership can see stage distribution and weighted pipeline value
2. Workspace admin can configure an approval rule (e.g., discount > 20% routes to manager) and the system routes matching deals to the designated approver with notification, tracks approval history, and blocks customer-facing action until approved
3. A contract or SOW is generated from deal data as a PDF, routes through the approval workflow, and is only deliverable to the customer after explicit approver sign-off
4. When a deal is marked closed-won, a customer handoff brief is generated automatically and can be exported or sent to an external CS tool via webhook

**Plans**: TBD

- [ ] 04-01: Role-based dashboards — rep pipeline view, manager team view, leadership forecast view, per-user view preferences
- [ ] 04-02: Approval workflow engine — approval_requests table, configurable rules per workspace, escalation via pg-boss scheduled jobs, approver notifications
- [ ] 04-03: Contract/SOW generation — contract generator service, @react-pdf/renderer PDF output, S3 storage, template library with clause customization
- [ ] 04-04: Close flow — closed-won trigger, handoff brief generator, export and webhook delivery to external CS tools

### Phase 5: Analytics + Intelligence

**Goal**: The CRM surfaces data-driven patterns from accumulated deal history — win/loss signals, rep performance gaps versus top performers, pipeline forecasts with AI confidence scores, and next-best-action suggestions on each deal

**Depends on**: Phase 4

**Requirements**: INTL-01, INTL-02, INTL-03, INTL-04

**Success Criteria** (what must be TRUE):

1. After sufficient deal history accumulates (target: 30+ closed deals), the system surfaces specific win/loss patterns with AI narrative (e.g., "Deals with 3+ stakeholders and a POC close 2x more often")
2. Manager can view per-rep coaching recommendations that compare specific named activity patterns to top performers in the same territory/product cohort — not generic advice
3. Leadership can view a pipeline forecast with AI confidence scores weighted by engagement signals and historical close rates
4. Each active deal shows a "next best action" suggestion based on stage, recent activity, and win pattern data

**Plans**: TBD

- [ ] 05-01: Win/loss pattern analysis — read-only query layer over closed deals, AI narrative summary, minimum data volume gate
- [ ] 05-02: Rep performance coaching — cohort analysis (same territory/product), named deviation detection, coaching recommendation cards
- [ ] 05-03: Pipeline forecasting + next-best-action — engagement-signal-weighted probability, AI confidence scores, deal-level NBA suggestions

---

## v2.0 Complete & Polish (Phases 6-11)

**Milestone Goal:** Wire up the stub infrastructure (job processor, AI generation, integration sync, analytics), polish the UX to production-grade quality (toasts, pagination, validation, dialogs), and add differentiation features (email compose, workflow automation, activity scoring, team collaboration, import/export, webhooks).

### Phase 6: Infrastructure + UX Polish

**Goal**: The background job system actually executes handlers, signals flow through to automation evaluation, and the UX reaches production quality with toast feedback, error recovery, proper dialogs, inline validation, and paginated record tables

**Depends on**: Phase 5 (continues from v1.0)

**Requirements**: INFR-01, INFR-02, INFR-03, INFR-04, UXPL-01, UXPL-02, UXPL-03, UXPL-04, UXPL-05, UXPL-06

**Success Criteria** (what must be TRUE):

1. A background job enqueued via `enqueueJob()` is picked up by the cron worker, the registered handler executes, and on failure the job retries with exponential backoff up to 3 times before landing in dead-letter state -- verifiable by enqueuing a test job and checking the background_jobs table
2. When a deal stage changes, a signal event is written and a `signal_evaluate` job is auto-enqueued, which evaluates matching automation rules and dispatches the appropriate action job -- verifiable end-to-end by creating a rule and advancing a deal
3. Every user-initiated mutation (create, update, delete) shows a toast notification confirming success or explaining failure, and no `window.alert()` or `window.confirm()` calls remain in the codebase
4. All create/edit forms show inline field-level validation errors before submission, and all destructive actions require confirmation via a styled dialog
5. Record tables load the first page via cursor-based pagination and support scrolling through large datasets without DOM performance degradation via virtual scrolling

**Plans**: TBD

### Phase 7: Integration Sync + Email Compose

**Goal**: Connected Gmail and Outlook accounts sync emails incrementally into the CRM, calendar events are detected and logged, and users can compose and view email threads directly on record detail pages

**Depends on**: Phase 6

**Requirements**: SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05, ECOM-01, ECOM-02, ECOM-03, ECOM-04, ECOM-05

**Success Criteria** (what must be TRUE):

1. A user with connected Gmail sees new emails incrementally synced into the CRM within minutes, matched to the correct contact/deal record by email address, and visible on the record's email tab -- including recovery from stale historyId via bounded 7-day partial sync
2. A user with connected Outlook sees the same incremental sync behavior, with delta tokens proactively refreshed every 3-4 days and webhook subscriptions renewed before 3-day expiry
3. When a calendar meeting linked to a deal contact ends, a `meeting_ended` signal is emitted and the meeting is logged to the deal's activity timeline automatically
4. User can compose and send an email from a record detail page using their connected Gmail/Outlook OAuth token (never SMTP relay), with TipTap editor, CC/BCC fields, and auto-populated To address from the record's email attribute
5. User can view email thread history on a record detail page grouped by thread_id, with message bodies lazy-loaded from the provider API on expand

**Plans**: TBD

### Phase 8: AI Asset Generation + Activity Scoring

**Goal**: The CRM proactively generates deal assets (opportunity briefs, proposals, meeting prep, follow-ups, battlecards) when deal events trigger them, with budget and deduplication controls, and every contact/company has a composite activity score driving a hot leads dashboard

**Depends on**: Phase 7

**Requirements**: AIGN-01, AIGN-02, AIGN-03, AIGN-04, AIGN-05, AIGN-06, AIGN-07, SCOR-01, SCOR-02, SCOR-03, SCOR-04

**Success Criteria** (what must be TRUE):

1. When a deal is created with sufficient context, an opportunity brief draft appears in the approval inbox; when a deal advances to proposal stage, a proposal draft is auto-generated; when a deal-linked meeting approaches, a meeting prep brief appears 30 minutes before -- all without the rep requesting it
2. After a deal-linked meeting ends, a follow-up email draft is auto-generated; when competitor mentions are detected in emails or notes, a battlecard is auto-generated or updated
3. Per-workspace daily budget tracking prevents AI generation cost blowout, and a 15-minute deduplication window prevents duplicate generation for the same record and asset type
4. Each contact and company has a composite activity score (fit 40% + engagement 40% + recency 20%) that recalculates via background job when relevant signals arrive, with 25% monthly decay
5. A hot leads dashboard widget shows the top 20 records by score with 7-day trend indicators, and reps can sort/filter record tables by activity score

**Plans**: TBD

### Phase 9: Workflow Automation + Team Collaboration

**Goal**: Users can create automation rules through a form-based UI, @mention teammates in notes to trigger notifications, leave threaded comments on records, and save/share filter configurations as reusable views

**Depends on**: Phase 6

**Requirements**: WKFL-01, WKFL-02, WKFL-03, WKFL-04, WKFL-05, COLB-01, COLB-02, COLB-03, COLB-04, COLB-05

**Success Criteria** (what must be TRUE):

1. User can create an automation rule by selecting a trigger type (stage_changed, record_created, email_received, meeting_ended, note_added), defining field/operator/value conditions, and choosing an action (enqueue AI generate, send email, create task, create note) -- all via a form-based UI
2. The automation rules list shows enable/disable toggles and last-triggered timestamps, and disabled rules do not fire when matching signals arrive
3. User can @mention workspace members in TipTap notes with autocomplete, and mentioned users receive a notification linking to the record
4. User can add threaded comments on records (distinct from rich-text notes), and comments support @mentions with the same notification behavior
5. User can save the current filter/sort/column configuration as a named view (private by default, optionally shared), and apply saved views from a dropdown on record table pages

**Plans**: TBD

### Phase 10: Import/Export + Outbound Webhooks

**Goal**: Users can import CSV data with field mapping and duplicate detection, export filtered record views to CSV, and external systems can subscribe to CRM events via outbound webhooks with reliable delivery

**Depends on**: Phase 6

**Requirements**: IMEX-01, IMEX-02, IMEX-03, IMEX-04, IMEX-05, HOOK-01, HOOK-02, HOOK-03, HOOK-04, HOOK-05

**Success Criteria** (what must be TRUE):

1. User can import a CSV file through a multi-step wizard: upload, auto-mapped field suggestions (fuzzy name match), manual correction, preview rows, and execute -- with large imports running as background jobs with progress tracking
2. Import supports configurable duplicate detection strategy (skip existing, update existing, or create all) using pre-loaded lookup tables for performance
3. User can export the current filtered record view to CSV with EAV-to-columnar flattening, producing a file where each attribute is a column
4. User can create webhook subscriptions with a target URL, selected event types (record.created, record.updated, deal.stage_changed, deal.closed, email.received), and optional HMAC secret -- with deliveries running async via job queue with 3x exponential backoff retry
5. Each webhook delivery attempt is logged with HTTP status for debugging, and a circuit breaker disables the webhook after 5 consecutive failures with admin notification

**Plans**: TBD

### Phase 11: Analytics

**Goal**: The analytics dashboards surface real patterns from accumulated deal data -- win/loss analysis with AI narrative, per-rep coaching against benchmarks, weighted pipeline forecast, and next-best-action suggestions on active deals

**Depends on**: Phase 8

**Requirements**: ANLT-01, ANLT-02, ANLT-03, ANLT-04

**Success Criteria** (what must be TRUE):

1. After 30+ closed deals, the win/loss analysis page surfaces specific patterns from deal data with AI-generated narrative explaining what distinguishes won deals from lost ones
2. The rep coaching page compares individual rep activity metrics (emails sent, meetings held, response times) to team averages and top performer benchmarks, with specific improvement recommendations
3. The pipeline forecast page shows weighted deal value by stage using historical close rates, with AI confidence scores reflecting engagement signal strength
4. Each active deal shows a next-best-action suggestion based on its current stage, recent activity patterns, and historical win/loss data

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11

Note: Within v2.0, Phases 9 and 10 depend only on Phase 6 (not on 7 or 8) and can run in parallel with Phases 7-8. Phase 11 depends on Phase 8.

| Phase | Milestone | Plans Complete | Status | Completed |
| ----- | --------- | -------------- | ------ | --------- |
| 1. Async Infrastructure | v1.0 | 0/4 | Planning complete | - |
| 2. Signal Integrations | v1.0 | 0/9 | Not started | - |
| 3. AI Asset Generation + Outbound | v1.0 | 0/6 | Not started | - |
| 4. Close Flow + Dashboards | v1.0 | 0/4 | Not started | - |
| 5. Analytics + Intelligence | v1.0 | 0/3 | Not started | - |
| 6. Infrastructure + UX Polish | v2.0 | 0/TBD | Not started | - |
| 7. Integration Sync + Email Compose | v2.0 | 0/TBD | Not started | - |
| 8. AI Asset Generation + Activity Scoring | v2.0 | 0/TBD | Not started | - |
| 9. Workflow Automation + Team Collaboration | v2.0 | 0/TBD | Not started | - |
| 10. Import/Export + Outbound Webhooks | v2.0 | 0/TBD | Not started | - |
| 11. Analytics | v2.0 | 0/TBD | Not started | - |
