# M002: v2.0 Complete & Polish

**Vision:** Wire up the disconnected infrastructure stubs, polish UX to production quality, and deliver the AI-first CRM promise with email compose, workflow automation, activity scoring, collaboration, import/export, and webhooks.

## Success Criteria

- Background jobs execute automatically — a deal stage change triggers signal evaluation, rule matching, and action dispatch end-to-end
- Every user mutation shows toast feedback, forms validate inline, destructive actions require styled confirmation
- Record tables paginate with cursor-based pagination and virtual scrolling at 1000+ records
- Gmail/Outlook emails sync incrementally and appear on record detail pages
- Users can compose and send emails directly from record pages
- AI-generated assets (briefs, proposals, follow-ups) appear in approval inbox triggered by deal events
- Automation rules can be created, enabled/disabled, and triggered via form UI
- Team members can @mention each other in notes and leave threaded comments
- CSV import handles field mapping and duplicate detection; export flattens EAV to columns
- Outbound webhooks deliver CRM events to external URLs with HMAC signing and retry
- Analytics dashboards show real calculations from accumulated deal data

## Key Risks / Unknowns

- Gmail historyId invalidation causing re-sync storms — needs real mailbox testing
- Outlook delta token 7-day expiry and webhook 3-day renewal timing
- AI generation prompt quality requires iteration against real deal data
- Analytics summary table schema depends on report prioritization
- Deployment model for background workers (Railway/Fly vs Vercel Cron)

## Proof Strategy

- Job system reliability → retire in S01 by proving jobs execute, retry, and dead-letter correctly via E2E tests
- Gmail sync edge cases → retire in S06 by proving bounded partial-sync recovery with stale historyId
- AI cost control → retire in S10 by proving per-workspace budget + dedup window prevent runaway generation

## Verification Classes

- Contract verification: Playwright E2E tests per slice
- Integration verification: Real database operations, OAuth token flows
- Operational verification: Job execution lifecycle, retry, dead-letter
- UAT / human verification: UI polish review, email compose flow, analytics dashboard review

## Milestone Definition of Done

This milestone is complete only when all are true:

- All 14 slices are complete with passing E2E tests
- Job system executes handlers reliably with concurrent safety
- UX polish is consistent across all mutation surfaces
- Email sync + compose works end-to-end with real OAuth tokens
- AI generation triggers automatically from deal events
- Analytics show real calculations (not stubs) when data volume gate is met
- All 55 v2.0 requirements are validated

## Requirement Coverage

- Covers: R001-R019 (all v2.0 active requirements)
- Partially covers: none
- Leaves for later: R080-R082 (deferred to v3)
- Orphan risks: none

## Slices

- [x] **S01: Job Execution + Signal Pipeline** `risk:high` `depends:[]`
  > After this: Background jobs execute, retry, and dead-letter correctly; deal stage changes trigger automation evaluation end-to-end — verified by E2E tests

- [x] **S02: Toast + Error Boundaries + Confirmation Dialogs** `risk:low` `depends:[]`
  > After this: Every mutation shows toast feedback, error boundaries catch client failures, all destructive actions use styled dialogs — no window.alert/confirm remain

- [x] **S03: Form Validation** `risk:medium` `depends:[]`
  > After this: All create/edit record forms show inline field-level validation errors before submission, with dynamic EAV-to-Zod schema generation

- [x] **S04: Cursor Pagination + Virtual Scroll** `risk:medium` `depends:[]`
  > After this: Record tables load via cursor-based pagination and support virtual scrolling through 1000+ records without DOM degradation

- [ ] **S05: E2E Tests for UX Polish** `risk:low` `depends:[S02,S03,S04]`
  > After this: Playwright E2E tests verify toast notifications, form validation, pagination, and dialog behavior across the UX polish slices

- [ ] **S06: Gmail + Outlook Delta Sync** `risk:high` `depends:[S01]`
  > After this: Connected Gmail/Outlook accounts sync emails incrementally into the CRM, matched to records by email address, with recovery from stale sync tokens

- [ ] **S07: Calendar Sync + Email-to-Record Matching** `risk:medium` `depends:[S06]`
  > After this: Calendar meetings auto-log to deal timeline; synced emails reliably match to correct contact/deal records

- [ ] **S08: Email Thread View** `risk:low` `depends:[S06]`
  > After this: Users can view email thread history on record detail pages, grouped by thread_id with lazy-loaded message bodies

- [ ] **S09: Email Compose** `risk:medium` `depends:[S06]`
  > After this: Users can compose and send emails from record detail pages via OAuth provider API, with TipTap editor, CC/BCC, and auto-populated To field

- [ ] **S10: AI Asset Generation Pipeline** `risk:high` `depends:[S01]`
  > After this: Deal events trigger auto-generation of opportunity briefs, proposals, meeting prep, follow-ups, and battlecards — all with budget controls and dedup

- [ ] **S11: Activity Scoring + Hot Leads** `risk:medium` `depends:[S01]`
  > After this: Each contact/company has a composite activity score; hot leads dashboard shows top 20 by score with trend indicators

- [ ] **S12: Workflow Automation UI + Team Collaboration** `risk:medium` `depends:[S01]`
  > After this: Users can create automation rules via form UI; @mention teammates in notes; leave threaded comments; save/share filter views

- [ ] **S13: Import/Export + Outbound Webhooks** `risk:low` `depends:[S01]`
  > After this: CSV import with field mapping and dedup; CSV export with EAV flattening; outbound webhooks with HMAC signing and retry

- [ ] **S14: Analytics Real Calculations** `risk:medium` `depends:[S10]`
  > After this: Win/loss patterns, rep coaching, pipeline forecast, and next-best-action all use real calculations with AI narrative — not stubs

## Boundary Map

### S01 → S06, S10, S11, S12, S13
Produces:
- Working `processJobs()` with FOR UPDATE SKIP LOCKED
- `enqueueJob()` with correct unified signature
- `writeSignalEvent()` auto-enqueues `signal_evaluate` jobs
- Automation engine correctly dispatches action jobs from matching rules

### S06 → S07, S08, S09
Produces:
- `email_messages` records synced from Gmail/Outlook
- Delta sync state tracked in `integration_tokens`
- Email-to-record matching utility

### S10 → S14
Produces:
- AI generation pipeline with registered job handlers
- `generated_assets` records in approval inbox
- Per-workspace budget tracking and dedup
