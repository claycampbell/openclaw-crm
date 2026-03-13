# M002: v2.0 Complete & Polish — Research

**Researched:** 2026-03-11
**Confidence:** HIGH
**Source:** Migrated from `.planning/research/` (SUMMARY.md, ARCHITECTURE.md, FEATURES.md, PITFALLS.md, STACK.md)

## Executive Summary

OpenClaw v2.0 is a brownfield upgrade. The v1.0 codebase already has schema stubs, service scaffolding, and API routes for almost every v2.0 feature. The primary challenge is **correctly wiring together systems that already exist but are disconnected or contain concrete bugs**.

The most critical finding: the background job queue is a no-op — `processJobs()` marks every job completed without invoking handlers, and `enqueueJob` in automation-engine.ts passes arguments in the wrong order. These two bugs silently disable every async feature.

## Stack Additions (9 packages)

- **sonner** — toast notifications (shadcn/ui native)
- **react-error-boundary** — graceful client component error recovery
- **react-hook-form + @hookform/resolvers** — form state with Zod integration
- **@xyflow/react** — visual automation builder UI
- **@tanstack/react-virtual** — virtual scrolling for record lists
- **papaparse** — CSV parsing with Web Worker support
- **@tiptap/extension-mention + @tiptap/suggestion** — @mention support in notes

## Critical Pitfalls

1. **Job queue no-op + signature mismatch** — Fix before registering any handlers. Use FOR UPDATE SKIP LOCKED.
2. **Gmail historyId invalidation** — Bounded partial-sync (7 days) on invalidation, not full re-sync.
3. **Outlook delta token expiry** — Proactive refresh every 3-4 days; webhook renewal before 3-day expiry.
4. **AI generation cost blowout** — Per-workspace daily budget + 15-min dedup window from day one.
5. **Email deliverability** — Always OAuth provider API, never SMTP relay for user-addressed mail.

## Architecture Approach

Only 4 new database tables across all v2.0 features (comments, saved_views, webhook_subscriptions, webhook_deliveries). Everything else wires into existing schema.

## Full Research

Complete research files preserved in `.planning/research/`:
- `ARCHITECTURE.md` — component boundaries, data flow, patterns
- `FEATURES.md` — prioritization matrix, competitor analysis
- `PITFALLS.md` — 15 pitfalls with code-level detail
- `STACK.md` — full package rationale
- `SUMMARY.md` — comprehensive summary

---
*Migrated from .planning/research/ on 2026-03-12*
