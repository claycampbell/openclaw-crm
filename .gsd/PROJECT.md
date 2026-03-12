# Project

## What This Is

OpenClaw CRM (branded "Aria") — an AI-first CRM built on Next.js 15 / Drizzle / PostgreSQL that runs the entire sales pipeline. The AI watches deal stages, user activity, and external engagement signals to proactively generate assets (proposals, decks, email sequences, meeting prep, follow-ups, competitive intel) and drive deals from prospecting through close and handoff. Built for full sales orgs — SDRs, AEs, managers, and leadership.

## Core Value

The CRM does the work. Reps sell, AI handles everything else — data entry, asset creation, follow-ups, pipeline management. The CRM runs itself.

## Current State

**v1.0 Foundation shipped (Phases 1-5 built ad-hoc):** 27 pages, 99 API endpoints, 44 services, 27 schema files. Core CRM is production-ready — records, pipeline, tasks, notes, AI chat (25 tools, 10-round, SSE streaming), sequences, approvals, contracts, handoff, battlecards, dashboards, and settings all work.

**Key gaps:** Infrastructure stubs are disconnected — `processJobs()` is a no-op, `enqueueJob` signature is mismatched in automation-engine, AI generation pipeline, integration sync, activity scoring, analytics, and webhooks all silently fail because background jobs never execute. UX lacks toasts, pagination, inline validation, and proper confirmation dialogs.

**v2.0 in progress:** Roadmap defined (6 phases, 55 requirements), Phase 6 plans written, E2E tests for Phase 6-01 complete. Phase 6-01 (job execution fix) has been implemented and tested.

## Architecture / Key Patterns

- **Monorepo:** Turborepo + pnpm (apps/web + packages/shared)
- **Database:** PostgreSQL 16+ with Drizzle ORM, **Typed EAV** data model (objects → attributes → records → record_values)
- **Auth:** Better Auth (sessions + OAuth) + API keys (oc_sk_ prefix, SHA-256 hashed)
- **Multi-tenancy:** Every table scoped by workspace_id, enforced via `getAuthContext()`
- **API pattern:** Route handler → `getAuthContext()` → service function → Drizzle → response helpers
- **Background work:** `background_jobs` table polled by cron endpoints, signal events → automation rules → job dispatch
- **AI:** OpenRouter with SSE streaming, workspace-configurable models, 10-round tool calling
- **Frontend:** Next.js 15 App Router, shadcn/ui + Tailwind CSS v4, TanStack Table v8, TipTap, dnd-kit
- **Testing:** Playwright E2E only (no unit tests)

## Capability Contract

See `.gsd/REQUIREMENTS.md` for the explicit capability contract, requirement status, and coverage mapping.

## Milestone Sequence

- [x] M001: v1.0 Foundation — Core CRM with records, pipeline, AI chat, sequences, approvals, contracts, dashboards, analytics stubs
- [ ] M002: v2.0 Complete & Polish — Wire up stubs, UX polish, email compose, workflow automation, activity scoring, collaboration, import/export, webhooks, analytics
- [x] M003: UI Design & UX Polish — 7 slices of frontend refinement
- [ ] M004: Company / BU Hierarchy & Intelligent Agency — Two-level workspace hierarchy (Company → Business Units), roll-up views, Intelligent Agency for cross-entity joint opportunities

---
*Last updated: 2026-03-12 — migrated from .planning/*
