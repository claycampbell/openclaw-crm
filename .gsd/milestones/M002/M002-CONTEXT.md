# M002: v2.0 Complete & Polish — Context

**Gathered:** 2026-03-11
**Status:** Ready for execution (Phase 6 plans written)

## Project Description

OpenClaw CRM is an AI-first CRM with a massive existing foundation (27 pages, 99 API endpoints, 44 services). v1.0 built the full pipeline from records through close. v2.0 wires up the disconnected stubs, polishes UX to production quality, and adds differentiation features.

## Why This Milestone

The v1.0 foundation has critical infrastructure gaps — the job processor is a no-op, email sync isn't wired, AI generation doesn't trigger, and the UX lacks basic production quality (no toasts, no pagination, no validation). v2.0 fixes these gaps and delivers the AI-first promise.

## User-Visible Outcome

### When this milestone is complete, the user can:

- See background jobs execute automatically when deals change stages
- Receive toast feedback on every action, inline form validation, proper confirmation dialogs
- Browse paginated record tables with virtual scrolling
- View synced Gmail/Outlook emails on record detail pages
- Compose and send emails directly from records
- See AI-generated briefs, proposals, and follow-ups appear in the approval inbox automatically
- Create automation rules via a form UI
- @mention teammates in notes and receive notifications
- Import CSVs with field mapping and duplicate detection
- Configure outbound webhooks for external integrations
- View analytics with real calculations from deal data

### Entry point / environment

- Entry point: http://localhost:3001 (Next.js app)
- Environment: local dev / browser
- Live dependencies: PostgreSQL, OpenRouter API (optional for AI features)

## Risks and Unknowns

- Gmail historyId invalidation causing re-sync storms with real mailboxes
- Outlook delta token 7-day expiry handling
- AI generation prompt quality needs iteration against real deal data
- Analytics summary table schema depends on report prioritization
- Deployment model for pg-boss workers (Railway/Fly.io vs Vercel Cron)

## Existing Codebase / Prior Art

- `apps/web/src/services/job-queue.ts` — processJobs() no-op bug, core fix target
- `apps/web/src/services/automation-engine.ts` — enqueueJob signature mismatch
- `apps/web/src/services/signals.ts` — signal event system, needs auto-enqueue wiring
- `apps/web/src/db/schema/` — 27 schema files, all EAV tables in place
- `apps/web/src/instrumentation.ts` — handler registration stubs

## Relevant Requirements

- R001-R019 — all v2.0 active requirements (see REQUIREMENTS.md)

## Scope

### In Scope

- Job execution fix + signal-to-automation pipeline
- UX polish (toasts, error boundaries, dialogs, validation, pagination)
- Gmail/Outlook delta sync + email compose + thread view
- AI asset generation pipeline with budget controls
- Activity scoring + hot leads
- Workflow automation form UI
- @mentions, comments, saved views
- CSV import/export with field mapping
- Outbound webhooks
- Analytics real calculations

### Out of Scope / Non-Goals

- Node-graph workflow editor (v3)
- Real-time WebSocket push (v3)
- Inline spreadsheet editing (v3)
- Mobile native apps
- Marketing automation

## Technical Constraints

- All features must work within Typed EAV data model
- Multi-tenancy (workspace_id scoping) on every table
- Follow existing API route + service + component patterns
- E2E coverage required (Playwright, no unit tests)
