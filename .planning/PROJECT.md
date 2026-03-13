# OpenClaw CRM

## What This Is

An AI-first CRM (branded "Aria") that runs the entire sales pipeline so reps can focus on selling. The AI watches deal stages, user activity, and external engagement signals to proactively generate assets (proposals, decks, email sequences, meeting prep, follow-ups, competitive intel) and drive deals from top-of-funnel prospecting through close and handoff. Built for full sales orgs — SDRs, AEs, managers, and leadership — each with role-appropriate AI capabilities.

## Core Value

The CRM does the work. Reps sell, AI handles everything else — data entry, asset creation, follow-ups, pipeline management. The CRM runs itself.

## Current Milestone: v2.0 Complete & Polish

**Goal:** Wire up the stub infrastructure (job processor, AI generation, integration sync, analytics), polish the UX to production-grade quality (toasts, pagination, validation, dialogs), and add differentiation features (email compose on records, workflow automation builder, activity scoring, team collaboration, import/export improvements, webhooks).

**Target features:**
- Background job execution loop + automation engine wiring
- AI asset generation pipeline (proposals, briefs, battlecards, follow-ups)
- Integration sync completion (Gmail/Outlook/Calendar delta sync)
- Analytics real calculations (win/loss, coaching, forecast)
- Toast notification system + error boundaries
- Pagination + infinite scroll for record tables
- Confirmation dialogs (replace browser confirm)
- Form validation with inline feedback
- Email compose & thread view on record detail pages
- Visual workflow automation builder
- Activity scoring + hot leads dashboard
- Team collaboration (@mentions, comments, saved views)
- Import/export improvements (field mapping, duplicate detection)
- Outbound webhooks on CRM events

## Requirements

### Validated

- ✓ Multi-tenant workspace system with role-based access — v1.0
- ✓ Typed EAV data model with custom objects/attributes per workspace — v1.0
- ✓ Records CRUD with dynamic filtering and sorting — v1.0
- ✓ AI chat with tool calling (25 tools, multi-round, SSE streaming) — v1.0
- ✓ Kanban board views with drag-and-drop — v1.0
- ✓ Full-text search across records and lists — v1.0
- ✓ API key authentication (oc_sk_ prefix, SHA-256 hashed) — v1.0
- ✓ Rich text notes on records (TipTap) — v1.0
- ✓ Tasks linked to records with deadlines — v1.0
- ✓ OAuth login (GitHub, Google) — v1.0
- ✓ Invite link system for workspace members — v1.0
- ✓ Chat channels for team communication — v1.0
- ✓ Email sequences (create, enroll, steps, reply rate tracking) — v1.0
- ✓ Approval workflows (rules, requests, approve/reject, expiration) — v1.0
- ✓ Contract/SOW generation (templates, PDF download, approval linking) — v1.0
- ✓ Customer handoff briefs (auto-generate on close, webhook delivery) — v1.0
- ✓ Competitive battlecards (detection, structured cards, approval) — v1.0
- ✓ Role-based dashboards (rep, manager, leadership views) — v1.0
- ✓ Custom lists with typed attributes and entries — v1.0
- ✓ Notifications (CRUD, read/unread, bulk mark) — v1.0
- ✓ Settings pages (objects, AI, integrations, API keys, approvals, members, Aria) — v1.0
- ✓ Integration OAuth flows (Gmail, Outlook, Zoom) — v1.0
- ✓ Integration webhook endpoints (Gmail, Outlook, Zoom, Calendar) — v1.0
- ✓ Analytics pages with data threshold gates (Win/Loss, Coaching, Forecast) — v1.0
- ✓ Home dashboard with onboarding, stats, recent activity — v1.0
- ✓ Custom objects (17 attribute types, system object protection) — v1.0

### Active

- [ ] Background job execution loop (job handlers actually run)
- [ ] AI asset generation pipeline (proposals, briefs, battlecards, follow-ups)
- [ ] Integration delta sync (Gmail/Outlook/Calendar event processing)
- [ ] Analytics real calculations (win/loss patterns, coaching, forecast)
- [ ] Email/call tracking (open pixel, click tracking, transcription)
- [ ] Toast notification system + error boundaries
- [ ] Pagination for record tables (replace hardcoded limit=200)
- [ ] Confirmation dialogs (replace browser confirm)
- [ ] Form validation with inline feedback
- [ ] Email compose & thread view on record detail pages
- [ ] Visual workflow automation builder
- [ ] Activity scoring + hot leads
- [ ] Team collaboration (@mentions, comments, saved views)
- [ ] Import/export improvements (field mapping, duplicate detection)
- [ ] Outbound webhooks on CRM events
- [ ] Lead scoring and qualification AI

### Out of Scope

- Mobile native apps — web-first, responsive design sufficient for now
- Marketing automation (campaigns, nurture flows) — focus is sales pipeline, not marketing
- Customer support/ticketing — post-sale handled by handoff to external CS tools
- Custom report/dashboard builder — role-based dashboards cover reporting needs initially
- White-labeling/reselling — single-brand product
- Real-time collaborative editing — not needed for CRM workflows
- Drag-and-drop dashboard widgets — fixed dashboard layouts sufficient for v2.0

## Context

OpenClaw CRM is a brownfield project with a massive existing foundation: 27 pages, 99 API endpoints, 44 services, 27 schema files. The core CRM is production-ready — records, pipeline, tasks, notes, AI chat, sequences, approvals, contracts, handoff, battlecards, dashboards, and settings all work.

The main gaps are infrastructure stubs (job processor, sync, AI generation, analytics) and UX polish (no toasts, no pagination, no validation). v2.0 focuses on wiring up the stubs and bringing the UX to production quality, then adding differentiation features.

Key technical context:
- Monorepo: Turborepo + pnpm (apps/web + packages/shared)
- Database: PostgreSQL 16+ with Drizzle ORM
- Auth: Better Auth (sessions) + API keys (external)
- AI: OpenRouter with SSE streaming, 10-round tool calling, 25 tools
- UI: shadcn/ui + Tailwind v4 + TanStack Table + TipTap + dnd-kit
- Testing: Playwright E2E only (no unit tests)
- Known bugs fixed: [object Object] data corruption, status title-to-ID resolution, multiselect array wrapping

## Constraints

- **Tech stack**: Next.js 15 + Drizzle + PostgreSQL — committed, not changing
- **AI provider**: OpenRouter (multi-model) — workspace-configurable, not locked to one LLM
- **Auth**: Better Auth — committed for sessions and OAuth
- **No unit tests**: Only Playwright E2E — new features need E2E coverage
- **Typed EAV**: Core data model is EAV — all new features must work within this pattern
- **Multi-tenancy**: Every feature must be workspace-scoped
- **Existing patterns**: New features must follow established API route + service + component patterns

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Typed EAV over traditional schema | Enables custom objects/fields per workspace without migrations | ✓ Good |
| OpenRouter over direct LLM APIs | Multi-model flexibility, workspace-level model selection | ✓ Good |
| Proactive AI over reactive-only | Core differentiator — CRM that runs itself | — Pending |
| Signal-driven architecture | Deal stages + user behavior + external signals trigger AI actions | — Pending |
| Full close flow (contracts + approvals + handoff) | Complete pipeline coverage is the product promise | ✓ Good — shipped in v1.0 |
| All four integration channels | Email + calendar + LinkedIn + telephony needed for signal collection | — Pending (OAuth done, sync pending) |
| sonner for toast notifications | shadcn/ui compatible, lightweight, good DX | — Pending |
| Cursor-based pagination | Better than offset for large record sets, stable under inserts | — Pending |

---
*Last updated: 2026-03-11 after v2.0 milestone initialization*
