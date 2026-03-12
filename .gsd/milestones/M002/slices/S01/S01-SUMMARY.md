---
slice: S01
title: "Job Execution + Signal Pipeline"
status: complete
started: 2026-03-11
completed: 2026-03-12
tasks_completed: 1
---

# S01: Job Execution + Signal Pipeline — Summary

Fixed the background job execution system so jobs actually run, retry, and dead-letter correctly. Wired signal events to auto-enqueue automation evaluation. Fixed enqueueJob signature mismatch.

## What Was Built

- **processJobs()** now calls `executeJob()` with `FOR UPDATE SKIP LOCKED` to prevent double-execution
- **Exponential backoff retry** — failing jobs retry up to 3 times with increasing delays, then land in `failed` (dead-letter) state
- **Signal auto-enqueue** — `writeSignalEvent()` automatically enqueues a `signal_evaluate` job so signals are always evaluated
- **Unified enqueueJob** — `lib/job-queue.ts` and `services/job-queue.ts` have compatible signatures; automation-engine calls work correctly
- **E2E tests** — Playwright tests verify the full job pipeline and UX infrastructure

## Key Decisions

- FOR UPDATE SKIP LOCKED chosen over advisory locks for simplicity and PostgreSQL native support
- Dead-letter state is `failed` (existing enum value) rather than adding a new status

## Source

Migrated from `.planning/phases/06/06-01-PLAN.md` execution.
