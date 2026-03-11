# Requirements: OpenClaw CRM v2.0

**Defined:** 2026-03-11
**Core Value:** The CRM does the work. Reps sell, AI handles everything else.

## v2.0 Requirements

Requirements for v2.0 milestone. Each maps to roadmap phases.

### Infrastructure

- [ ] **INFR-01**: Job execution loop calls registered handlers with FOR UPDATE SKIP LOCKED to prevent double-execution
- [ ] **INFR-02**: Signal events auto-enqueue evaluation jobs so automation rules are checked on every CRM state change
- [ ] **INFR-03**: enqueueJob signature is consistent across lib/job-queue.ts and services/job-queue.ts
- [ ] **INFR-04**: Failed jobs retry with exponential backoff (3 attempts) and land in dead-letter state after exhaustion

### AI Asset Generation

- [ ] **AIGN-01**: When a deal is created with sufficient context, an opportunity brief draft appears in the approval inbox
- [ ] **AIGN-02**: When a deal advances to proposal stage, a proposal draft is auto-generated
- [ ] **AIGN-03**: 30 minutes before a deal-linked meeting, a meeting prep brief with talking points appears in the inbox
- [ ] **AIGN-04**: After a deal-linked meeting ends, a follow-up email draft is auto-generated
- [ ] **AIGN-05**: When competitor mentions are detected in emails/notes, a battlecard is auto-generated or updated
- [ ] **AIGN-06**: Per-workspace daily budget tracking prevents AI generation cost blowout
- [ ] **AIGN-07**: 15-minute deduplication window prevents duplicate generation for the same record and asset type

### Integration Sync

- [ ] **SYNC-01**: Gmail delta sync processes new emails incrementally using historyId with bounded partial-sync recovery
- [ ] **SYNC-02**: Outlook delta sync processes new emails using deltaToken with proactive token refresh every 3-4 days
- [ ] **SYNC-03**: Calendar sync detects meeting_ended events and logs them to deal activity timeline
- [ ] **SYNC-04**: Synced emails are auto-matched to records by email address and logged to activity timeline
- [ ] **SYNC-05**: Outlook webhook subscriptions are proactively renewed before 3-day expiry

### Analytics

- [ ] **ANLT-01**: Win/loss analysis surfaces specific patterns from closed deals with AI narrative after 30+ closed deals
- [ ] **ANLT-02**: Rep coaching compares per-rep activity metrics to team averages and top performer benchmarks
- [ ] **ANLT-03**: Pipeline forecast shows weighted value by stage using historical close rates
- [ ] **ANLT-04**: Each active deal shows a next-best-action suggestion based on stage and recent activity

### UX Polish

- [ ] **UXPL-01**: Toast notifications show success/error/loading feedback on every mutation via Sonner
- [ ] **UXPL-02**: Error boundaries catch and display client component failures gracefully
- [ ] **UXPL-03**: All destructive actions use shadcn AlertDialog instead of browser confirm()
- [ ] **UXPL-04**: Create/edit forms show inline validation errors via react-hook-form + Zod
- [ ] **UXPL-05**: Record tables use cursor-based pagination instead of hardcoded limit=200
- [ ] **UXPL-06**: Virtual scrolling supports large record sets without DOM performance issues

### Email Compose

- [ ] **ECOM-01**: User can compose and send email from record detail page via connected Gmail/Outlook OAuth
- [ ] **ECOM-02**: Email compose uses TipTap editor with template picker, CC/BCC, and auto-populated To field
- [ ] **ECOM-03**: Sent emails are stored in email_messages with open pixel and click tracking
- [ ] **ECOM-04**: User can view email thread history on record detail page grouped by thread_id
- [ ] **ECOM-05**: Email thread bodies lazy-load from provider API on expand to avoid storing large HTML

### Activity Scoring

- [ ] **SCOR-01**: Each contact/company has a composite activity score (fit 40% + engagement 40% + recency 20%)
- [ ] **SCOR-02**: Scores recalculate as a background job when relevant signals arrive (email opens, meetings, stage changes)
- [ ] **SCOR-03**: Hot leads dashboard widget shows top 20 records by score with 7-day trend indicators
- [ ] **SCOR-04**: Score includes 25% monthly decay without new engagement activity

### Workflow Automation

- [ ] **WKFL-01**: User can create automation rules via form-based trigger-condition-action UI
- [ ] **WKFL-02**: Triggers map to signal types (stage_changed, record_created, email_received, meeting_ended, note_added)
- [ ] **WKFL-03**: Conditions support field/operator/value rows with AND logic matching existing automation_rules schema
- [ ] **WKFL-04**: Actions include: enqueue AI generate, send email, create task, create note
- [ ] **WKFL-05**: Rules list shows enable/disable toggles and last-triggered timestamp

### Team Collaboration

- [ ] **COLB-01**: User can @mention workspace members in notes with autocomplete via TipTap mention extension
- [ ] **COLB-02**: @mentions create notifications for mentioned users
- [ ] **COLB-03**: User can add threaded comments on records (lighter than notes, separate from rich text notes)
- [ ] **COLB-04**: User can save filter configurations as private or team-shared views on object pages
- [ ] **COLB-05**: Saved views appear as a dropdown/sidebar for quick-apply on record tables

### Import/Export

- [ ] **IMEX-01**: User can import CSV with multi-step wizard (upload, auto-map fields, manual correct, preview, execute)
- [ ] **IMEX-02**: Import auto-maps CSV headers to attributes by fuzzy name match
- [ ] **IMEX-03**: Import supports duplicate detection with configurable strategy (skip, update, create all)
- [ ] **IMEX-04**: Large imports run as background jobs with progress tracking
- [ ] **IMEX-05**: User can export filtered record views to CSV with EAV-to-columnar flattening

### Outbound Webhooks

- [ ] **HOOK-01**: User can create webhook subscriptions with URL, event types, and optional HMAC secret
- [ ] **HOOK-02**: CRM events (record.created, record.updated, deal.stage_changed, deal.closed, email.received) trigger webhook delivery
- [ ] **HOOK-03**: Webhook delivery runs async via job queue with 3x retry and exponential backoff
- [ ] **HOOK-04**: Each delivery attempt is logged with HTTP status for debugging
- [ ] **HOOK-05**: Circuit breaker disables webhook after 5 consecutive failures

## v3.0 Requirements (Deferred)

- **WKFL-V3-01**: Node-graph visual workflow editor (n8n/Zapier style)
- **DEDUP-01**: Automatic duplicate detection on every record save
- **EDIT-01**: Inline spreadsheet-style table editing
- **RTME-01**: Real-time WebSocket notifications
- **MKTG-01**: Email marketing campaigns and A/B testing
- **LEAD-01**: Lead scoring from AI-inferred ICP (vs manual config)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Node-graph workflow editor | Form-based builder covers 90% of CRM automations; 10x effort for marginal gain |
| Duplicate detection on every save | Expensive with EAV; import-only dedup first |
| Inline spreadsheet editing | High bug surface with 17 attribute types; record detail editing sufficient |
| Real-time WebSocket push | Polling adequate for CRM; adds infrastructure complexity |
| Email marketing campaigns | Different product/data model; sales sequences cover 1:1 outreach |
| Real-time collaborative editing | CRDT/OT complexity; CRM notes are single-author 99% of the time |
| Mobile native apps | Web-first, responsive design sufficient |
| Custom report builder | Role-based dashboards cover reporting needs |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFR-01 | TBD | Pending |
| INFR-02 | TBD | Pending |
| INFR-03 | TBD | Pending |
| INFR-04 | TBD | Pending |
| AIGN-01 | TBD | Pending |
| AIGN-02 | TBD | Pending |
| AIGN-03 | TBD | Pending |
| AIGN-04 | TBD | Pending |
| AIGN-05 | TBD | Pending |
| AIGN-06 | TBD | Pending |
| AIGN-07 | TBD | Pending |
| SYNC-01 | TBD | Pending |
| SYNC-02 | TBD | Pending |
| SYNC-03 | TBD | Pending |
| SYNC-04 | TBD | Pending |
| SYNC-05 | TBD | Pending |
| ANLT-01 | TBD | Pending |
| ANLT-02 | TBD | Pending |
| ANLT-03 | TBD | Pending |
| ANLT-04 | TBD | Pending |
| UXPL-01 | TBD | Pending |
| UXPL-02 | TBD | Pending |
| UXPL-03 | TBD | Pending |
| UXPL-04 | TBD | Pending |
| UXPL-05 | TBD | Pending |
| UXPL-06 | TBD | Pending |
| ECOM-01 | TBD | Pending |
| ECOM-02 | TBD | Pending |
| ECOM-03 | TBD | Pending |
| ECOM-04 | TBD | Pending |
| ECOM-05 | TBD | Pending |
| SCOR-01 | TBD | Pending |
| SCOR-02 | TBD | Pending |
| SCOR-03 | TBD | Pending |
| SCOR-04 | TBD | Pending |
| WKFL-01 | TBD | Pending |
| WKFL-02 | TBD | Pending |
| WKFL-03 | TBD | Pending |
| WKFL-04 | TBD | Pending |
| WKFL-05 | TBD | Pending |
| COLB-01 | TBD | Pending |
| COLB-02 | TBD | Pending |
| COLB-03 | TBD | Pending |
| COLB-04 | TBD | Pending |
| COLB-05 | TBD | Pending |
| IMEX-01 | TBD | Pending |
| IMEX-02 | TBD | Pending |
| IMEX-03 | TBD | Pending |
| IMEX-04 | TBD | Pending |
| IMEX-05 | TBD | Pending |
| HOOK-01 | TBD | Pending |
| HOOK-02 | TBD | Pending |
| HOOK-03 | TBD | Pending |
| HOOK-04 | TBD | Pending |
| HOOK-05 | TBD | Pending |

**Coverage:**

- v2.0 requirements: 51 total
- Mapped to phases: 0
- Unmapped: 51

---
*Requirements defined: 2026-03-11*
*Last updated: 2026-03-11 after v2.0 milestone initialization*
