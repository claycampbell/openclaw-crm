# Roadmap: OpenClaw CRM

## Overview

OpenClaw is evolving from a reactive CRM to a proactive one — the AI watches deal activity, ingests external signals, and does the work. This roadmap builds that capability in five coarse phases: first the async infrastructure that makes proactive behavior possible, then the integrations that feed signal data in, then the AI engines that act on those signals, then the full close-flow that completes the sales pipeline, and finally the analytics layer that becomes meaningful once data has accumulated. Each phase delivers observable capability that reps and managers can use before the next phase begins.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Async Infrastructure** - Background job queue, signal event bus, OAuth token storage, generated assets table, and approval inbox — the foundation every proactive feature depends on
- [ ] **Phase 2: Signal Integrations** - Email (Gmail + O365), calendar (Google + Outlook), LinkedIn enrichment, telephony (Zoom + AssemblyAI), and the unified activity timeline that reads all signals
- [ ] **Phase 3: AI Asset Generation + Outbound** - Proactive AI document generation triggered by deal events, email sequences for outbound, and lead scoring — the product's core promise
- [ ] **Phase 4: Close Flow + Dashboards** - Role-based dashboards, approval workflow engine, contract/SOW generation, and customer handoff — full pipeline coverage through close
- [ ] **Phase 5: Analytics + Intelligence** - Win/loss pattern analysis, rep performance coaching, pipeline forecasting, and next-best-action suggestions — data-dependent, meaningful after 90+ days of history

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
**Plans**: TBD

Plans:
- [ ] 01-01: pg-boss job queue setup — schema, enqueue/dequeue helpers, cron worker endpoint, retry/backoff/dead-letter
- [ ] 01-02: Signal event bus — signal_events table, write helpers, stage-change hooks in records.ts, processed_signals deduplication
- [ ] 01-03: Automation engine — workspace automation rules table, rule evaluator service, job dispatch on signal match
- [ ] 01-04: Generated assets table + approval inbox — generated_assets schema, draft lifecycle, review UI in dashboard

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

Plans:
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

Plans:
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

Plans:
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

Plans:
- [ ] 05-01: Win/loss pattern analysis — read-only query layer over closed deals, AI narrative summary, minimum data volume gate
- [ ] 05-02: Rep performance coaching — cohort analysis (same territory/product), named deviation detection, coaching recommendation cards
- [ ] 05-03: Pipeline forecasting + next-best-action — engagement-signal-weighted probability, AI confidence scores, deal-level NBA suggestions

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Async Infrastructure | 0/4 | Not started | - |
| 2. Signal Integrations | 0/9 | Not started | - |
| 3. AI Asset Generation + Outbound | 0/6 | Not started | - |
| 4. Close Flow + Dashboards | 0/4 | Not started | - |
| 5. Analytics + Intelligence | 0/3 | Not started | - |
