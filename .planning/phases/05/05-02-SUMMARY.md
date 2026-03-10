---
phase: 05-analytics-intelligence
plan: 02
subsystem: analytics
tags: [rep-coaching, cohort-analysis, pii-safe, top-performer-baseline]
dependency_graph:
  requires: [records, objects, attributes, notes, taskRecords, workspaceMembers, users]
  provides: [rep-coaching-analysis, rep-coaching-api, rep-coaching-dashboard]
  affects: []
tech_stack:
  added: []
  patterns: [EAV-correlated-subquery, OpenRouter-non-streaming, anonymized-LLM-calls]
key_files:
  created:
    - apps/web/src/services/analytics/rep-coaching.ts
    - apps/web/src/app/api/v1/analytics/rep-coaching/route.ts
    - apps/web/src/components/analytics/RepCoachingCards.tsx
    - apps/web/src/app/(dashboard)/analytics/rep-coaching/page.tsx
  modified: []
decisions:
  - "Rep names NOT in service output — enriched server-side in API route after LLM calls complete"
  - "Top performer: top quartile by win rate (or top 1 if <4 reps)"
  - "Deviations only computed if delta > threshold (>0.05 for rates, >0.5 for counts)"
  - "Tasks counted via taskRecords junction table (not tasks.workspaceId since we need per-deal counts)"
metrics:
  duration: "implementation complete"
  completed: "2026-03-10"
  tasks: 2
  files: 4
---

# Phase 5 Plan 02: Rep Performance Coaching Summary

Per-rep cohort analysis service comparing individual rep metrics to top-performer baseline, with AI-generated coaching tips per non-top-performer rep. Minimum data gate (2+ reps with closed deals). Rep names never sent to LLM.

## What Was Built

### Files Created

**`apps/web/src/services/analytics/rep-coaching.ts`**
- Exports: `hasCoachingDataVolume(workspaceId)`, `getRepCoachingRecommendations(workspaceId)`
- `hasCoachingDataVolume`: Counts distinct `created_by` values on deals with closed stages. Returns `{ sufficient: bool, repCount, minimumRequired: 2 }`.
- `getRepCoachingRecommendations`: Computes per-rep metrics, identifies top performers, computes deviations, generates AI coaching tips. Returns `RepCoachingReport`.

**`apps/web/src/app/api/v1/analytics/rep-coaching/route.ts`**
- GET endpoint at `/api/v1/analytics/rep-coaching`
- Auth: `getAuthContext` + `requireAdmin`
- After service call, enriches `userId` → `displayName` via `users` + `workspaceMembers` JOIN
- Rep names added only after LLM calls complete (PII safety)

**`apps/web/src/components/analytics/RepCoachingCards.tsx`**
- Client component with empty state ("needs 2+ reps" message)
- Top performer baseline summary card
- Per-rep cards sorted: top performers first, then by worst win rate
- Deviation rows with colored delta indicators (red = below baseline, green = above)
- AI coaching tip in italic text block below deviations
- Top performers show "Top performer — keep it up" instead of deviations

**`apps/web/src/app/(dashboard)/analytics/rep-coaching/page.tsx`**
- Server component, fetches from API route with cookie passthrough

## Tables Used for Activity Measurement

- **Notes**: `notes.recordId` — count of notes per deal record, grouped by `notes.recordId`
- **Tasks**: `taskRecords.recordId` — count of task links per deal record via junction table
- **Records**: `records.createdBy` — used as "deal owner" proxy (no explicit owner attribute assumed)

## Top Performer Definition

Top performers = reps in top quartile by win rate.
- If repCount >= 4: `ceil(repCount / 4)` reps are top performers
- If repCount < 4: top 1 rep is the baseline

Baseline metrics are averaged across all top performers.

## PII Safety

- Service `RepCoachingReport` has no `displayName` field — only `userId`
- LLM calls in the service receive only anonymized metric values and deltas
- Rep names are resolved in the API route AFTER all LLM calls complete, via `users` JOIN
- This ensures rep names never reach OpenRouter

## Deviations from Plan

None — plan executed as written.

## Self-Check

All files exist on disk. TypeScript check was not run (Bash restricted in this environment).
