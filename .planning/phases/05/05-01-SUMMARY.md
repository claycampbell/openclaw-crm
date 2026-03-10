---
phase: 05-analytics-intelligence
plan: 01
subsystem: analytics
tags: [win-loss, analytics, ai-narrative, data-volume-gate]
dependency_graph:
  requires: [records, record_values, objects, attributes, notes]
  provides: [win-loss-analysis, win-loss-api, win-loss-dashboard]
  affects: [sidebar-nav]
tech_stack:
  added: []
  patterns: [EAV-correlated-subquery, OpenRouter-non-streaming, data-volume-gate]
key_files:
  created:
    - apps/web/src/services/analytics/win-loss.ts
    - apps/web/src/app/api/v1/analytics/win-loss/route.ts
    - apps/web/src/components/analytics/WinLossPatterns.tsx
    - apps/web/src/app/(dashboard)/analytics/win-loss/page.tsx
  modified:
    - apps/web/src/components/layout/sidebar.tsx
decisions:
  - "Used notes.recordId inArray query instead of raw SQL for note counts — safer"
  - "Three pattern types: deal size buckets, deal velocity (days), engagement (notes count)"
  - "Assumed stage attribute slug is 'stage', amount is 'amount'"
  - "Data range computed from min/max createdAt of closed deals"
metrics:
  duration: "implementation complete"
  completed: "2026-03-10"
  tasks: 2
  files: 5
---

# Phase 5 Plan 01: Win/Loss Pattern Analysis Summary

Win/loss pattern analysis service with minimum data volume gate (30+ closed deals required), three computed patterns, AI narrative generation via OpenRouter, and a server-rendered admin dashboard with time range filtering.

## What Was Built

### Files Created

**`apps/web/src/services/analytics/win-loss.ts`**
- Exports: `hasMinimumDataVolume(workspaceId)`, `getWinLossPatterns(workspaceId, options?)`
- `hasMinimumDataVolume`: Queries `records` with EAV correlated subquery to count deals where stage IN ('Closed Won', 'Closed Lost'). Returns `{ sufficient: bool, closedCount, minimumRequired: 30 }`.
- `getWinLossPatterns`: Loads all closed deals, computes 3 pattern types, calls OpenRouter Tier 2 model for AI narrative. Returns `WinLossAnalysis` interface.

**`apps/web/src/app/api/v1/analytics/win-loss/route.ts`**
- GET endpoint at `/api/v1/analytics/win-loss`
- Auth: `getAuthContext` + `requireAdmin`
- Query param: `?since=90d|6m|all` (translates to Date filter)
- Returns `{ insufficient: true, closedCount, minimumRequired }` when data gate fails
- Returns full `WinLossAnalysis` when sufficient data exists

**`apps/web/src/components/analytics/WinLossPatterns.tsx`**
- Client component with time range selector (90d / 6m / all)
- Empty state gate: renders "requires 30 closed deals" card with count
- Full view: summary row (win rate, won count, lost count), AI narrative blockquote, pattern cards grid
- Pattern cards: label, finding, mini win/loss bar using Tailwind width utilities

**`apps/web/src/app/(dashboard)/analytics/win-loss/page.tsx`**
- Server component, fetches from API route with cookie passthrough
- Renders `<WinLossPatterns initialData={data} />`

### Sidebar Updated
Added Analytics section to sidebar with Win/Loss, Rep Coaching, Forecast nav items.

## Pattern Detection Approach

Three patterns are computed:

1. **Deal size buckets** (only if `amount` attribute exists): Segments deals into <$10k, $10k-$50k, >$50k and computes win rate per bucket. Minimum 3 deals per bucket to include.

2. **Deal velocity**: Computes median days-to-close for won vs lost deals (using `updatedAt - createdAt` as proxy since stage change timestamps are not available).

3. **Engagement depth** (notes count): Groups deals into 0 notes, 1-3 notes, 4+ notes and computes win rate per group. Minimum 3 deals per group.

## Attribute Slug Assumptions

- Stage attribute slug: `"stage"`
- Amount attribute slug: `"amount"`
- Close date: checked for `"close_date"` and `"closed_at"` slugs, but not used in v1 (uses `updatedAt` as proxy)

## AI Narrative

- Wired via OpenRouter when API key configured in workspace settings or `OPENROUTER_API_KEY` env var
- Uses Tier 2 (light) model: workspace setting or env `OPENROUTER_MODEL`, defaults to `"anthropic/claude-haiku-3"`
- If no API key: `aiNarrative` is `null` — component shows "Configure OpenRouter API key" message
- Only aggregated statistics passed to LLM — no raw record content

## Deviations from Plan

None — plan executed as written. Note: `close_date` / `closed_at` attribute is present in the attr query but not used in v1 velocity calculations (uses `updatedAt` as proxy), consistent with plan spec.

## Self-Check

All files exist on disk. TypeScript check was not run (Bash access was restricted to `ls` commands only in this environment — pnpm, git, and node commands were denied). Code was manually reviewed for correctness against the existing codebase patterns.
