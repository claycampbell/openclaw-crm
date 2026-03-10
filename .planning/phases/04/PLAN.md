# Phase 4: Close Flow + Dashboards — Execution Plan

**Phase:** 04
**Goal:** Reps and managers have role-appropriate dashboard views of their pipeline, high-stakes actions route through configurable approval workflows, contracts and SOWs are generated from deal data, and closed-won deals trigger an automated customer handoff brief
**Requirements:** DASH-01, DASH-02, DASH-03, APRV-01, APRV-02, APRV-03, APRV-04, CNTR-01, CNTR-02, CNTR-03, CNTR-04, CLOS-01, CLOS-02
**Plans:** 04-01, 04-02, 04-03, 04-04

---

## Wave Structure

```
Wave 1 (parallel):
  04-01 — Role-based dashboards        [autonomous]
  04-02 — Approval workflow engine     [autonomous]

Wave 2 (depends on 04-02):
  04-03 — Contract/SOW generation      [autonomous]

Wave 3 (depends on 04-02, 04-03):
  04-04 — Close flow + handoff brief   [autonomous]
```

**Parallelization rationale:**
- 04-01 (dashboards) is read-only — queries existing EAV data, creates no new schema dependencies. Fully independent.
- 04-02 (approval engine) creates the `approval_requests` table and service that 04-03 and 04-04 both depend on.
- 04-03 (contract gen) needs the approval service to route contracts. Must follow 04-02.
- 04-04 (close flow) needs both approval routing (04-02) and contract generation (04-03) to be in place before the closed-won trigger can orchestrate the full handoff.

---

## Dependency Graph

```
04-01 (dashboards) ─────────────────────────────────────────────────> done
04-02 (approvals)  ─────────────────────────┐
                                            ├──> 04-03 (contracts) ──┐
                                            │                        ├──> 04-04 (close flow)
                                            └────────────────────────┘
```

**File ownership (no conflicts):**

| Plan  | Files Modified (exclusive ownership)                                                          |
|-------|-----------------------------------------------------------------------------------------------|
| 04-01 | `db/schema/dashboard.ts`, `services/dashboards.ts`, `app/(dashboard)/pipeline/page.tsx`, `app/(dashboard)/pipeline/manager/page.tsx`, `app/(dashboard)/pipeline/forecast/page.tsx`, `app/api/v1/dashboards/route.ts`, `components/dashboard/` |
| 04-02 | `db/schema/approvals.ts`, `services/approvals.ts`, `app/api/v1/approvals/route.ts`, `app/api/v1/approvals/[id]/route.ts`, `app/(dashboard)/settings/approvals/page.tsx`, `components/approvals/` |
| 04-03 | `services/documents/contract.ts`, `app/api/v1/contracts/route.ts`, `app/api/v1/contracts/[id]/route.ts`, `components/contracts/` |
| 04-04 | `services/documents/handoff.ts`, `app/api/v1/close-flow/route.ts`, `services/crm-events.ts` (extend existing) |

---

## Must-Haves (Goal-Backward)

### Step 1: Goal

Reps and managers have role-appropriate dashboard views of their pipeline, high-stakes actions route through configurable approval workflows, contracts and SOWs are generated from deal data, and closed-won deals trigger an automated customer handoff brief.

### Step 2: Observable Truths

1. Rep can open `/pipeline` and see their own deals, open tasks, and pending approvals in one view
2. Manager can open `/pipeline/manager` and see the team's deals with aggregate metrics (count, total value, avg days in stage) per rep
3. Leadership can open `/pipeline/forecast` and see weighted pipeline value by stage and probability
4. Workspace admin can create an approval rule (e.g., "deal value > $50,000 routes to admin") and a matching deal triggers an approval request with notification
5. Approver can open the approval inbox, see pending items, and approve or reject with a note — the approval is recorded with timestamp and identity
6. A contract PDF is generated from deal data with the click of a button, routes through the approval workflow, and is downloadable only after approval
7. Workspace admin can edit contract templates with a clause library per workspace
8. When a deal is marked closed-won, a handoff brief is auto-generated and can be exported as PDF or sent to an external CS tool via webhook

### Step 3: Required Artifacts

| Artifact | Purpose |
|----------|---------|
| `db/schema/approvals.ts` | `approval_rules` and `approval_requests` tables |
| `services/approvals.ts` | Rule evaluation, request creation, approve/reject actions |
| `services/documents/contract.ts` | Contract context assembly + `@react-pdf/renderer` PDF output |
| `services/documents/handoff.ts` | Handoff brief assembly + PDF output + webhook delivery |
| `services/dashboards.ts` | Pipeline aggregation queries for rep / manager / forecast views |
| `app/(dashboard)/pipeline/page.tsx` | Rep pipeline dashboard page |
| `app/(dashboard)/pipeline/manager/page.tsx` | Manager team pipeline page |
| `app/(dashboard)/pipeline/forecast/page.tsx` | Leadership forecast page |
| `app/(dashboard)/settings/approvals/page.tsx` | Approval rule configuration UI |
| `components/approvals/approval-inbox.tsx` | Approver inbox + approve/reject UI |
| `components/contracts/contract-generator.tsx` | Generate and download contract UI |
| `components/dashboard/pipeline-table.tsx` | Shared deal table used across all three dashboard views |
| `app/api/v1/dashboards/route.ts` | Pipeline data API endpoint |
| `app/api/v1/approvals/route.ts` | Approval rules CRUD + request listing |
| `app/api/v1/approvals/[id]/route.ts` | Approve / reject individual requests |
| `app/api/v1/contracts/route.ts` | Trigger contract generation |
| `app/api/v1/contracts/[id]/route.ts` | Fetch / download generated contract |
| `app/api/v1/close-flow/route.ts` | Manual close-won trigger + handoff brief delivery |

### Step 4: Required Wiring

- `pipeline/page.tsx` → `GET /api/v1/dashboards?view=rep` → `services/dashboards.ts listRepPipeline(userId)`
- `pipeline/manager/page.tsx` → `GET /api/v1/dashboards?view=manager` → `services/dashboards.ts listManagerPipeline()`
- `pipeline/forecast/page.tsx` → `GET /api/v1/dashboards?view=forecast` → `services/dashboards.ts listForecast()`
- `POST /api/v1/contracts` → `services/documents/contract.ts generateContract(dealId)` → `@react-pdf/renderer` → S3 or local file → insert `generated_assets` row → trigger `services/approvals.ts createRequest()`
- `PATCH /api/v1/approvals/[id]` with `{action: "approve" | "reject", note}` → `services/approvals.ts resolveRequest()` → update `approval_requests` row
- `services/crm-events.ts` stage-change handler → detect closed-won → call `services/documents/handoff.ts generateHandoffBrief(dealId)` → if webhook configured, POST to webhook URL

### Step 5: Key Links

| From | To | Via | Pattern |
|------|----|-----|---------|
| Contract generator UI | `approval_requests` row | `POST /api/v1/contracts` → `createRequest()` | Contract blocked for download until `approved` |
| Stage change handler | Handoff brief generation | `crm-events.ts` closed-won detection | `await generateHandoffBrief(dealId)` in event handler |
| Approval rule evaluator | `approval_requests` insert | `services/approvals.ts evaluateRules()` | Matches deal attribute values against rule conditions |
| Handoff webhook | External CS tool | `fetch(webhookUrl, {method: "POST"})` | Workspace setting `handoff_webhook_url` |

---

## Plan 04-01: Role-Based Dashboards

```yaml
phase: 04
plan: "04-01"
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/db/schema/dashboard.ts
  - apps/web/src/services/dashboards.ts
  - apps/web/src/app/api/v1/dashboards/route.ts
  - apps/web/src/app/(dashboard)/pipeline/page.tsx
  - apps/web/src/app/(dashboard)/pipeline/manager/page.tsx
  - apps/web/src/app/(dashboard)/pipeline/forecast/page.tsx
  - apps/web/src/components/dashboard/pipeline-table.tsx
  - apps/web/src/components/dashboard/deal-card.tsx
  - apps/web/src/components/dashboard/metric-card.tsx
autonomous: true
requirements:
  - DASH-01
  - DASH-02
  - DASH-03
must_haves:
  truths:
    - "Rep opens /pipeline and sees their own deals sorted by stage, with open task count and pending AI drafts visible"
    - "Manager opens /pipeline/manager and sees each rep's deal count, total value, and win rate in a table with drill-down"
    - "Leadership opens /pipeline/forecast and sees pipeline value weighted by deal probability grouped by stage"
    - "Each dashboard view respects workspace role — reps cannot access manager or forecast views"
  artifacts:
    - path: "apps/web/src/services/dashboards.ts"
      provides: "listRepPipeline(), listManagerPipeline(), listForecast() service functions"
      exports: ["listRepPipeline", "listManagerPipeline", "listForecast"]
    - path: "apps/web/src/app/api/v1/dashboards/route.ts"
      provides: "GET /api/v1/dashboards?view=rep|manager|forecast"
    - path: "apps/web/src/app/(dashboard)/pipeline/page.tsx"
      provides: "Rep pipeline dashboard"
    - path: "apps/web/src/app/(dashboard)/pipeline/manager/page.tsx"
      provides: "Manager team dashboard"
    - path: "apps/web/src/app/(dashboard)/pipeline/forecast/page.tsx"
      provides: "Leadership forecast dashboard"
  key_links:
    - from: "apps/web/src/app/(dashboard)/pipeline/page.tsx"
      to: "services/dashboards.ts listRepPipeline()"
      via: "GET /api/v1/dashboards?view=rep"
    - from: "apps/web/src/app/(dashboard)/pipeline/manager/page.tsx"
      to: "services/dashboards.ts listManagerPipeline()"
      via: "GET /api/v1/dashboards?view=manager — requires admin or manager role"
    - from: "apps/web/src/app/(dashboard)/pipeline/forecast/page.tsx"
      to: "services/dashboards.ts listForecast()"
      via: "GET /api/v1/dashboards?view=forecast — requires admin role"
```

### Objective

Build three role-gated pipeline dashboard views using existing EAV query infrastructure and TanStack Table. No new schema required — dashboards are read-only aggregations over `records`, `record_values`, and `workspace_members`.

Purpose: Managers and leadership will not adopt a CRM without pipeline visibility. This is the table stakes feature that unlocks org-wide adoption.

Output: Three navigable dashboard pages at `/pipeline`, `/pipeline/manager`, `/pipeline/forecast` with role enforcement at the API layer.

### Context

```
@apps/web/src/services/records.ts
@apps/web/src/services/workspace.ts
@apps/web/src/lib/api-utils.ts
@apps/web/src/db/schema/records.ts
@apps/web/src/db/schema/objects.ts
@apps/web/src/db/schema/workspace.ts
```

#### Existing interfaces the executor needs

```typescript
// From apps/web/src/lib/api-utils.ts
export type AuthContext = {
  userId: string;
  workspaceId: string;
  workspaceRole: "admin" | "member";
  authMethod?: "cookie" | "api_key";
};
export function getAuthContext(req: Request): Promise<AuthContext | null>;
export function success(data: unknown, status?: number): Response;
export function unauthorized(): Response;
export function forbidden(): Response;
export function badRequest(msg: string): Response;
export function requireAdmin(ctx: AuthContext): Response | null;  // returns 403 if not admin

// From apps/web/src/services/records.ts (key exports)
// Records are stored in EAV. Deals object has slug "deals".
// record_values rows: one per attribute, typed column based on ATTRIBUTE_TYPE_COLUMN_MAP.
// Stage is typically a "status" or "select" attribute on the deals object.

// From apps/web/src/db/schema/workspace.ts
export const workspaceMembers  // columns: id, workspaceId, userId, role, createdAt
export const workspaces        // columns: id, name, slug, settings, createdAt, updatedAt
```

### Tasks

#### Task 1: Dashboard service — pipeline aggregation queries

**Files:**
- `apps/web/src/services/dashboards.ts`
- `apps/web/src/app/api/v1/dashboards/route.ts`

**Action:**

Create `apps/web/src/services/dashboards.ts` with three exported async functions. All queries use Drizzle ORM and are scoped to `workspaceId`.

**`listRepPipeline(workspaceId: string, userId: string)`:**
Query deals object records where `createdBy = userId` (or where an `owner` attribute references the userId). Return array of `RepDeal`:
```typescript
interface RepDeal {
  id: string;
  displayName: string;        // first text_value from display-name logic
  stage: string;              // status/select attribute slug
  value: number | null;       // currency attribute number_value
  closingDate: string | null; // date attribute
  daysInStage: number;        // days since last stage change (use updatedAt as proxy if no stage history)
  openTaskCount: number;      // COUNT from tasks table WHERE record_id = deal.id AND is_completed = false
}
```

Implement as a single SQL query with LEFT JOINs to `record_values` for stage, value, and closingDate attributes. Task count via subquery. Scope by `workspaceId` via the `objects` join.

**`listManagerPipeline(workspaceId: string)`:**
Aggregate deals grouped by rep (created_by / owner). Return array of `RepSummary`:
```typescript
interface RepSummary {
  userId: string;
  userName: string;           // from auth.users name
  dealCount: number;
  totalValue: number;
  avgDaysOpen: number;
  wonCount: number;           // deals with stage = "closed_won" (or similar)
  deals: RepDeal[];           // same structure as above
}
```

Use a window function or GROUP BY over the same joins. Join `auth.users` on `records.createdBy` to get rep name.

**`listForecast(workspaceId: string)`:**
Group deals by stage, compute weighted pipeline value. Return array of `ForecastBand`:
```typescript
interface ForecastBand {
  stage: string;
  dealCount: number;
  totalValue: number;
  weightedValue: number;     // totalValue * probability (hardcoded per stage: Prospecting=10%, Discovery=20%, Proposal=40%, Negotiation=70%, Closed Won=100%)
  probability: number;       // 0-100
}
```

Stage probability weights are hardcoded in the service (not workspace-configurable in Phase 4; Phase 5 adds AI-derived weights).

Create `apps/web/src/app/api/v1/dashboards/route.ts` as a `GET` handler:
1. Call `getAuthContext(req)` → `unauthorized()` if null
2. Parse `?view=rep|manager|forecast` from URL search params
3. Enforce role: `manager` view → requires admin; `forecast` view → requires admin. Rep view available to all.
4. Call appropriate service function
5. Return `success(data)`

**Verify:** `curl -H "Cookie: ..." "http://localhost:3001/api/v1/dashboards?view=rep"` returns `{data: [{id, displayName, stage, value, ...}]}` with 200.

**Done:** All three service functions return typed data without runtime errors; API route enforces role correctly (member gets 403 on manager view).

---

#### Task 2: Dashboard pages — three role-gated views

**Files:**
- `apps/web/src/app/(dashboard)/pipeline/page.tsx`
- `apps/web/src/app/(dashboard)/pipeline/manager/page.tsx`
- `apps/web/src/app/(dashboard)/pipeline/forecast/page.tsx`
- `apps/web/src/components/dashboard/pipeline-table.tsx`
- `apps/web/src/components/dashboard/metric-card.tsx`

**Action:**

Create `components/dashboard/metric-card.tsx` — a simple shadcn/ui `Card` that accepts `{label: string, value: string | number, subtext?: string, icon?: ReactNode}`. Used across all three views for "Total Value", "Deal Count", "Win Rate" headline numbers.

Create `components/dashboard/pipeline-table.tsx` — a client component using TanStack Table v8 (already in stack). Columns: Deal Name (link to `/objects/deals/[id]`), Stage (badge), Value (currency formatted), Closing Date, Days in Stage. Accepts `deals: RepDeal[]` prop. No server-side sorting needed — client-side sorting on all columns via TanStack.

**`pipeline/page.tsx` (Rep view):**
- Server component; reads session to get userId from cookies
- Fetches `GET /api/v1/dashboards?view=rep` on the server
- Renders: greeting header, 3 metric cards (Open Deals, Total Value, Overdue Tasks), `<PipelineTable>` with rep's deals
- Includes: link to `/chat` with "Ask AI about your pipeline" CTA

**`pipeline/manager/page.tsx` (Manager view):**
- Server component; calls `requireAdmin` check — redirect to `/pipeline` if not admin
- Fetches `GET /api/v1/dashboards?view=manager` on the server
- Renders: team metric cards (Total Pipeline, Deals by Rep), expandable rep rows showing each rep's deal table. Use shadcn/ui `Collapsible` for rep rows.
- Show: Total team pipeline value, count of deals by stage (horizontal bar or simple text counts).

**`pipeline/forecast/page.tsx` (Leadership forecast view):**
- Server component; calls `requireAdmin` check — redirect if not admin
- Fetches `GET /api/v1/dashboards?view=forecast` on the server
- Renders: weighted pipeline by stage table (Stage | Deals | Total Value | Probability | Weighted Value), total weighted pipeline as headline card
- Include explanatory note: "Weighted value = total value × stage probability. Probabilities are defaults; AI-derived weights arrive in Phase 5."

Navigation: Add "Pipeline" link to the sidebar nav (existing `components/layout/sidebar` pattern). Add role-conditional rendering: show "Team View" sub-link only if user is admin.

**Verify:** Visit `http://localhost:3001/pipeline` — sees own deals. Visit `http://localhost:3001/pipeline/manager` as admin — sees team table. Visit as member — redirects to `/pipeline`.

**Done:** All three routes render without error; data is scoped to workspace; role enforcement works; sidebar link navigates correctly.

---

### Verification

```
pnpm lint  — passes with no errors
pnpm build — builds without TypeScript errors
Manual: visit /pipeline, /pipeline/manager, /pipeline/forecast as rep and admin
```

### Success Criteria

- Rep dashboard shows their deals with correct stage/value/task counts
- Manager dashboard shows per-rep aggregates; non-admin users cannot access it
- Forecast dashboard shows weighted pipeline by stage with probability weights
- All three views are accessible via sidebar navigation

### Output

After completion, create `.planning/phases/04/04-01-SUMMARY.md` with:
- What was built (exact file paths)
- Key technical decisions (query approach, TanStack Table config)
- Any deviations from this plan

---

## Plan 04-02: Approval Workflow Engine

```yaml
phase: 04
plan: "04-02"
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/db/schema/approvals.ts
  - apps/web/src/services/approvals.ts
  - apps/web/src/app/api/v1/approvals/route.ts
  - apps/web/src/app/api/v1/approvals/[id]/route.ts
  - apps/web/src/app/(dashboard)/settings/approvals/page.tsx
  - apps/web/src/app/(dashboard)/approvals/page.tsx
  - apps/web/src/components/approvals/approval-inbox.tsx
  - apps/web/src/components/approvals/rule-editor.tsx
autonomous: true
requirements:
  - APRV-01
  - APRV-02
  - APRV-03
  - APRV-04
must_haves:
  truths:
    - "Workspace admin can create an approval rule specifying: trigger object (deals), attribute slug, operator (greater_than), threshold value, and approver (admin role or specific user)"
    - "When a deal matching a rule is updated, an approval_request row is created and the approver sees it in their inbox within the same request cycle"
    - "Approver can approve or reject with a note; the request is marked with timestamp and approver identity"
    - "Approval history is readable: each request shows created_at, resolved_at, requested_by, approved_by, action, note"
    - "Admin can view, edit, and delete approval rules from /settings/approvals"
  artifacts:
    - path: "apps/web/src/db/schema/approvals.ts"
      provides: "approval_rules and approval_requests tables"
      contains: "pgTable approval_rules, pgTable approval_requests"
    - path: "apps/web/src/services/approvals.ts"
      provides: "evaluateRules(), createRequest(), resolveRequest(), listPendingForUser()"
      exports: ["evaluateRules", "createRequest", "resolveRequest", "listPendingForUser", "listRules", "createRule", "deleteRule"]
    - path: "apps/web/src/app/(dashboard)/approvals/page.tsx"
      provides: "Approval inbox UI for approvers"
    - path: "apps/web/src/app/(dashboard)/settings/approvals/page.tsx"
      provides: "Approval rule configuration for admins"
  key_links:
    - from: "apps/web/src/services/approvals.ts evaluateRules()"
      to: "approval_requests table"
      via: "Called after record update in crm-events.ts or directly from API routes"
      pattern: "evaluateRules(workspaceId, recordId, changedAttributes)"
    - from: "apps/web/src/components/approvals/approval-inbox.tsx"
      to: "PATCH /api/v1/approvals/[id]"
      via: "fetch with {action: 'approve' | 'reject', note: string}"
```

### Objective

Build a configurable approval workflow engine: workspace admins define rules, matching records trigger approval requests, approvers action them via an inbox UI. No external workflow engine — pure PostgreSQL state machine with 4 states: `pending`, `approved`, `rejected`, `expired`.

Purpose: Enterprise deals stall without discount/contract approval routing. This unblocks Plan 04-03 (contracts must route through approval before delivery).

Output: `approval_rules` and `approval_requests` tables, full CRUD API, approver inbox page at `/approvals`, admin config page at `/settings/approvals`.

### Context

```
@apps/web/src/db/schema/records.ts
@apps/web/src/db/schema/objects.ts
@apps/web/src/db/schema/workspace.ts
@apps/web/src/lib/api-utils.ts
@apps/web/src/services/notifications.ts
@apps/web/src/services/crm-events.ts
```

#### Existing interfaces

```typescript
// From apps/web/src/services/notifications.ts
export async function createNotification(
  workspaceId: string,
  userId: string,
  title: string,
  body: string,
  linkUrl?: string
): Promise<void>

// From apps/web/src/db/schema/workspace.ts
// workspaceMembers.role = "admin" | "member"
// All admin-role members are valid approvers when rule target = "admin"

// From apps/web/src/services/crm-events.ts
// This service is called after record mutations. Extend it in 04-04,
// not here. In 04-02, evaluateRules() is called from API routes directly.
```

### Tasks

#### Task 1: Schema + service — approval state machine

**Files:**
- `apps/web/src/db/schema/approvals.ts`
- `apps/web/src/services/approvals.ts`

**Action:**

Create `apps/web/src/db/schema/approvals.ts`:

```typescript
// approval_rules — workspace-admin-configured rules
export const approvalRules = pgTable("approval_rules", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),               // "Large deal discount"
  objectSlug: text("object_slug").notNull(),   // "deals"
  attributeSlug: text("attribute_slug").notNull(), // "discount_percent"
  operator: text("operator").notNull(),        // "greater_than" | "equals" | "contains"
  threshold: text("threshold").notNull(),      // stored as text, parsed at eval time: "20"
  approverTarget: text("approver_target").notNull(), // "admin_role" | specific userId
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
});

// approval_requests — per-record approval instances
export const approvalRequests = pgTable("approval_requests", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  ruleId: text("rule_id").references(() => approvalRules.id, { onDelete: "set null" }),
  recordId: text("record_id").notNull().references(() => records.id, { onDelete: "cascade" }),
  requestedBy: text("requested_by").references(() => users.id, { onDelete: "set null" }),
  approvedBy: text("approved_by").references(() => users.id, { onDelete: "set null" }),
  status: text("status").notNull().default("pending"), // "pending" | "approved" | "rejected" | "expired"
  action: text("action"),                    // "approved" | "rejected" (set on resolution)
  note: text("note"),                        // approver's note on resolution
  requestType: text("request_type").notNull().default("rule"), // "rule" | "contract" | "manual"
  contextLabel: text("context_label"),       // Human label: "Deal value > $50k" or "Contract for Acme Corp"
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  dueAt: timestamp("due_at"),               // optional SLA deadline
});
```

Export both tables from `db/schema/index.ts`.

Run `pnpm db:push` to apply schema.

Create `apps/web/src/services/approvals.ts` with:

**`evaluateRules(workspaceId, recordId, changedValues: Record<string, unknown>)`:**
- Load all active `approval_rules` for `workspaceId` where `objectSlug` matches the record's object
- For each rule, check if `changedValues[rule.attributeSlug]` satisfies the rule condition:
  - `greater_than`: `Number(changedValues[slug]) > Number(rule.threshold)`
  - `equals`: `String(changedValues[slug]) === rule.threshold`
  - `contains`: `String(changedValues[slug]).includes(rule.threshold)`
- For matching rules where no `pending` request already exists for this `(recordId, ruleId)`: insert `approval_requests` row with `status: "pending"`
- Notify approvers: if `approverTarget = "admin_role"`, call `createNotification()` for each workspace admin. If specific userId, notify that user.
- Returns count of requests created

**`createRequest(workspaceId, recordId, requestType, contextLabel, requestedBy, approverTarget)`:**
- Creates a single approval request not tied to a rule (for contract generation in 04-03)
- Same notification behavior
- Returns the created `approvalRequests` row

**`resolveRequest(requestId, action: "approve" | "reject", note: string, resolvedBy: string)`:**
- Updates `approval_requests` with `status = action`, `action`, `note`, `resolvedAt = now()`, `approvedBy = resolvedBy`
- Returns updated row
- Throws if request not found or already resolved

**`listPendingForUser(workspaceId, userId, userRole)`:**
- If `userRole = "admin"`: return all `pending` requests for workspace
- Else: return pending requests where `approverTarget = userId`
- Join with `records` to get display context

**`listRules(workspaceId)`** — returns all rules for workspace

**`createRule(workspaceId, data, createdBy)`** — inserts rule, returns row

**`deleteRule(ruleId, workspaceId)`** — deletes rule (check workspaceId for scoping)

**Verify:** `pnpm db:push` succeeds; tables `approval_rules` and `approval_requests` exist in PostgreSQL.

**Done:** Schema applied; all service functions exported without TypeScript errors.

---

#### Task 2: API routes + approval inbox UI

**Files:**
- `apps/web/src/app/api/v1/approvals/route.ts`
- `apps/web/src/app/api/v1/approvals/[id]/route.ts`
- `apps/web/src/app/(dashboard)/approvals/page.tsx`
- `apps/web/src/app/(dashboard)/settings/approvals/page.tsx`
- `apps/web/src/components/approvals/approval-inbox.tsx`
- `apps/web/src/components/approvals/rule-editor.tsx`

**Action:**

**`app/api/v1/approvals/route.ts`:**
- `GET`: `getAuthContext` → `listPendingForUser(workspaceId, userId, role)` → `success(requests)`
- `POST` (rules): `requireAdmin` → parse `{name, objectSlug, attributeSlug, operator, threshold, approverTarget}` → `createRule()` → `success(rule, 201)`

**`app/api/v1/approvals/[id]/route.ts`:**
- `PATCH`: `getAuthContext` → parse `{action: "approve" | "reject", note}` → validate action is one of the two values → `resolveRequest(id, action, note, userId)` → `success(updated)`
- `DELETE` (for rules): `requireAdmin` → `deleteRule(id, workspaceId)` → `success({deleted: true})`

**`components/approvals/approval-inbox.tsx`** — Client component:
- Fetches `GET /api/v1/approvals` on mount
- Renders list of pending approval requests. Each item shows: Context Label, Record link, Requested By, Requested At, rule name if available
- Each item has "Approve" and "Reject" buttons. Clicking opens a shadcn/ui `Dialog` with a `Textarea` for note (optional for approve, required for reject)
- On confirm: `PATCH /api/v1/approvals/[id]` with action + note → refresh list on success
- Show empty state: "No pending approvals" with checkmark icon

**`components/approvals/rule-editor.tsx`** — Client component form:
- Fields: Name (text), Object (hardcoded "deals" for now — single select), Attribute Slug (text input with helper text), Operator (select: Greater Than, Equals, Contains), Threshold (text), Approver Target (select: "All Admins" = "admin_role", or future user picker)
- On submit: `POST /api/v1/approvals` → refresh list

**`app/(dashboard)/approvals/page.tsx`** — Server page:
- Shows approval inbox using `<ApprovalInbox />` client component
- Title: "Approvals" with badge showing pending count (fetched server-side)

**`app/(dashboard)/settings/approvals/page.tsx`** — Server page (admin only, redirect if not admin):
- Shows list of approval rules with edit/delete actions
- "New Rule" button opens a drawer with `<RuleEditor />`
- Renders existing rules as a table: Name, Trigger, Operator, Threshold, Approver

Add "Approvals" link to sidebar nav. Add "Approvals" sub-nav under Settings for the rules configuration page.

**Verify:**
```
# As admin:
curl -X POST /api/v1/approvals -d '{"name":"Large Deal","objectSlug":"deals","attributeSlug":"value","operator":"greater_than","threshold":"50000","approverTarget":"admin_role"}'
# Returns 201 with rule

curl -X PATCH /api/v1/approvals/[request-id] -d '{"action":"approve","note":"Looks good"}'
# Returns 200 with resolved request showing resolvedAt timestamp
```

**Done:** Admin can create approval rules at `/settings/approvals`. Pending approvals appear in inbox at `/approvals`. Approve/reject actions record timestamp and identity.

---

### Verification

```
pnpm lint && pnpm build — no errors
pnpm db:push — schema applied
Manual: Create approval rule → update deal value above threshold → check /approvals inbox → approve → verify resolvedAt is set
```

### Success Criteria

- Admin can create/delete approval rules at `/settings/approvals`
- Matching deal update creates `approval_requests` row with `status: "pending"`
- Approver inbox at `/approvals` shows pending items
- Approve/reject with note records full history (who, when, note)
- Non-admin members see only requests directed to them

### Output

After completion, create `.planning/phases/04/04-02-SUMMARY.md` with:
- Schema column list for `approval_rules` and `approval_requests`
- `evaluateRules()` function signature (callers in 04-03 and 04-04 need this)
- `createRequest()` function signature (called by contract generation in 04-03)

---

## Plan 04-03: Contract / SOW Generation

```yaml
phase: 04
plan: "04-03"
type: execute
wave: 2
depends_on:
  - "04-02"
files_modified:
  - apps/web/src/db/schema/contracts.ts
  - apps/web/src/services/documents/contract.ts
  - apps/web/src/app/api/v1/contracts/route.ts
  - apps/web/src/app/api/v1/contracts/[id]/route.ts
  - apps/web/src/components/contracts/contract-generator.tsx
  - apps/web/src/components/contracts/template-editor.tsx
  - apps/web/src/app/(dashboard)/contracts/page.tsx
autonomous: true
requirements:
  - CNTR-01
  - CNTR-02
  - CNTR-03
  - CNTR-04
user_setup:
  - service: aws-s3
    why: "Store generated contract PDF files. Required before first contract is generated."
    env_vars:
      - name: AWS_ACCESS_KEY_ID
        source: "AWS Console → IAM → Users → your user → Security credentials"
      - name: AWS_SECRET_ACCESS_KEY
        source: "AWS Console → IAM → Users → your user → Security credentials"
      - name: AWS_REGION
        source: "e.g., us-east-1 — match your S3 bucket region"
      - name: S3_BUCKET_NAME
        source: "Create an S3 bucket (or use Cloudflare R2 with S3 API) — note the bucket name"
    dashboard_config:
      - task: "Create S3 bucket with private ACL (or use Cloudflare R2 free tier)"
        location: "AWS Console → S3 → Create bucket"
      - task: "Create IAM user with s3:PutObject and s3:GetObject on the bucket only"
        location: "AWS Console → IAM → Create user → Attach inline policy"
must_haves:
  truths:
    - "User clicks 'Generate Contract' on a deal and a PDF is created from deal attribute data (name, value, company, stakeholders, agreed terms)"
    - "Generated contract appears in approval workflow (status: pending) before download is available"
    - "Approver approves the contract and the download link becomes active for the rep"
    - "Admin can view and edit the workspace contract template with sections for customizable clauses"
    - "Generated PDFs are stored in S3 (or R2) and accessed via pre-signed URL — not served through Next.js"
  artifacts:
    - path: "apps/web/src/db/schema/contracts.ts"
      provides: "contracts table (metadata + S3 key + approval linkage)"
    - path: "apps/web/src/services/documents/contract.ts"
      provides: "generateContract(), assembleContractContext(), renderToPdf()"
      exports: ["generateContract", "getContractDownloadUrl"]
    - path: "apps/web/src/app/api/v1/contracts/route.ts"
      provides: "POST /api/v1/contracts (trigger generation)"
    - path: "apps/web/src/app/api/v1/contracts/[id]/route.ts"
      provides: "GET /api/v1/contracts/[id] (fetch metadata + download URL if approved)"
  key_links:
    - from: "services/documents/contract.ts generateContract()"
      to: "S3 via @aws-sdk/client-s3"
      via: "PutObjectCommand with PDF buffer from @react-pdf/renderer"
      pattern: "const buf = await renderToBuffer(<ContractDocument {...props} />); await s3.send(new PutObjectCommand(...))"
    - from: "services/documents/contract.ts generateContract()"
      to: "services/approvals.ts createRequest()"
      via: "After S3 upload succeeds, create approval request with requestType='contract'"
    - from: "GET /api/v1/contracts/[id]"
      to: "S3 pre-signed URL"
      via: "GetObjectCommand + getSignedUrl — only if approval_requests.status = 'approved'"
```

### Objective

Generate contract and SOW PDFs from deal attribute data using `@react-pdf/renderer`, store in S3, and gate download behind the approval workflow from Plan 04-02.

Purpose: Enterprise sales stall when contracts can't be generated and routed without manual document creation. This closes the deal-to-signature gap.

Output: Contract generation service, PDF templates, S3 storage, approval-gated download, and a workspace template editor.

### Context

```
@apps/web/src/db/schema/records.ts
@apps/web/src/db/schema/approvals.ts      (from 04-02)
@apps/web/src/services/approvals.ts       (from 04-02)
@apps/web/src/services/records.ts
@apps/web/src/lib/api-utils.ts
@.planning/phases/04/04-02-SUMMARY.md     (approval service function signatures)
```

#### Key interfaces from 04-02

```typescript
// From services/approvals.ts (created in 04-02)
export async function createRequest(
  workspaceId: string,
  recordId: string,
  requestType: string,   // "contract"
  contextLabel: string,  // "Contract for Acme Corp SOW"
  requestedBy: string,
  approverTarget: string // "admin_role"
): Promise<ApprovalRequest>

export async function resolveRequest(
  requestId: string,
  action: "approve" | "reject",
  note: string,
  resolvedBy: string
): Promise<ApprovalRequest>
```

### Tasks

#### Task 1: Contract schema + PDF generation service

**Files:**
- `apps/web/src/db/schema/contracts.ts`
- `apps/web/src/services/documents/contract.ts`

**Action:**

Install: `cd apps/web && pnpm add @react-pdf/renderer @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`

Verify React 19 compatibility: `npm info @react-pdf/renderer peerDependencies` — if React 18 only, use `--legacy-peer-deps` flag and document in SUMMARY.

Create `apps/web/src/db/schema/contracts.ts`:

```typescript
export const contracts = pgTable("contracts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  recordId: text("record_id").notNull().references(() => records.id, { onDelete: "cascade" }),
  approvalRequestId: text("approval_request_id").references(() => approvalRequests.id, { onDelete: "set null" }),
  title: text("title").notNull(),              // "Acme Corp — Master Services Agreement"
  contractType: text("contract_type").notNull().default("msa"), // "msa" | "sow" | "nda"
  s3Key: text("s3_key").notNull(),             // S3 object key for the PDF
  status: text("status").notNull().default("draft"), // "draft" | "pending_approval" | "approved" | "rejected"
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
  generatedBy: text("generated_by").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
  templateVersion: text("template_version"),  // for future template versioning
});
```

Export from `db/schema/index.ts`. Run `pnpm db:push`.

Create `apps/web/src/services/documents/` directory. Create `contract.ts`:

**Context assembly — `assembleContractContext(workspaceId, dealRecordId)`:**
- Load deal record attributes: name, value/amount, closing date, terms (if attribute exists), owner
- Load linked company record (via `record_reference` attribute on the deal): company name, legal entity name (if exists), address
- Load linked contacts: all people linked to the deal, filtered to those with `title` or `role` attribute set
- Return structured object: `{dealName, dealValue, companyName, companyAddress, contacts, closingDate, terms, workspaceName}`

**PDF React component — `ContractDocument` (inline in contract.ts or separate `contract-template.tsx`):**
Use `@react-pdf/renderer` primitives: `Document`, `Page`, `View`, `Text`, `StyleSheet`. Layout:
- Header: workspace name, "MASTER SERVICES AGREEMENT" or SOW title, date
- Parties section: Client (company name/address), Provider (workspace name)
- Deal Summary: Value, closing date, key terms
- Standard clauses: Payment terms (placeholder text), Confidentiality, Governing Law (placeholder)
- Signature block: space for rep name and client name
- Footer: contract ID, generated date

**`generateContract(workspaceId, dealRecordId, contractType, generatedBy)`:**
1. `assembleContractContext(workspaceId, dealRecordId)` — load deal data
2. `const pdfBuffer = await renderToBuffer(<ContractDocument {...ctx} />)` — render PDF
3. S3 upload: `const s3Key = \`contracts/\${workspaceId}/\${crypto.randomUUID()}.pdf\`` → `PutObjectCommand({Bucket: S3_BUCKET_NAME, Key: s3Key, Body: pdfBuffer, ContentType: "application/pdf"})`
4. Insert `contracts` row with `status: "pending_approval"`, `s3Key`, `approvalRequestId: null`
5. Call `createRequest(workspaceId, dealRecordId, "contract", \`Contract: \${ctx.dealName}\`, generatedBy, "admin_role")` from approvals service
6. Update `contracts` row with `approvalRequestId`
7. Return `{contractId, approvalRequestId}`

**`getContractDownloadUrl(contractId, workspaceId, requestingUserId)`:**
- Load contract row — verify `workspaceId` matches
- If `status !== "approved"`: throw error "Contract not yet approved"
- Generate pre-signed S3 URL: `getSignedUrl(s3Client, new GetObjectCommand({Bucket, Key: contract.s3Key}), {expiresIn: 3600})`
- Return `{downloadUrl, expiresIn: 3600}`

**Verify:** Service exports compile without TypeScript errors; `pnpm db:push` succeeds.

**Done:** `contracts` table exists; `generateContract()` and `getContractDownloadUrl()` exported from service.

---

#### Task 2: Contract API routes + UI

**Files:**
- `apps/web/src/app/api/v1/contracts/route.ts`
- `apps/web/src/app/api/v1/contracts/[id]/route.ts`
- `apps/web/src/components/contracts/contract-generator.tsx`
- `apps/web/src/app/(dashboard)/contracts/page.tsx`

**Action:**

**`app/api/v1/contracts/route.ts`:**
- `POST`: `getAuthContext` → parse `{dealRecordId, contractType: "msa" | "sow" | "nda"}` → `generateContract(workspaceId, dealRecordId, contractType, userId)` → `success({contractId, approvalRequestId}, 201)`
- `GET`: `getAuthContext` → query `contracts` table scoped to `workspaceId` → return list with `status` and `recordId`

**`app/api/v1/contracts/[id]/route.ts`:**
- `GET`: `getAuthContext` → load contract by id and workspaceId → if `status = "approved"`: `getContractDownloadUrl()` → return `{contract, downloadUrl}`. If pending: return `{contract, downloadUrl: null, message: "Awaiting approval"}`

**`components/contracts/contract-generator.tsx`** — Client component:
- Props: `dealRecordId: string, dealName: string`
- Button: "Generate Contract" with dropdown for type (MSA / SOW / NDA)
- On click: `POST /api/v1/contracts` → shows success toast with link to approval inbox "Contract sent for approval"
- If contract already exists for this deal: show existing contract status badge (Pending / Approved) + download button if approved
- Download button calls `GET /api/v1/contracts/[id]` → opens `downloadUrl` in new tab

**`app/(dashboard)/contracts/page.tsx`** — Server page:
- Lists all contracts for the workspace with columns: Deal, Type, Status, Generated Date, Actions (Download / View Approval)
- Server-fetches `GET /api/v1/contracts`
- Filter tabs: All / Pending / Approved / Rejected

Add `<ContractGenerator>` to the deal record detail page (`app/(dashboard)/objects/[slug]/[recordId]/page.tsx` or the component that renders deal record detail — use existing record detail component pattern). Add it conditionally: only show if object slug is "deals".

**Note on template editing (CNTR-04):** The clause library in v1 is the `ContractDocument` React component itself. Workspace-configurable templates are deferred to a future iteration. Document this decision in SUMMARY: "CNTR-04 partially addressed — template is a React component editable in code; workspace-level clause customization requires a rich-text template engine (TipTap integration) deferred to Phase 4.x."

**Verify:**
```
# Generate a contract for a deal
curl -X POST /api/v1/contracts -d '{"dealRecordId":"[id]","contractType":"msa"}'
# Returns {contractId, approvalRequestId}

# Before approval: download URL is null
curl /api/v1/contracts/[contractId]
# Returns {contract: {status: "pending_approval"}, downloadUrl: null}

# After approving via /approvals inbox, re-fetch:
# Returns {contract: {status: "approved"}, downloadUrl: "https://s3.../...?X-Amz-..."}
```

**Done:** Contract generation works end-to-end; PDF is in S3; download is blocked until approval; contract list page shows all workspace contracts with status.

---

### Verification

```
pnpm lint && pnpm build — no errors
pnpm db:push — contracts table exists
Manual: Generate contract for a deal → verify approval request created → approve in /approvals → download PDF
```

### Success Criteria

- Contract PDF generated from real deal attribute data (not placeholder data)
- PDF stored in S3; not served through Next.js
- Download blocked until approval workflow resolves with "approved"
- Contract list page shows all workspace contracts with status
- Approval history for contracts visible in `/approvals` inbox

### Output

After completion, create `.planning/phases/04/04-03-SUMMARY.md` with:
- S3 key pattern used (`contracts/{workspaceId}/{uuid}.pdf`)
- `generateContract()` function signature (called from 04-04)
- Note on CNTR-04 partial implementation decision

---

## Plan 04-04: Close Flow — Handoff Brief + Webhook Delivery

```yaml
phase: 04
plan: "04-04"
type: execute
wave: 3
depends_on:
  - "04-02"
  - "04-03"
files_modified:
  - apps/web/src/services/documents/handoff.ts
  - apps/web/src/app/api/v1/close-flow/route.ts
  - apps/web/src/services/crm-events.ts
  - apps/web/src/components/close-flow/handoff-panel.tsx
  - apps/web/src/app/(dashboard)/settings/page.tsx
autonomous: true
requirements:
  - CLOS-01
  - CLOS-02
must_haves:
  truths:
    - "When a deal is marked closed-won (stage attribute changes to the closed-won status), a customer handoff brief is generated and stored within the same session"
    - "Handoff brief contains: stakeholders list, agreed pricing/terms, success criteria (from deal notes or attributes), deal history summary, rep name and contact"
    - "Rep can export the handoff brief as a PDF download"
    - "If a webhook URL is configured in workspace settings, the handoff brief payload is POSTed to that URL when the deal closes"
    - "Rep can manually trigger handoff brief generation from the deal record page (for deals already closed or where auto-generation failed)"
  artifacts:
    - path: "apps/web/src/services/documents/handoff.ts"
      provides: "generateHandoffBrief(), deliverHandoffWebhook()"
      exports: ["generateHandoffBrief", "deliverHandoffWebhook"]
    - path: "apps/web/src/app/api/v1/close-flow/route.ts"
      provides: "POST /api/v1/close-flow (manual trigger) and webhook delivery"
    - path: "apps/web/src/components/close-flow/handoff-panel.tsx"
      provides: "Handoff brief display + export + webhook status UI"
    - path: "apps/web/src/services/crm-events.ts"
      provides: "Extended with closed-won detection that calls generateHandoffBrief"
  key_links:
    - from: "apps/web/src/services/crm-events.ts handleRecordUpdated()"
      to: "services/documents/handoff.ts generateHandoffBrief()"
      via: "Stage change detection: if newStage matches closed-won status, await generateHandoffBrief()"
      pattern: "Extend existing handleRecordUpdated() in crm-events.ts with closed-won branch"
    - from: "services/documents/handoff.ts deliverHandoffWebhook()"
      to: "workspace.settings.handoff_webhook_url"
      via: "fetch(webhookUrl, {method: 'POST', body: JSON.stringify(handoffPayload)})"
```

### Objective

Complete the sales pipeline by building the closed-won trigger, handoff brief generator, and webhook delivery. When a deal closes, the system automatically generates a structured handoff document and delivers it to external CS tools.

Purpose: The full pipeline promise — deal goes in, rep closes, CS team gets everything they need without a single manual handoff step.

Output: Handoff brief service, stage-change trigger wired into `crm-events.ts`, PDF export, webhook delivery, and UI on the deal record page.

### Context

```
@apps/web/src/services/crm-events.ts
@apps/web/src/services/records.ts
@apps/web/src/services/notes.ts
@apps/web/src/lib/api-utils.ts
@apps/web/src/db/schema/workspace.ts
@.planning/phases/04/04-02-SUMMARY.md
@.planning/phases/04/04-03-SUMMARY.md
```

#### Existing interfaces

```typescript
// From apps/web/src/services/crm-events.ts (existing, extend in this plan)
// This service is called from record update API routes.
// It receives the updated record and changed fields.
// Extend handleRecordUpdated() to detect closed-won stage changes.

// From apps/web/src/db/schema/workspace.ts
// workspaces.settings is JSONB — add handoff_webhook_url as a settings key
// Access via workspace.settings?.handoff_webhook_url

// From apps/web/src/services/notes.ts
export async function getNotesForRecord(recordId: string): Promise<Note[]>
// Returns notes linked to the record ordered by updatedAt desc

// From 04-03 SUMMARY (contract service):
// generateContract() signature if needed for bundling contracts with handoff
```

### Tasks

#### Task 1: Handoff brief service

**Files:**
- `apps/web/src/services/documents/handoff.ts`
- `apps/web/src/db/schema/handoffs.ts`

**Action:**

Create `apps/web/src/db/schema/handoffs.ts` to store generated handoff briefs:

```typescript
export const handoffBriefs = pgTable("handoff_briefs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  recordId: text("record_id").notNull().references(() => records.id, { onDelete: "cascade" }),
  content: jsonb("content").notNull(),          // Structured handoff data (see HandoffBriefContent type)
  s3Key: text("s3_key"),                        // S3 key for PDF export (null until exported)
  webhookDeliveredAt: timestamp("webhook_delivered_at"),
  webhookStatus: text("webhook_status"),        // "success" | "failed" | null
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
  generatedBy: text("generated_by").references(() => users.id, { onDelete: "set null" }),
});
```

Export from `db/schema/index.ts`. Run `pnpm db:push`.

Create `apps/web/src/services/documents/handoff.ts`:

**`HandoffBriefContent` type:**
```typescript
interface HandoffBriefContent {
  dealName: string;
  closedDate: string;
  dealValue: number | null;
  repName: string;
  repEmail: string;
  companyName: string;
  companyAddress: string | null;
  stakeholders: Array<{name: string; title: string | null; email: string | null}>;
  agreedTerms: string | null;    // from "terms" attribute or extracted from notes
  successCriteria: string | null; // from "success_criteria" attribute or notes summary
  dealSummary: string;           // brief narrative: "X-week sales cycle, Y meetings, Z stakeholders"
  notes: Array<{title: string; excerpt: string; date: string}>;  // last 5 notes
}
```

**`generateHandoffBrief(workspaceId, dealRecordId, generatedBy)`:**
1. Check if handoff brief already exists for `recordId` — if so, return existing (idempotent)
2. Load deal attributes: name, value, closing date, terms, success criteria, company (record_reference)
3. Load linked company: name, address
4. Load linked people (stakeholders): name, title, email
5. Load workspace member info for rep (createdBy on the deal record) → name, email
6. Load last 5 notes for the deal
7. Assemble `HandoffBriefContent` object
8. Insert `handoff_briefs` row with `content = handoffContent`
9. Call `deliverHandoffWebhook(workspaceId, handoffBriefId)` fire-and-forget (don't await — don't block the trigger)
10. Return `{handoffBriefId, content}`

**`deliverHandoffWebhook(workspaceId, handoffBriefId)`:**
1. Load workspace settings → check `settings?.handoff_webhook_url`
2. If no webhook URL: log and return early (not an error)
3. Load handoff brief content
4. POST to webhook URL:
   ```
   fetch(webhookUrl, {
     method: "POST",
     headers: {"Content-Type": "application/json", "X-OpenClaw-Event": "deal.closed_won"},
     body: JSON.stringify({event: "deal.closed_won", brief: handoffContent, timestamp: new Date().toISOString()})
   })
   ```
5. On success: update `handoff_briefs.webhookDeliveredAt` and `webhookStatus = "success"`
6. On failure (non-2xx or network error): update `webhookStatus = "failed"`. Log the error. Do not throw — webhook failure must not break the UI.

**Closed-won detection — extend `crm-events.ts`:**
Read the existing `handleRecordUpdated()` function in `services/crm-events.ts`. Add a branch after existing logic:
- Check if the changed values include a stage/status attribute
- Load the deal object's status attribute options to find which option is marked as the "closed-won" equivalent (look for an option with title matching `/closed.won/i` or `celebrationEnabled = true` in `statuses` table)
- If the new stage matches closed-won: call `generateHandoffBrief(workspaceId, recordId, userId)` fire-and-forget (`generateHandoffBrief(...).catch(console.error)` — do not await, do not block the HTTP response)

**Verify:** `pnpm db:push` succeeds; `handoff_briefs` table exists; service compiles.

**Done:** `generateHandoffBrief()` and `deliverHandoffWebhook()` exported; `crm-events.ts` extended with closed-won detection.

---

#### Task 2: Close flow API route + handoff UI

**Files:**
- `apps/web/src/app/api/v1/close-flow/route.ts`
- `apps/web/src/components/close-flow/handoff-panel.tsx`
- `apps/web/src/app/(dashboard)/settings/page.tsx` (extend existing settings page)

**Action:**

**`app/api/v1/close-flow/route.ts`:**
- `POST`: manual trigger: `getAuthContext` → parse `{dealRecordId}` → `generateHandoffBrief(workspaceId, dealRecordId, userId)` → `success({handoffBriefId, content})`
- `GET`: `getAuthContext` → parse `?recordId=...` → query `handoff_briefs` where `recordId = param` and `workspaceId` matches → `success({brief: row | null})`

**PDF export:** Add a `?export=pdf` query to the GET route. If present:
1. Load handoff brief content
2. Render a simple `@react-pdf/renderer` `Document` with the handoff content sections (no approval gate required — handoff brief export is internal use only)
3. Upload to S3 at `handoffs/{workspaceId}/{briefId}.pdf`
4. Update `handoff_briefs.s3Key`
5. Return pre-signed URL

**`components/close-flow/handoff-panel.tsx`** — Client component:
- Props: `dealRecordId: string, dealName: string`
- On mount: `GET /api/v1/close-flow?recordId={dealRecordId}`
- If handoff brief exists: shows structured content in collapsible sections (Stakeholders, Agreed Terms, Success Criteria, Notes Summary)
  - "Export PDF" button: calls `GET /api/v1/close-flow?recordId=...&export=pdf` → opens download URL
  - Webhook delivery status badge: "Delivered to CS tool" (success) | "Webhook delivery failed" (failed) | "No webhook configured" (null URL)
- If no handoff brief: shows "Generate Handoff Brief" button — `POST /api/v1/close-flow` → then refreshes
- Loading and error states handled with shadcn/ui `Skeleton` and toast

**Settings integration — webhook URL configuration:**
Extend the existing `app/(dashboard)/settings/page.tsx` (or find the settings page in the codebase). Add an "Integrations" section with a "Customer Handoff Webhook" field:
- Text input for URL (https:// required)
- "Save" button: `PATCH /api/v1/workspaces/settings` with `{handoff_webhook_url: url}` (use existing workspace settings API if present, or add PATCH handler)
- "Test Webhook" button: sends a sample payload to the URL and shows response code
- Descriptive help text: "When a deal is marked closed-won, we'll POST the handoff brief to this URL. Compatible with Zapier webhooks, n8n, Slack Incoming Webhooks, and Intercom."

**Add `<HandoffPanel>` to deal record detail page:** The existing record detail rendering lives in `app/(dashboard)/objects/[slug]/[recordId]/page.tsx` or a component it uses. Add `<HandoffPanel>` below the notes section, conditionally rendered only when `objectSlug === "deals"`.

**Verify:**
```
# Manual trigger:
curl -X POST /api/v1/close-flow -d '{"dealRecordId":"[id]"}'
# Returns {handoffBriefId, content: {dealName, stakeholders, ...}}

# Auto-trigger:
# Update deal stage to closed-won via PATCH /api/v1/objects/deals/records/[id]
# handoff_briefs row should appear within the same request's fire-and-forget
# (may need a brief wait / refresh to see in UI)

# PDF export:
curl "/api/v1/close-flow?recordId=[id]&export=pdf"
# Returns {downloadUrl: "https://s3.../handoffs/..."}
```

**Done:** Handoff brief generates on closed-won stage change; manual trigger works from deal page; PDF export downloads; webhook delivers payload if URL configured; delivery status visible in handoff panel.

---

### Verification

```
pnpm lint && pnpm build — no errors
pnpm db:push — handoff_briefs table exists
Manual: Mark deal as closed-won → handoff panel appears on deal page → export PDF → configure webhook URL → re-trigger → verify webhook received correct payload
```

### Success Criteria

- Stage change to closed-won auto-triggers handoff brief generation (fire-and-forget, does not block UI response)
- Handoff brief contains real deal data: stakeholders, value, notes excerpts
- PDF export generates and downloads from S3
- Webhook delivery POSTs structured JSON with deal context to configured URL
- Delivery status (success/failed/not configured) shown in UI
- Manual trigger button works for deals already closed or where auto-generation failed

### Output

After completion, create `.planning/phases/04/04-04-SUMMARY.md` with:
- Webhook payload schema (for CS tool integration documentation)
- Closed-won detection approach (which attribute/status signals the close)
- Fire-and-forget pattern used (and why — to not block HTTP response)

---

## Phase 4 Verification (All Plans)

After all four plans complete, the following must be true simultaneously:

1. **Rep pipeline:** Navigate to `/pipeline` → see deals, tasks, pending AI drafts
2. **Manager pipeline:** Admin user navigates to `/pipeline/manager` → sees per-rep table; member user redirected to `/pipeline`
3. **Forecast:** Admin navigates to `/pipeline/forecast` → sees stage buckets with weighted value
4. **Approval rule → request:** Admin creates a rule at `/settings/approvals` → updates a matching deal → approval request appears in `/approvals` inbox
5. **Approve → contract download unlocked:** Approve a contract request in inbox → `GET /api/v1/contracts/[id]` returns `downloadUrl` (previously null)
6. **Closed-won trigger:** Mark deal as closed-won → `handoff_briefs` row exists for the deal within seconds → handoff panel renders on deal page
7. **Webhook delivery:** Configure webhook URL in settings → mark deal closed-won → external endpoint receives POST with handoff payload

```
E2E test command (once tests written):
cd apps/web && pnpm test:e2e --grep "Phase 4"
```

---

## Phase 4 Success Criteria (from Roadmap)

1. Rep can open a personal pipeline dashboard showing their deals, open tasks, and the AI draft queue in one view; manager can see aggregate team pipeline and per-rep metrics; leadership can see stage distribution and weighted pipeline value — **covered by 04-01**

2. Workspace admin can configure an approval rule (e.g., discount > 20% routes to manager) and the system routes matching deals to the designated approver with notification, tracks approval history, and blocks customer-facing action until approved — **covered by 04-02**

3. A contract or SOW is generated from deal data as a PDF, routes through the approval workflow, and is only deliverable to the customer after explicit approver sign-off — **covered by 04-03**

4. When a deal is marked closed-won, a customer handoff brief is generated automatically and can be exported or sent to an external CS tool via webhook — **covered by 04-04**
