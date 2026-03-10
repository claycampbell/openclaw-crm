---
phase: 05-analytics-intelligence
plan: 03
subsystem: analytics
tags: [forecasting, next-best-action, pipeline, stage-confidence, in-memory-cache]
dependency_graph:
  requires: [records, record_values, objects, attributes, notes, tasks, taskRecords, workspaces]
  provides: [pipeline-forecast, next-best-action, forecast-dashboard, nba-badge]
  affects: [deal-record-detail-page]
tech_stack:
  added: [apps/web/src/components/ui/table.tsx]
  patterns: [EAV-correlated-subquery, OpenRouter-non-streaming, in-memory-cache-5min, stage-playbook]
key_files:
  created:
    - apps/web/src/services/analytics/forecasting.ts
    - apps/web/src/services/analytics/next-best-action.ts
    - apps/web/src/app/api/v1/analytics/forecast/route.ts
    - apps/web/src/app/api/v1/analytics/next-best-action/route.ts
    - apps/web/src/app/(dashboard)/analytics/forecast/page.tsx
    - apps/web/src/components/analytics/ForecastView.tsx
    - apps/web/src/components/analytics/NextBestActionBadge.tsx
    - apps/web/src/components/ui/table.tsx
  modified:
    - apps/web/src/app/(dashboard)/objects/[slug]/[recordId]/page.tsx
decisions:
  - "Stage confidence = overallWinRate * STAGE_POSITION_MULTIPLIERS[stage] ?? 0.7 as fallback"
  - "No per-stage historical close rates — too few data points; use overall rate * stage position"
  - "NBA in-memory cache keyed workspaceId:recordId with 5-minute TTL"
  - "NBA badge silently fails on error (ambient feature, not critical)"
  - "ForecastView uses plain Tailwind table instead of chart library"
  - "Created apps/web/src/components/ui/table.tsx (shadcn Table component didn't exist)"
metrics:
  duration: "implementation complete"
  completed: "2026-03-10"
  tasks: 2
  files: 8
---

# Phase 5 Plan 03: Pipeline Forecasting + Next-Best-Action Summary

Pipeline forecast service computing AI confidence scores per stage with historical close rate fallback, and a per-deal NBA engine with stage playbook + AI enrichment and 5-minute in-memory caching.

## What Was Built

### Files Created

**`apps/web/src/services/analytics/forecasting.ts`**
- Exports: `getPipelineForecast(workspaceId)`
- Returns `{ insufficient: true }` if no closed deals exist
- Loads closed deals to compute overall win rate
- Loads active (non-closed) deals with stage + amount
- Groups active deals by stage, computes per-stage forecast
- AI confidence via OpenRouter with JSON response parsing
- Fallback: `overallWinRate * stagePositionMultiplier` (no AI needed)

**`apps/web/src/services/analytics/next-best-action.ts`**
- Exports: `getNextBestAction(workspaceId, recordId)`
- Validates record belongs to workspace before any processing
- Loads current stage from `record_values`
- Loads last 5 notes and last 5 tasks for the record
- Computes days since last activity
- Matches stage to `STAGE_PLAYBOOK` const for candidates
- AI enrichment: passes stage + activity + candidates to OpenRouter, expects JSON `{action, reason, urgency}`
- Fallback: first playbook candidate + urgency based on days-since-activity
- In-memory cache: 5-minute TTL, keyed `${workspaceId}:${recordId}`

**`apps/web/src/app/api/v1/analytics/forecast/route.ts`**
- GET endpoint at `/api/v1/analytics/forecast`
- Auth: `getAuthContext` + `requireAdmin`

**`apps/web/src/app/api/v1/analytics/next-best-action/route.ts`**
- GET endpoint at `/api/v1/analytics/next-best-action?recordId=...`
- Auth: `getAuthContext` only (no admin required — all workspace members)
- Validates `recordId` query param present and non-empty

**`apps/web/src/components/analytics/ForecastView.tsx`**
- Empty state for no closed deals
- Summary cards: Total Pipeline / AI-Weighted Forecast / At-Risk Value
- Stage breakdown table with confidence progress bars (red/yellow/green)

**`apps/web/src/components/analytics/NextBestActionBadge.tsx`**
- Client component, fetches NBA on mount
- Loading skeleton ("Thinking...")
- Renders urgency dot (red/yellow/grey) + action text + reason
- Silently returns null on fetch error (ambient feature)

**`apps/web/src/components/ui/table.tsx`**
- New shadcn-style Table component (didn't exist in project)
- Exports: Table, TableHeader, TableBody, TableRow, TableHead, TableCell

### Modified Files

**`apps/web/src/app/(dashboard)/objects/[slug]/[recordId]/page.tsx`**
- Added `<NextBestActionBadge recordId={record.id} />` to the right sidebar
- Only shown when `object.slug === "deals"`

## Historical Close Rates

For v1, per-stage historical close rates are not computed (too few data points in early pipeline). Instead:
- Overall workspace win rate is computed from closed won / (closed won + closed lost)
- Per-stage confidence = `overallWinRate * STAGE_POSITION_MULTIPLIERS[stageName]`
- Stage position multipliers: Discovery=0.6, Qualified=0.7, Proposal=0.8, Demo=0.75, Negotiation=0.9, "Contract Sent"=0.92, custom stages=0.7
- AI model can override this with a more nuanced score when OpenRouter is configured

## NBA Stage Playbook

8 stages covered in `STAGE_PLAYBOOK` const:
- Discovery (3 suggestions)
- Qualified (3 suggestions)
- Demo (3 suggestions)
- Proposal (3 suggestions)
- Negotiation (3 suggestions)
- Contract Sent (3 suggestions)
- Closed Won (3 suggestions)
- Closed Lost (3 suggestions)

Custom stage names that don't match fall through to AI-generated suggestion.

## AI Confidence Scores

- Wired when OpenRouter API key configured
- Uses Tier 2 model (claude-haiku-3 class)
- Each stage gets one AI call with stage name, deal count, avg days in pipeline, historical rate
- AI returns JSON `{confidence: 0.0-1.0, reasoning: string}`
- Confidence score clamped to [0, 1]
- If AI fails: uses historical close rate directly

## NBA Badge Embedding

- Added to `apps/web/src/app/(dashboard)/objects/[slug]/[recordId]/page.tsx` right sidebar
- Condition: `object.slug === "deals"` — only appears on deal detail pages
- Does not appear on People, Companies, or other object pages

## Deviations from Plan

1. **Created `apps/web/src/components/ui/table.tsx`** — The shadcn Table component did not exist in the project. Rather than rewrite ForecastView to use raw HTML, I created the component following the same shadcn/ui pattern as existing UI components. This is an auto-fix (Rule 3 — blocking issue).

## Self-Check

All files exist on disk. TypeScript check was not run (Bash restricted in this environment — pnpm/git/node commands denied).
