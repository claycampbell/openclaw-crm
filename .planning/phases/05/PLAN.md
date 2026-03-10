# Phase 5: Analytics + Intelligence

This document contains all three execution plans for Phase 5. Each plan section is self-contained and can be handed to an executor independently.

---

## Plan 05-01: Win/Loss Pattern Analysis

```
---
phase: 05-analytics-intelligence
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/services/analytics/win-loss.ts
  - apps/web/src/app/api/v1/analytics/win-loss/route.ts
  - apps/web/src/app/(dashboard)/analytics/win-loss/page.tsx
  - apps/web/src/components/analytics/WinLossPatterns.tsx
autonomous: true
requirements:
  - INTL-01
must_haves:
  truths:
    - "Win/loss dashboard is hidden (returns empty state) when fewer than 30 closed deals exist in the workspace"
    - "When sufficient deal history exists, the page shows an AI-generated narrative paragraph naming specific patterns (e.g., number of stakeholders, POC presence, deal size thresholds)"
    - "Both closed-won AND closed-lost deals are included in the analysis — no selection bias toward wins only"
    - "Pattern cards show a concrete statistic (e.g., '2.1x more likely to close') with the deal count powering that stat"
    - "Leadership can filter patterns by time range (last 90 days, last 6 months, all time)"
  artifacts:
    - path: "apps/web/src/services/analytics/win-loss.ts"
      provides: "Query layer over closed deals — attribute pattern mining, cohort splits, AI narrative generation"
      exports:
        - getWinLossPatterns
        - hasMinimumDataVolume
    - path: "apps/web/src/app/api/v1/analytics/win-loss/route.ts"
      provides: "GET endpoint returning patterns JSON, enforces workspace scope"
    - path: "apps/web/src/app/(dashboard)/analytics/win-loss/page.tsx"
      provides: "Server-rendered analytics page accessible to admin role"
    - path: "apps/web/src/components/analytics/WinLossPatterns.tsx"
      provides: "Pattern cards + AI narrative display, empty state gate"
  key_links:
    - from: "apps/web/src/services/analytics/win-loss.ts"
      to: "record_values table (status/stage attributes on deal records)"
      via: "Drizzle correlated EXISTS subqueries — same pattern as query-builder.ts"
      pattern: "db.select.*from records.*where.*EXISTS.*record_values"
    - from: "apps/web/src/services/analytics/win-loss.ts"
      to: "OpenRouter via ai-chat.ts callLLM helper"
      via: "Non-streaming completion call — no SSE in analytics service"
      pattern: "callOpenRouter.*messages.*no stream"
    - from: "apps/web/src/app/(dashboard)/analytics/win-loss/page.tsx"
      to: "/api/v1/analytics/win-loss"
      via: "Server component fetch or direct service call"
---
```

<objective>
Build a read-only win/loss pattern analysis layer that queries closed deal history, identifies statistically significant behavioral patterns (stakeholder count, POC presence, deal velocity, engagement levels), and generates an AI narrative summary — gated behind a minimum data volume check that prevents surfacing misleading insights from thin data.

Purpose: This is the foundational analytics feature. Once the workspace has accumulated 90+ days of deal history (target: 30+ closed deals), this surface transforms raw CRM data into actionable intelligence that managers cannot get from any other view.

Output: Win/loss service, GET API route, server-rendered dashboard page, pattern card components with empty-state gate.
</objective>

<execution_context>
@C:/Users/ClayCampbell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/ClayCampbell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/codebase/ARCHITECTURE.md

<interfaces>
<!-- Key types and patterns the executor needs. Extracted from codebase. -->

From apps/web/src/services/records.ts:
```typescript
export interface FlatRecord {
  id: string;
  objectId: string;
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
  values: Record<string, unknown>;
}
```

From apps/web/src/lib/api-utils.ts (pattern — infer exact imports from source):
```typescript
// All route handlers follow this pattern:
export async function GET(req: Request): Promise<Response> {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();
  // validate, call service, return:
  return success(data);
}
// Helpers: unauthorized(), forbidden(), notFound(), badRequest(msg), success(data, status?)
// requireAdmin(ctx) → returns Response | null (null = user is admin, non-null = 403 response)
```

From apps/web/src/db/schema/records.ts:
```typescript
// records table: id, objectId, createdAt, createdBy, updatedAt, sortOrder
// record_values table: id, recordId, attributeId, textValue, numberValue, dateValue,
//   timestampValue, booleanValue, jsonValue, referencedRecordId, actorId, sortOrder, createdAt, createdBy
```

From apps/web/src/services/ai-chat.ts (pattern for non-streaming LLM calls):
```typescript
// The existing service uses fetch() to call OpenRouter directly.
// For analytics, use non-streaming POST to OpenRouter chat/completions endpoint.
// Get AI config from: const settings = workspace.settings as WorkspaceSettings
// Model: settings.openrouterModel ?? "anthropic/claude-3-haiku"  (Tier 2 — light generation)
// Auth: Authorization: `Bearer ${settings.openrouterApiKey}`
```

EAV query pattern (from query-builder.ts):
```typescript
// To find deals where a specific attribute equals a value:
// SELECT records.* FROM records
// WHERE records.object_id = $dealObjectId
// AND EXISTS (
//   SELECT 1 FROM record_values rv
//   WHERE rv.record_id = records.id
//   AND rv.attribute_id = $stageAttrId
//   AND rv.text_value IN ('Closed Won', 'Closed Lost')
// )
// Use Drizzle sql template literals and exists() for type safety.
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Win/loss query service with data volume gate</name>
  <files>apps/web/src/services/analytics/win-loss.ts</files>
  <action>
Create `apps/web/src/services/analytics/` directory and `win-loss.ts` service. This is a read-only analytics layer — no writes.

**Exported functions:**

`hasMinimumDataVolume(workspaceId: string): Promise<{ sufficient: boolean; closedCount: number; minimumRequired: number }>`
- Query records table joined with record_values to count deals where stage attribute text_value is "Closed Won" OR "Closed Lost"
- Minimum required: 30 closed deals
- Return `{ sufficient: closedCount >= 30, closedCount, minimumRequired: 30 }`
- Multi-tenant: scope by `objects.workspace_id = workspaceId`

`getWinLossPatterns(workspaceId: string, options?: { since?: Date }): Promise<WinLossAnalysis>`
- If `hasMinimumDataVolume` returns `sufficient: false`, throw an error with message "Insufficient data: need 30+ closed deals"
- Fetch all closed deals (won + lost) using EAV correlated subqueries. For each deal, load values for these standard attributes by slug: `stage`, `amount`, `close_date` (or `closed_at`). Also load count of linked People records as "stakeholder count" (query records WHERE object is People AND a record_reference attribute on the deal points to them — or use note/task count as a proxy if direct stakeholder linking is unavailable).
- Compute pattern statistics across the closed deal corpus:
  - Win rate overall: `wonCount / (wonCount + lostCount)`
  - Win rate by deal size bucket: segment into <$10k, $10k-$50k, $50k+ using amount attribute; compute win rate per bucket
  - Median days-to-close for won vs lost (from createdAt to close_date or updatedAt when stage changed)
  - Win rate by deal count that has linked notes (proxy for engagement depth): 0 notes vs 1-3 notes vs 4+ notes
- Call OpenRouter with Tier 2 (light) model — claude-haiku class — with a system prompt instructing it to generate a 2-3 sentence plain-English narrative identifying the top 2 patterns. Pass the computed statistics as structured data in the user message (not raw records). Do NOT pass raw record content to the LLM — only aggregated statistics.
- Return:
  ```typescript
  interface WinLossAnalysis {
    closedWonCount: number;
    closedLostCount: number;
    overallWinRate: number;
    patterns: Array<{
      label: string;       // e.g., "Deal size"
      finding: string;     // e.g., "Deals under $10k close 2.1x more often"
      wonCount: number;
      lostCount: number;
      winRate: number;
    }>;
    aiNarrative: string;  // 2-3 sentence AI summary
    computedAt: Date;
    dataRange: { from: Date; to: Date };
  }
  ```

**Important:** Use Drizzle ORM with `sql` template literals and `exists()` for correlated subqueries — same pattern as `apps/web/src/lib/query-builder.ts`. Do NOT use raw SQL strings. All queries must include `workspace_id` scope to prevent cross-tenant data leakage. When loading deal object ID, query `objects` table WHERE `workspace_id = workspaceId AND slug = 'deals'`.

**LLM call:** Use fetch() to POST to `https://openrouter.ai/api/v1/chat/completions`. Load OpenRouter key from workspace settings. If no API key configured, set `aiNarrative` to `null` and continue — do not throw. This prevents analytics from breaking for workspaces with no AI configured.
  </action>
  <verify>
    <automated>MISSING — No unit test infrastructure exists (Playwright E2E only per CLAUDE.md). Manual verification: call getWinLossPatterns with a workspaceId that has <30 closed deals and confirm it throws "Insufficient data". TypeScript compile check: cd apps/web && pnpm tsc --noEmit</automated>
  </verify>
  <done>Service exports hasMinimumDataVolume and getWinLossPatterns. TypeScript compiles with no errors. Data-volume gate throws at <30 closed deals. Both won and lost deals included in queries. LLM narrative gracefully handles missing API key.</done>
</task>

<task type="auto">
  <name>Task 2: Win/loss API route + dashboard page + pattern components</name>
  <files>
    apps/web/src/app/api/v1/analytics/win-loss/route.ts,
    apps/web/src/app/(dashboard)/analytics/win-loss/page.tsx,
    apps/web/src/components/analytics/WinLossPatterns.tsx
  </files>
  <action>
**Route handler** — `apps/web/src/app/api/v1/analytics/win-loss/route.ts`:
- `GET` handler: call `getAuthContext(req)`, return `unauthorized()` if null. Call `requireAdmin(ctx)` — analytics pages are admin-only. Accept optional `?since=90d|6m|all` query param (default: `all`). Translate `since` to a `Date` option. Call `getWinLossPatterns(ctx.workspaceId, { since })`. If hasMinimumDataVolume returns insufficient, return `success({ insufficient: true, closedCount, minimumRequired: 30 })` — not an error, the UI handles the empty state. On success return `success(analysis)`. On unexpected error return `badRequest("Failed to compute win/loss analysis")`.

**Dashboard page** — `apps/web/src/app/(dashboard)/analytics/win-loss/page.tsx`:
- Server component. Fetch from `/api/v1/analytics/win-loss` server-side (or call service directly with auth). Render `<WinLossPatterns data={data} />`. Add to dashboard nav if a nav file exists (check `apps/web/src/components/` for a Sidebar or nav component and add "Analytics" section with "Win/Loss" link if not already present).
- Route must be protected — it sits inside `(dashboard)` route group which middleware already guards.

**Pattern component** — `apps/web/src/components/analytics/WinLossPatterns.tsx`:
- Client component (`"use client"`).
- If `data.insufficient === true`: render an empty state card with message: "Win/loss analysis requires at least 30 closed deals. You currently have {data.closedCount}. Keep closing deals — this dashboard unlocks automatically." Do NOT show a spinner or error — this is a designed gate, not a failure.
- If data is sufficient, render:
  - Summary row: Overall win rate as large percentage + "X won, Y lost" subtext
  - Time range selector: "Last 90 days | Last 6 months | All time" buttons (client-side, re-fetches `/api/v1/analytics/win-loss?since=...`)
  - AI narrative block: Styled blockquote with the `aiNarrative` text. If narrative is null (no API key), render a muted note: "Configure an OpenRouter API key in Settings to enable AI narrative summaries."
  - Pattern cards grid (2-col on desktop, 1-col mobile): each card shows `label`, `finding`, and a mini win-rate bar (won% vs lost% using Tailwind w- utilities — no chart library needed)
- Use shadcn/ui Card, Badge components. Tailwind CSS v4 for layout.
  </action>
  <verify>
    <automated>cd apps/web && pnpm tsc --noEmit</automated>
  </verify>
  <done>GET /api/v1/analytics/win-loss returns 200 with pattern data or insufficient-data object. Dashboard page renders at /analytics/win-loss. Empty state shows when <30 deals. Pattern cards render when data exists. TypeScript compiles clean.</done>
</task>

</tasks>

<verification>
1. TypeScript: `cd apps/web && pnpm tsc --noEmit` passes with no errors
2. Lint: `pnpm lint` from repo root passes
3. Empty state: workspace with 0 closed deals → page shows "requires at least 30 closed deals" message, not an error
4. Workspace scope: query results are scoped to workspaceId — no cross-tenant leak possible
5. Both won and lost: service queries for both "Closed Won" and "Closed Lost" stage values — verify via code review that the IN clause includes both
6. No EAV misuse: no AI-generated content stored in record_values
7. Admin-only gate: requireAdmin enforced on the API route
</verification>

<success_criteria>
- Win/loss page exists at /analytics/win-loss inside the (dashboard) route group
- Data volume gate prevents showing analytics until 30+ closed deals exist, with clear count shown to user
- When sufficient data exists: overall win rate, per-pattern statistics, and AI narrative all render
- Both closed-won and closed-lost deals included (no selection bias)
- TypeScript compiles clean, lint passes
- All queries workspace-scoped (no cross-tenant risk)
</success_criteria>

<output>
After completion, create `.planning/phases/05/05-01-SUMMARY.md` with:
- What was built (files created, key functions exported)
- Pattern detection approach chosen (which attributes used for bucketing)
- Any attribute slug assumptions made (e.g., assumed stage slug = "stage", amount slug = "amount")
- Whether AI narrative is wired (API key dependency noted)
- Any deviations from this plan
</output>

---

## Plan 05-02: Rep Performance Coaching

```
---
phase: 05-analytics-intelligence
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/services/analytics/rep-coaching.ts
  - apps/web/src/app/api/v1/analytics/rep-coaching/route.ts
  - apps/web/src/app/(dashboard)/analytics/rep-coaching/page.tsx
  - apps/web/src/components/analytics/RepCoachingCards.tsx
autonomous: true
requirements:
  - INTL-02
must_haves:
  truths:
    - "Coaching cards name specific reps and specific deviations — not generic advice like 'follow up more'"
    - "Rep cohorts are filtered to same-product or same-stage-range group — SMB AEs not compared to Enterprise AEs"
    - "Manager sees coaching recommendations only for reps in their workspace"
    - "Page shows empty state if fewer than 2 reps have closed deals (no cohort to compare)"
    - "Each coaching card shows the delta: 'Top closers average 4.2 follow-up touches; this rep averages 1.8'"
  artifacts:
    - path: "apps/web/src/services/analytics/rep-coaching.ts"
      provides: "Cohort analysis service — per-rep activity aggregation, top-performer baseline, deviation detection, AI recommendation"
      exports:
        - getRepCoachingRecommendations
        - hasCoachingDataVolume
    - path: "apps/web/src/app/api/v1/analytics/rep-coaching/route.ts"
      provides: "GET endpoint, admin-scoped, returns coaching recommendations per rep"
    - path: "apps/web/src/app/(dashboard)/analytics/rep-coaching/page.tsx"
      provides: "Manager-facing coaching dashboard"
    - path: "apps/web/src/components/analytics/RepCoachingCards.tsx"
      provides: "Per-rep coaching card with delta metrics and AI recommendation text"
  key_links:
    - from: "apps/web/src/services/analytics/rep-coaching.ts"
      to: "workspace_members table (get rep list scoped to workspace)"
      via: "db.select from workspaceMembers where workspaceId = ..."
    - from: "apps/web/src/services/analytics/rep-coaching.ts"
      to: "records table (deals owned by each rep via createdBy or an owner attribute)"
      via: "Drizzle query grouping deal counts by createdBy userId"
    - from: "apps/web/src/services/analytics/rep-coaching.ts"
      to: "notes and tasks tables (activity volume per rep per deal)"
      via: "COUNT of notes.record_id grouped by notes.created_by"
---
```

<objective>
Build a rep performance coaching layer that computes per-rep activity metrics (deal count, notes per deal, tasks per deal, close velocity), identifies top performers as a baseline, then generates specific named-deviation coaching cards comparing each rep's patterns to top performers in the same workspace. Gated behind a minimum-reps check (2+ reps with closed deals).

Purpose: Generic AI coaching is dismissed. This surface names specific reps and specific metrics with actual numbers — "Alex closes 3.1x faster than the workspace median" — giving managers actionable context for 1:1s.

Output: Coaching service, GET API route, manager dashboard page, per-rep coaching card components.
</objective>

<execution_context>
@C:/Users/ClayCampbell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/ClayCampbell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/codebase/ARCHITECTURE.md

<interfaces>
<!-- Key types and patterns the executor needs. -->

From apps/web/src/db/schema/workspace.ts (load and check for workspaceMembers table):
```typescript
// workspaceMembers table includes: workspaceId, userId, role
// Use this to get list of all members in a workspace
```

From apps/web/src/db/schema/notes.ts (check actual column names):
```typescript
// notes table likely includes: id, recordId, workspaceId, content, createdBy, createdAt
// Use createdBy to attribute note activity to a rep
```

From apps/web/src/db/schema/tasks.ts (check actual column names):
```typescript
// tasks table likely includes: id, recordId, workspaceId, title, completed, createdBy, createdAt
```

From apps/web/src/db/schema/records.ts:
```typescript
// records.createdBy = userId who created the deal
// Use this as "deal owner" proxy — Phase 5 assumes no explicit owner attribute yet
// If an "owner" or "assigned_to" attribute exists in record_values, prefer that
```

LLM pattern (same as 05-01 — Tier 2, light model, aggregated stats only):
```typescript
// Pass only aggregated per-rep stats to LLM — never pass names or PII
// Use workspace-anonymized rep IDs in the prompt; substitute real names client-side
// This avoids sending PII (rep names) to a third-party LLM
```

Auth/role pattern (same across all routes):
```typescript
const ctx = await getAuthContext(req);
if (!ctx) return unauthorized();
const adminCheck = requireAdmin(ctx);  // returns 403 Response or null
if (adminCheck) return adminCheck;
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rep coaching query service with cohort analysis</name>
  <files>apps/web/src/services/analytics/rep-coaching.ts</files>
  <action>
Create `apps/web/src/services/analytics/rep-coaching.ts`.

**Exported functions:**

`hasCoachingDataVolume(workspaceId: string): Promise<{ sufficient: boolean; repCount: number; minimumRequired: number }>`
- Query workspace_members for this workspaceId
- Query records (deals) to find distinct `createdBy` values with at least one closed deal (stage = "Closed Won" OR "Closed Lost")
- Return `{ sufficient: repCount >= 2, repCount, minimumRequired: 2 }`

`getRepCoachingRecommendations(workspaceId: string): Promise<RepCoachingReport>`
- If insufficient data, throw "Insufficient data: need 2+ reps with closed deals"
- For each rep in the workspace who has at least one deal (use records.createdBy scoped to the deal object for this workspace):
  - Count total deals (open + closed)
  - Count closed won deals
  - Compute win rate
  - Compute median days-to-close for won deals (createdAt to updatedAt when stage = Closed Won — use updatedAt as proxy if no close_date attribute exists)
  - Count total notes across all their deals (JOIN notes ON notes.recordId = records.id WHERE records.createdBy = repId)
  - Count total tasks across all their deals
  - Compute notes-per-deal and tasks-per-deal ratios
- Define "top performers" as reps in the top quartile by win rate (if <4 reps, use top 1 rep as baseline)
- Compute workspace-wide medians for each metric
- For each non-top-performer rep, compute deviations from top-performer baseline:
  - notes_per_deal delta: top_performer_avg - this_rep_avg
  - tasks_per_deal delta: same
  - days_to_close delta: this_rep_median - top_performer_median (positive = slower)
  - win_rate delta: top_performer_win_rate - this_rep_win_rate
- Identify the top 2 most significant deviations (largest absolute delta) for each rep
- Generate AI coaching recommendation per rep: call OpenRouter with Tier 2 model. Prompt: "Given these anonymized metrics, generate a single-sentence specific coaching tip for this rep. Reference the metric by name and the delta. Be concrete, not generic." Pass only metric names and numbers — no rep names, no workspace name. Return raw text from model.
- Return:
  ```typescript
  interface RepCoachingReport {
    workspaceRepCount: number;
    topPerformerBaseline: {
      avgWinRate: number;
      avgNotesPerDeal: number;
      avgTasksPerDeal: number;
      medianDaysToClose: number;
    };
    reps: Array<{
      userId: string;
      // Note: no names in this object — caller resolves names from workspace members
      closedWonCount: number;
      closedLostCount: number;
      winRate: number;
      medianDaysToClose: number | null;
      notesPerDeal: number;
      tasksPerDeal: number;
      isTopPerformer: boolean;
      deviations: Array<{
        metric: string;     // e.g., "Notes per deal"
        repValue: number;
        baselineValue: number;
        delta: number;      // positive = rep is below baseline
        unit: string;       // "notes", "tasks", "days", "%"
      }>;
      coachingTip: string | null;  // null if no AI key configured
    }>;
    computedAt: Date;
  }
  ```

**Privacy note:** Do not store rep names in the service output. The API route will enrich with names from workspace_members after returning from the service. The LLM call receives only anonymous metrics.
  </action>
  <verify>
    <automated>cd apps/web && pnpm tsc --noEmit</automated>
  </verify>
  <done>Service exports hasCoachingDataVolume and getRepCoachingRecommendations. TypeScript compiles. Data-volume gate enforced. Per-rep metrics computed from notes + tasks + records. Top-performer baseline established. Deviations computed per rep.</done>
</task>

<task type="auto">
  <name>Task 2: Rep coaching API route + manager dashboard + coaching cards</name>
  <files>
    apps/web/src/app/api/v1/analytics/rep-coaching/route.ts,
    apps/web/src/app/(dashboard)/analytics/rep-coaching/page.tsx,
    apps/web/src/components/analytics/RepCoachingCards.tsx
  </files>
  <action>
**Route handler** — `apps/web/src/app/api/v1/analytics/rep-coaching/route.ts`:
- `GET` handler: getAuthContext → unauthorized if null. requireAdmin check. Call `hasCoachingDataVolume(ctx.workspaceId)` — if insufficient, return `success({ insufficient: true, repCount, minimumRequired: 2 })`. Call `getRepCoachingRecommendations(ctx.workspaceId)`. Enrich each rep in `reps[]` with their display name by querying workspace_members and user/auth table for the userId. Return enriched report as `success(enrichedReport)`. On error return `badRequest("Failed to compute coaching report")`.

**Dashboard page** — `apps/web/src/app/(dashboard)/analytics/rep-coaching/page.tsx`:
- Server component. Fetch data from the route (or call service directly). Render `<RepCoachingCards report={report} />`. Add nav link if a sidebar component exists.

**Coaching cards component** — `apps/web/src/components/analytics/RepCoachingCards.tsx`:
- Client component.
- Empty state: if `report.insufficient === true`, show: "Rep coaching requires 2+ reps with closed deals. Current workspace reps with deals: {report.repCount}."
- If data sufficient: render workspace-wide summary row showing top-performer baseline metrics.
- For each rep: render a shadcn/ui Card with:
  - Rep name + win rate as header
  - "Top performer" badge if isTopPerformer
  - Deviation rows: for each deviation in `rep.deviations`, show metric name, the rep's value vs baseline value, and a colored delta indicator (red = below baseline, green = above or on-par). Example: "Notes per deal: You avg 1.8 / Top closers avg 4.2 (-2.4)"
  - AI coaching tip (if not null): rendered in a muted italic text block below deviations. Label it "Coaching suggestion:" Treat top performers' cards differently — show "Top performer — keep it up" instead of deviations.
- Cards sorted: top performers first, then sorted by worst win rate.
- No modals, no confirmation dialogs — read-only display only.
  </action>
  <verify>
    <automated>cd apps/web && pnpm tsc --noEmit</automated>
  </verify>
  <done>GET /api/v1/analytics/rep-coaching returns workspace-scoped coaching report with rep names enriched. Page renders at /analytics/rep-coaching. Empty state for <2 reps. Per-rep cards show specific delta metrics and AI coaching tips. TypeScript compiles clean.</done>
</task>

</tasks>

<verification>
1. TypeScript: `cd apps/web && pnpm tsc --noEmit` passes
2. Lint: `pnpm lint` passes
3. Empty state: workspace with 1 rep → "requires 2+ reps" message, no error
4. Specificity: coaching cards show actual numbers (rep value vs baseline), not generic text
5. Workspace scope: all queries include workspaceId — no cross-tenant leak
6. Admin-only: requireAdmin enforced on route
7. Privacy: rep names not passed to LLM — only anonymous metrics
8. Top performer baseline: at least one rep marked isTopPerformer in any workspace with 2+ reps
</verification>

<success_criteria>
- Rep coaching page at /analytics/rep-coaching, admin-accessible
- Data volume gate: shows "needs 2+ reps" empty state when insufficient
- Each non-top-performer card shows at least 1 specific metric deviation with actual numbers
- AI coaching tip rendered per rep when OpenRouter key configured
- Top performers identified and marked distinctly
- All queries workspace-scoped
- TypeScript and lint clean
</success_criteria>

<output>
After completion, create `.planning/phases/05/05-02-SUMMARY.md` with:
- Files created and functions exported
- Which tables were used for activity measurement (notes, tasks, records.createdBy)
- How top performers are defined (win rate quartile approach)
- Whether rep names are enriched server-side (confirm PII not sent to LLM)
- Any deviations from this plan
</output>

---

## Plan 05-03: Pipeline Forecasting + Next-Best-Action

```
---
phase: 05-analytics-intelligence
plan: 03
type: execute
wave: 2
depends_on:
  - 05-01
files_modified:
  - apps/web/src/services/analytics/forecasting.ts
  - apps/web/src/services/analytics/next-best-action.ts
  - apps/web/src/app/api/v1/analytics/forecast/route.ts
  - apps/web/src/app/api/v1/analytics/next-best-action/route.ts
  - apps/web/src/app/(dashboard)/analytics/forecast/page.tsx
  - apps/web/src/components/analytics/ForecastView.tsx
  - apps/web/src/components/analytics/NextBestActionBadge.tsx
autonomous: true
requirements:
  - INTL-03
  - INTL-04
must_haves:
  truths:
    - "Leadership forecast page shows pipeline value bucketed by stage with an AI confidence score per stage bucket (not just weighted probability)"
    - "Each active deal on the deals list or deal detail page shows a 'Next Best Action' suggestion based on its current stage and recent activity"
    - "NBA suggestions are stage-specific and activity-aware — not identical for all deals in the same stage"
    - "Forecast shows both 'optimistic' (all deals close) and 'AI-weighted' (confidence-adjusted) pipeline values"
    - "Forecast page shows empty state if no closed deals exist (cannot compute historical close rates)"
  artifacts:
    - path: "apps/web/src/services/analytics/forecasting.ts"
      provides: "Pipeline value aggregation, historical close rate by stage, AI confidence score computation"
      exports:
        - getPipelineForecast
    - path: "apps/web/src/services/analytics/next-best-action.ts"
      provides: "Stage-aware, activity-aware NBA suggestion generator"
      exports:
        - getNextBestAction
    - path: "apps/web/src/app/api/v1/analytics/forecast/route.ts"
      provides: "GET endpoint for forecast dashboard"
    - path: "apps/web/src/app/api/v1/analytics/next-best-action/route.ts"
      provides: "GET /api/v1/analytics/next-best-action?recordId= endpoint"
    - path: "apps/web/src/app/(dashboard)/analytics/forecast/page.tsx"
      provides: "Leadership forecast dashboard"
    - path: "apps/web/src/components/analytics/ForecastView.tsx"
      provides: "Stage-bucketed pipeline value + confidence score display"
    - path: "apps/web/src/components/analytics/NextBestActionBadge.tsx"
      provides: "Inline NBA suggestion badge/card embeddable on deal record pages"
  key_links:
    - from: "apps/web/src/services/analytics/forecasting.ts"
      to: "record_values (stage and amount attributes on deals)"
      via: "Drizzle correlated subqueries — same EAV pattern as query-builder.ts"
    - from: "apps/web/src/services/analytics/forecasting.ts"
      to: "05-01 win/loss analysis — historical close rates per stage"
      via: "Import getWinLossPatterns from ../win-loss or re-query directly — do NOT call the API route, call the service directly"
    - from: "apps/web/src/services/analytics/next-best-action.ts"
      to: "notes and tasks tables (recent activity context per deal)"
      via: "SELECT from notes and tasks WHERE recordId = dealId ORDER BY createdAt DESC LIMIT 5"
    - from: "apps/web/src/components/analytics/NextBestActionBadge.tsx"
      to: "/api/v1/analytics/next-best-action?recordId={dealId}"
      via: "Client-side fetch on deal record page — embeddable component"
---
```

<objective>
Build two analytics capabilities that close the intelligence loop: (1) a pipeline forecasting view that shows leadership both naive and AI-confidence-weighted pipeline value by stage, using historical close rates from closed deals to compute stage-level confidence scores; and (2) a next-best-action engine that generates deal-specific action suggestions based on current stage and recent activity patterns, surfaced as an inline badge on each active deal.

Purpose: Forecasting gives leadership a probability-weighted view of pipeline health beyond manual stage weighting. NBA suggestions reduce rep cognitive load by surfacing the single most important action for each deal — stage-specific, not generic.

Output: Forecasting service, NBA service, two API routes, leadership forecast page, embeddable NBA badge component.
</objective>

<execution_context>
@C:/Users/ClayCampbell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/ClayCampbell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/codebase/ARCHITECTURE.md
@.planning/phases/05/05-01-SUMMARY.md

<interfaces>
<!-- Key types and patterns the executor needs. -->

From apps/web/src/services/analytics/win-loss.ts (created in 05-01):
```typescript
// Re-use or import the closed-deal query logic from win-loss.ts
// getWinLossPatterns() returns closedWonCount, closedLostCount, overallWinRate, patterns[]
// For forecasting, you need per-stage close rates:
// Count deals that entered each stage (approximated by deals currently at or past each stage)
// vs deals that eventually closed won — this is a simplification acceptable for v1
```

NBA stage-to-action mapping (codify in next-best-action.ts as a typed const):
```typescript
// Default stage playbook — executor should define as a const map:
const STAGE_PLAYBOOK: Record<string, string[]> = {
  "Discovery":    ["Schedule a discovery call", "Send a discovery questionnaire", "Research the prospect company"],
  "Proposal":     ["Send the proposal document", "Follow up on the proposal", "Schedule a proposal walkthrough call"],
  "Negotiation":  ["Send revised pricing", "Loop in a decision-maker", "Address the top objection in writing"],
  "Closed Won":   ["Trigger customer handoff", "Send a welcome email", "Schedule onboarding call"],
  "Closed Lost":  ["Send a loss survey", "Add to nurture sequence", "Document loss reason"],
};
// If workspace uses custom stage names, fall through to AI-generated suggestion
```

EAV query pattern for reading a deal's current stage:
```typescript
// To get current stage for a deal record:
// 1. Get deal object_id from records.object_id
// 2. Get stage attribute_id from attributes WHERE object_id = deal.objectId AND slug = 'stage'
// 3. Get text_value from record_values WHERE record_id = dealId AND attribute_id = stageAttrId
```

From apps/web/src/lib/api-utils.ts:
```typescript
// success(), unauthorized(), badRequest(), requireAdmin() — same pattern as 05-01/02
// GET route with query param: const url = new URL(req.url); const recordId = url.searchParams.get("recordId")
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Pipeline forecasting service + leadership forecast page</name>
  <files>
    apps/web/src/services/analytics/forecasting.ts,
    apps/web/src/app/api/v1/analytics/forecast/route.ts,
    apps/web/src/app/(dashboard)/analytics/forecast/page.tsx,
    apps/web/src/components/analytics/ForecastView.tsx
  </files>
  <action>
**Forecasting service** — `apps/web/src/services/analytics/forecasting.ts`:

`getPipelineForecast(workspaceId: string): Promise<PipelineForecast>`
- If zero closed deals exist (query record_values for stage IN ['Closed Won', 'Closed Lost']), return `{ insufficient: true }` — no historical data to compute confidence.
- Load all active (non-closed) deals with their stage and amount values using EAV correlated subqueries scoped to workspaceId.
- Load all closed deals (won + lost) grouped by stage to compute historical close rate per stage. Simplification: for each stage, compute `closedWon / (closedWon + closedLost)` for deals that have EVER been at that stage (approximate by querying closed deals and using their last stage before closing as a proxy — or simply compute overall win rate per stage bucket as: deals at stage X that became Closed Won / total deals that passed through stage X). For v1, a simpler approach is acceptable: use overall workspace win rate from 05-01's data as the confidence multiplier, and apply a stage-position multiplier (e.g., later stages multiply confidence up).
- Compute per-stage summary:
  - Stage name
  - Deal count
  - Total pipeline value (sum of amount attribute)
  - Historical close rate for this stage (or overall win rate if per-stage data is thin)
  - AI confidence score (0.0–1.0): call OpenRouter Tier 2 with the stage's deal count, average days-in-stage, and historical close rate. Ask model: "Given these pipeline metrics for the {stage} stage, provide a confidence score between 0.0 and 1.0 representing likelihood of these deals closing this quarter. Return only a JSON object: {confidence: number, reasoning: string}. Use Vercel AI SDK `generateObject()` pattern if available, otherwise parse JSON from completion." If AI unavailable, use historical_close_rate directly as confidence.
  - AI-weighted value: total_pipeline_value * ai_confidence_score
- Return:
  ```typescript
  interface PipelineForecast {
    insufficient?: boolean;
    stages: Array<{
      stageName: string;
      dealCount: number;
      totalValue: number;       // naive sum
      historicalCloseRate: number;
      aiConfidenceScore: number;
      aiConfidenceReasoning: string | null;
      aiWeightedValue: number;  // totalValue * aiConfidenceScore
    }>;
    totalPipelineValue: number;       // sum of all active deal amounts
    totalAiWeightedValue: number;     // sum of all aiWeightedValue
    computedAt: Date;
  }
  ```

**API route** — `apps/web/src/app/api/v1/analytics/forecast/route.ts`:
- GET handler with getAuthContext → unauthorized if null. requireAdmin check. Call getPipelineForecast(ctx.workspaceId). Return success(forecast).

**Dashboard page** — `apps/web/src/app/(dashboard)/analytics/forecast/page.tsx`:
- Server component. Fetch and render `<ForecastView forecast={forecast} />`.

**ForecastView component** — `apps/web/src/components/analytics/ForecastView.tsx`:
- Empty state: if `forecast.insufficient === true`, show: "Pipeline forecasting requires at least one closed deal to establish historical close rates."
- Summary bar: "Total pipeline: $X | AI-weighted forecast: $Y" — Y is always ≤ X, difference represents at-risk value.
- Stage table (shadcn/ui Table): columns — Stage | Deals | Pipeline Value | Historical Close Rate | AI Confidence | AI-Weighted Value. Confidence column styled with color gradient (red <30%, yellow 30-60%, green >60%).
- No charts required — table is sufficient and avoids charting library dependencies.
  </action>
  <verify>
    <automated>cd apps/web && pnpm tsc --noEmit</automated>
  </verify>
  <done>GET /api/v1/analytics/forecast returns forecast JSON with per-stage AI confidence scores. Forecast page renders at /analytics/forecast. Empty state when no closed deals. AI-weighted value displayed alongside naive pipeline value. TypeScript compiles.</done>
</task>

<task type="auto">
  <name>Task 2: Next-best-action service + badge component + integration on deal list</name>
  <files>
    apps/web/src/services/analytics/next-best-action.ts,
    apps/web/src/app/api/v1/analytics/next-best-action/route.ts,
    apps/web/src/components/analytics/NextBestActionBadge.tsx
  </files>
  <action>
**NBA service** — `apps/web/src/services/analytics/next-best-action.ts`:

`getNextBestAction(workspaceId: string, recordId: string): Promise<NextBestAction>`
- Validate record belongs to workspace (query records JOIN objects WHERE records.id = recordId AND objects.workspace_id = workspaceId). Return error if not found or workspace mismatch.
- Load the deal's current stage value from record_values.
- Load recent activity:
  - Last 5 notes for this record (SELECT from notes WHERE recordId = recordId ORDER BY createdAt DESC LIMIT 5 — load content snippets only, not full bodies)
  - Last 5 tasks for this record (SELECT from tasks WHERE recordId = recordId ORDER BY createdAt DESC LIMIT 5 — load title and completed status)
  - Days since last note/task activity (compute from max(notes.createdAt, tasks.createdAt))
- Look up STAGE_PLAYBOOK (const in this file) for the current stage name. If a match exists, use the playbook as the candidate suggestion list.
- Call OpenRouter Tier 2 model: "Given a deal currently in the '{stage}' stage with these recent activities: {last 5 note snippets + task titles}, suggest the single most important next action. Choose from these candidates if applicable: {playbook candidates}. Return only a JSON object: {action: string, reason: string, urgency: 'high'|'medium'|'low'}." If no AI key configured, return the first playbook suggestion as action with urgency "medium" and no reason.
- Return:
  ```typescript
  interface NextBestAction {
    recordId: string;
    stage: string;
    action: string;       // e.g., "Schedule a discovery call"
    reason: string | null; // e.g., "No activity in 5 days and still in Discovery"
    urgency: "high" | "medium" | "low";
    computedAt: Date;
  }
  ```
- **Caching note:** NBA is called per-deal and can be expensive at scale. Add a simple in-memory cache per process with a 5-minute TTL keyed on `${workspaceId}:${recordId}`. This is a v1 optimization — no Redis needed.

**API route** — `apps/web/src/app/api/v1/analytics/next-best-action/route.ts`:
- GET handler: getAuthContext → unauthorized if null (no admin requirement — all workspace members can see NBA). Extract `recordId` from `?recordId=` query param. Validate it's a non-empty string. Call getNextBestAction(ctx.workspaceId, recordId). Return success(nba) or badRequest if recordId missing.

**NBA Badge component** — `apps/web/src/components/analytics/NextBestActionBadge.tsx`:
- Client component (`"use client"`). Accepts `recordId: string` as prop.
- On mount, fetch `/api/v1/analytics/next-best-action?recordId={recordId}`.
- Loading state: render a subtle skeleton (muted text "Thinking...").
- When loaded: render a small card or badge (shadcn/ui Badge or Card) showing:
  - Urgency indicator: red dot for "high", yellow for "medium", grey for "low"
  - Action text (bold, short)
  - Reason text (muted, smaller, optional — show if present)
  - Label "Next best action" above the action text
- If fetch fails or returns error: render nothing (do not show error to user — NBA is ambient, not critical).
- This component is designed to be dropped into any deal record page. Executor should add it to the deal record detail page if one exists (check `apps/web/src/app/(dashboard)/` for a deal record detail page pattern and add `<NextBestActionBadge recordId={record.id} />` to the sidebar or action area if appropriate). Do not add it to the list view — only the detail page.
  </action>
  <verify>
    <automated>cd apps/web && pnpm tsc --noEmit</automated>
  </verify>
  <done>GET /api/v1/analytics/next-best-action?recordId=... returns stage-aware, activity-aware NBA suggestion. NextBestActionBadge renders on deal detail page with urgency indicator and action text. Badge silently fails if API errors. TypeScript compiles clean.</done>
</task>

</tasks>

<verification>
1. TypeScript: `cd apps/web && pnpm tsc --noEmit` passes
2. Lint: `pnpm lint` passes
3. Forecast empty state: workspace with 0 closed deals → "requires at least one closed deal" message
4. NBA workspace scope: getNextBestAction validates recordId belongs to workspaceId — no cross-tenant access
5. NBA specificity: deal in "Discovery" with no activity → suggestion differs from deal in "Negotiation" with recent notes
6. Forecast AI-weighted value: always ≤ total pipeline value (confidence scores are 0.0–1.0)
7. NBA badge: renders on deal detail page, fails silently if fetch errors
8. No EAV misuse: all analytics are read-only queries — no data written to record_values
</verification>

<success_criteria>
- Forecast page at /analytics/forecast shows pipeline value + AI confidence scores per stage
- NBA badge appears on deal detail pages with urgency indicator and action suggestion
- Both forecast and NBA degrade gracefully when no AI key configured (use rule-based fallbacks)
- Forecast empty state correct for workspaces with no closed deal history
- NBA suggestions vary by stage and recent activity (not identical across all deals)
- All queries workspace-scoped
- TypeScript and lint clean
</success_criteria>

<output>
After completion, create `.planning/phases/05/05-03-SUMMARY.md` with:
- Files created and functions exported
- How historical close rates are computed (per-stage or overall win rate used as proxy)
- How NBA stage playbook is structured and which stages are covered
- Whether AI confidence scores are wired (or rule-based fallback used)
- Where NextBestActionBadge was embedded (which deal detail page file)
- Any deviations from this plan
</output>
