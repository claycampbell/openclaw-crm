# Phase 3: AI Asset Generation + Outbound — Execution Plan

**Phase:** 03 — AI Asset Generation + Outbound
**Depends on:** Phase 1 (Async Infrastructure), Phase 2 (Signal Integrations)
**Requirements:** AGEN-01–08, SEQN-01–05, LEAD-01–04
**Plans:** 03-01 through 03-06
**Granularity:** Coarse (per config.json)

---

## Phase Goal

The CRM proactively generates deal assets (proposals, briefs, follow-ups, battlecards) when deal events trigger them, enables reps to run AI-personalized outbound email sequences, and scores and qualifies inbound leads — without the rep asking.

## Phase Success Criteria

1. When a new deal is created with sufficient context, an opportunity brief draft appears in the rep's approval inbox within minutes — without the rep requesting it
2. When a deal advances to the proposal stage, a proposal draft appears in the approval inbox; when it advances to the presentation stage, a deck draft appears — both require explicit rep approval before any customer sees them
3. Thirty minutes before a deal-linked calendar event, a meeting prep brief (with talking points, recent touchpoints, and objection handling) appears in the rep's approval inbox
4. Rep can create a multi-step email sequence, enroll contacts into it, and the sequence stops automatically when a recipient replies
5. Each lead has a numeric score with a plain-language AI explanation (e.g., "Title matches ICP, 3 pricing page visits") and reps can capture inbound leads via embeddable web forms

## Must-Haves (Goal-Backward)

### Observable Truths
- AI-generated drafts appear in an approval inbox before any customer-facing action is taken
- Proposal draft auto-generates when deal stage advances to "Proposal"
- Deck draft auto-generates when deal stage advances to "Presentation"
- Opportunity brief auto-generates on new deal creation with sufficient data
- Meeting prep brief appears T-30min before a linked calendar event
- Post-meeting follow-up draft appears after meeting ends or notes are added
- Battlecard auto-generates when competitor name detected in deal context
- Reps can create multi-step sequences; enrolled contacts receive steps on schedule
- Sequence halts automatically when recipient replies
- Inbound web form creates a lead record; lead receives numeric score with AI explanation

### Required Artifacts
- `apps/web/src/db/schema/documents.ts` — generated_assets table (id, workspace_id, record_id, asset_type, status, content, model_used, prompt_version, generated_at, approved_by, approved_at)
- `apps/web/src/db/schema/sequences.ts` — sequences, sequence_steps, sequence_enrollments tables
- `apps/web/src/services/documents/context-assembler.ts` — shared context assembly: deal + company + contacts + notes + timeline excerpts
- `apps/web/src/services/documents/proposal.ts` — proposal + deck generator
- `apps/web/src/services/documents/brief.ts` — opportunity brief + meeting prep brief generators
- `apps/web/src/services/documents/followup.ts` — post-meeting follow-up draft generator
- `apps/web/src/services/documents/battlecard.ts` — competitor detection + battlecard generator
- `apps/web/src/services/email-sequences.ts` — sequence CRUD, step scheduling, enrollment, reply detection
- `apps/web/src/services/lead-scoring.ts` — weighted scoring engine + AI explanation generator
- `apps/web/src/app/(dashboard)/inbox/page.tsx` — approval inbox UI
- `apps/web/src/app/(dashboard)/sequences/page.tsx` — sequence management UI
- `apps/web/src/app/api/v1/forms/[formId]/route.ts` — public web form submission endpoint

### Key Links
- Signal event (stage_changed) → automation-engine → ai_generate job → document generator → generated_assets (status: draft) → approval inbox notification
- Approved asset → email_send job (for sequences) or attached PDF (for proposals)
- Meeting T-30min cron job → meeting prep brief generator → generated_assets
- Form submission → record creation (People + Company) → lead_score job
- Reply detection webhook → sequence enrollment status update (stopped)

---

## Architecture Notes (Phase 3 Specifics)

Phase 3 builds EXCLUSIVELY on the job queue (Phase 1) and signal event bus (Phase 1). Every generator is invoked by a background job — never inline in a request handler. Every output lands in `generated_assets` with `status: "draft"` before the rep sees it.

**Tiered context strategy (AGEN-08):**
- Tier 1 — Rule-based: No LLM call. Pure pattern match (competitor keyword in notes → enqueue battlecard job). Zero cost.
- Tier 2 — Light model: Compact context (changed fields + record summary). Used for: opportunity brief, follow-up draft, meeting prep. Use a haiku-class model via the workspace's configured OpenRouter model selection.
- Tier 3 — Full model: Rich assembled context (deal + company + contacts + timeline + emails). Used for: proposal, presentation deck, battlecard. Rate-limited: max 3 full-tier generations per workspace per hour.

**Context strategy is set in the job payload** (`context_tier: "light" | "full"`) before the job is created. The generator reads this field and adjusts what it assembles and which model it calls.

**Do NOT reuse `buildSystemPrompt` from `ai-chat.ts`** for background generation. It includes the full workspace schema and is designed for interactive chat. Create a lean `buildGenerationContext(tier, dealId)` function in `context-assembler.ts`.

---

## Wave Structure

```
Wave 1 (parallel):
  03-01: Generated assets pipeline setup (schema + asset registry + approval inbox)
  [Dependency for ALL other plans]

Wave 2 (parallel, after 03-01):
  03-02: Opportunity brief + proposal + deck generators
  03-03: Meeting prep brief + post-meeting follow-up generators
  03-04: Competitive battlecard generator

Wave 3 (parallel, after 03-01):
  03-05: Email sequences (independent of 03-02/03/04)

Wave 4 (after 03-01, reads from Phase 2 signal bus):
  03-06: Lead scoring + inbound capture
```

---

## Plans

---

## 03-01: Generated Assets Pipeline Setup

```
---
phase: 03
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/db/schema/documents.ts
  - apps/web/src/db/schema/index.ts
  - apps/web/src/services/documents/asset-registry.ts
  - apps/web/src/services/documents/context-assembler.ts
  - apps/web/src/app/(dashboard)/inbox/page.tsx
  - apps/web/src/app/(dashboard)/inbox/components/AssetCard.tsx
  - apps/web/src/app/api/v1/assets/route.ts
  - apps/web/src/app/api/v1/assets/[id]/route.ts
  - apps/web/src/app/api/v1/assets/[id]/approve/route.ts
autonomous: true
requirements: [AGEN-07, AGEN-08]
must_haves:
  truths:
    - "generated_assets table exists with draft/approved/sent/archived lifecycle"
    - "Rep can open /inbox and see pending draft assets grouped by deal"
    - "Rep can approve or reject a draft asset from the inbox"
    - "Context assembler builds tiered context without reusing buildSystemPrompt"
  artifacts:
    - path: "apps/web/src/db/schema/documents.ts"
      provides: "generated_assets table schema"
      contains: "status: draft | approved | sent | archived"
    - path: "apps/web/src/services/documents/asset-registry.ts"
      provides: "Asset type definitions and tier assignments"
      exports: ["ASSET_TYPES", "ASSET_TIER_MAP", "createDraftAsset", "approveAsset", "rejectAsset"]
    - path: "apps/web/src/services/documents/context-assembler.ts"
      provides: "Tiered context assembly for LLM generation calls"
      exports: ["assembleContext"]
    - path: "apps/web/src/app/(dashboard)/inbox/page.tsx"
      provides: "Approval inbox UI"
  key_links:
    - from: "asset-registry.ts createDraftAsset()"
      to: "generated_assets table"
      via: "Drizzle INSERT with status: draft"
    - from: "/inbox page"
      to: "GET /api/v1/assets?status=draft"
      via: "fetch in server component"
    - from: "AssetCard approve button"
      to: "POST /api/v1/assets/[id]/approve"
      via: "client fetch"
---
```

### Task 1: generated_assets schema + asset registry service

**Files:** `apps/web/src/db/schema/documents.ts`, `apps/web/src/db/schema/index.ts`, `apps/web/src/services/documents/asset-registry.ts`

**Action:**

Create `apps/web/src/db/schema/documents.ts` with the `generatedAssets` Drizzle table. Columns:
- `id` — uuid, primary key, defaultRandom()
- `workspaceId` — text, not null, FK to workspaces
- `recordId` — text, not null (the deal/contact the asset is about)
- `assetType` — text, not null: `"opportunity_brief" | "proposal" | "deck" | "meeting_prep" | "followup" | "battlecard"`
- `status` — text, not null, default `"draft"`: `"draft" | "approved" | "sent" | "archived"`
- `content` — jsonb, not null (structured content: sections, title, body per asset type)
- `contentMd` — text, nullable (markdown rendering of content for display)
- `modelUsed` — text, nullable (e.g., `"anthropic/claude-haiku"` or `"anthropic/claude-3-5-sonnet"`)
- `promptVersion` — text, nullable (semver string, e.g., `"1.0.0"`, for tracking prompt quality over time)
- `contextTier` — text, not null: `"light" | "full"`
- `generatedAt` — timestamp, default now()
- `approvedBy` — text, nullable (userId)
- `approvedAt` — timestamp, nullable
- `rejectedBy` — text, nullable
- `rejectedAt` — timestamp, nullable
- `metadata` — jsonb, nullable (trigger context: which signal caused this, competitor name for battlecards, etc.)

Add indexes: `(workspaceId, status)`, `(recordId, assetType)`.

Export from `apps/web/src/db/schema/index.ts` — add `export * from "./documents"`.

Create `apps/web/src/services/documents/asset-registry.ts`:

```typescript
// Asset type → tier mapping
export const ASSET_TIER_MAP = {
  opportunity_brief: "light",
  followup: "light",
  meeting_prep: "light",
  proposal: "full",
  deck: "full",
  battlecard: "full",
} as const;

// createDraftAsset(workspaceId, recordId, assetType, content, modelUsed, promptVersion, metadata?)
// Inserts a new generated_assets row with status: "draft"
// Returns the inserted asset

// approveAsset(assetId, userId)
// Sets status: "approved", approvedBy: userId, approvedAt: now()
// Returns updated asset

// rejectAsset(assetId, userId)
// Sets status: "archived", rejectedBy: userId, rejectedAt: now()
// Returns updated asset

// listDraftAssets(workspaceId, limit?)
// Returns generated_assets WHERE workspaceId = ? AND status = "draft" ORDER BY generatedAt DESC
// Used by inbox page

// getAsset(assetId, workspaceId)
// Returns single asset, enforces workspaceId scope
```

Run `pnpm db:push` to apply schema.

**Verify:** `pnpm db:push` completes without error. Table `generated_assets` exists in the database.

**Done:** Schema applied, registry exports all five functions, asset type + tier constants defined.

---

### Task 2: Tiered context assembler + approval inbox UI

**Files:** `apps/web/src/services/documents/context-assembler.ts`, `apps/web/src/app/(dashboard)/inbox/page.tsx`, `apps/web/src/app/(dashboard)/inbox/components/AssetCard.tsx`, `apps/web/src/app/api/v1/assets/route.ts`, `apps/web/src/app/api/v1/assets/[id]/route.ts`, `apps/web/src/app/api/v1/assets/[id]/approve/route.ts`

**Action:**

**Context assembler** (`services/documents/context-assembler.ts`):

Export `assembleContext(workspaceId, recordId, tier: "light" | "full"): Promise<string>`.

For tier `"light"`:
- Load record values for the deal (name, stage, amount, close_date, owner)
- Load linked company name and industry (single query on referenced_record_id)
- Load linked contact names (first 3)
- Load most recent 2 notes (text content, created_at)
- Return compact markdown string, target <2000 tokens

For tier `"full"`:
- Everything from light tier
- Load all deal attribute values
- Load full linked company record values
- Load all linked contact records (up to 5)
- Load last 5 notes (full text)
- Load last 10 signal events from signal_events table for this record
- Load last 5 email subjects from email_messages table for this record (if Phase 2 populated)
- Return comprehensive markdown context, target <8000 tokens

Do NOT call `buildSystemPrompt` from `ai-chat.ts`. Do NOT include workspace object schema in background generation context.

**API routes:**

`GET /api/v1/assets` — `getAuthContext` → query `listDraftAssets(workspaceId)` → `success(assets)`. Supports `?status=` param (default: `draft`). Supports `?recordId=` to filter by deal.

`GET /api/v1/assets/[id]` — `getAuthContext` → `getAsset(id, workspaceId)` (enforces workspace scope) → `success(asset)`.

`POST /api/v1/assets/[id]/approve` — `getAuthContext` → `approveAsset(id, userId)` → `success(asset)`. Returns 404 if asset not in this workspace.

`POST /api/v1/assets/[id]/reject` — `getAuthContext` → `rejectAsset(id, userId)` → `success(asset)`.

**Inbox page** (`app/(dashboard)/inbox/page.tsx`):

Server component. Fetches draft assets grouped by recordId. For each group, shows the deal name and a count badge. Renders a list of `AssetCard` components.

**AssetCard** (`inbox/components/AssetCard.tsx`):

Client component. Props: `asset: GeneratedAsset`. Displays:
- Asset type badge (Proposal / Meeting Prep / etc.)
- Record name (deal name)
- Generated at timestamp
- Truncated content preview (first 200 chars of contentMd)
- "Review" button → expands full content in a shadcn Sheet or Dialog
- Inside expanded view: "Approve" and "Reject" buttons
- Approve → POST /api/v1/assets/[id]/approve → optimistic update to hide from inbox
- Reject → POST /api/v1/assets/[id]/reject → removes from inbox with a toast

Use shadcn Sheet, Badge, Button, Card, Separator components. Tailwind for layout. Do not add animations. Status updates use optimistic UI with `useState`.

Add `/inbox` to the dashboard sidebar navigation (edit the existing sidebar component to include the link with an Inbox icon).

**Verify:** Navigate to `/inbox` — page renders without error. Create a `generated_assets` row manually via SQL with `status: "draft"` — it appears in the inbox. Click Approve — row updates to `status: "approved"`, disappears from inbox.

**Done:** Approval inbox displays draft assets, approve/reject updates status, inbox link appears in sidebar.

---

## 03-02: Opportunity Brief + Proposal + Deck Generators

```
---
phase: 03
plan: 02
type: execute
wave: 2
depends_on: [03-01]
files_modified:
  - apps/web/src/services/documents/brief.ts
  - apps/web/src/services/documents/proposal.ts
  - apps/web/src/app/api/v1/cron/generate/route.ts
  - apps/web/src/services/automation-engine.ts
autonomous: true
requirements: [AGEN-01, AGEN-02, AGEN-03, AGEN-08]
must_haves:
  truths:
    - "New deal creation enqueues an opportunity brief generation job"
    - "Deal stage change to 'Proposal' enqueues proposal generation job"
    - "Deal stage change to 'Presentation' enqueues deck generation job"
    - "Generated drafts land in generated_assets with status: draft"
    - "Rep sees brief/proposal/deck in the approval inbox within 2 cron cycles"
  artifacts:
    - path: "apps/web/src/services/documents/brief.ts"
      provides: "Opportunity brief generator (light tier)"
      exports: ["generateOpportunityBrief"]
    - path: "apps/web/src/services/documents/proposal.ts"
      provides: "Proposal + deck generators (full tier)"
      exports: ["generateProposal", "generateDeck"]
    - path: "apps/web/src/app/api/v1/cron/generate/route.ts"
      provides: "Cron worker that dequeues and executes ai_generate jobs"
  key_links:
    - from: "automation-engine.ts"
      to: "job queue"
      via: "enqueue ai_generate job with documentType + recordId + contextTier"
    - from: "cron/generate/route.ts"
      to: "brief.ts / proposal.ts"
      via: "switch on job.payload.documentType"
    - from: "generators"
      to: "generated_assets table"
      via: "createDraftAsset() from asset-registry.ts"
---
```

### Task 1: Opportunity brief generator + automation engine wiring

**Files:** `apps/web/src/services/documents/brief.ts`, `apps/web/src/services/automation-engine.ts`

**Action:**

**`services/documents/brief.ts`:**

Export `generateOpportunityBrief(workspaceId: string, dealId: string): Promise<void>`.

Implementation:
1. Call `assembleContext(workspaceId, dealId, "light")` from context-assembler
2. Get workspace AI config: read `workspaces.settings` for `openrouterApiKey` + `openrouterModel` (use the same pattern as `ai-chat.ts` `getAIConfig()`)
3. Build a focused brief prompt (do NOT use `buildSystemPrompt`):
   ```
   You are a sales assistant. Based on the following deal context, write a concise opportunity brief for the sales rep.

   The brief must include:
   - Prospect summary (company, contact, title)
   - Deal overview (what they want, deal size if known)
   - Key reasons this could be a strong fit
   - Recommended next steps (2-3 specific actions)
   - Key risks or unknowns

   Format as structured JSON with these exact keys: prospect_summary, deal_overview, fit_reasons, next_steps, risks.

   Deal context:
   {context}
   ```
4. Call OpenRouter directly (using `fetch` against `https://openrouter.ai/api/v1/chat/completions`, non-streaming) with the model from workspace config. Use `response_format: { type: "json_object" }` for structured output.
5. Parse the JSON response. If parsing fails, log error and return without creating a draft (do not throw — background jobs must not crash the cron worker).
6. Call `createDraftAsset(workspaceId, dealId, "opportunity_brief", parsedContent, modelUsed, "1.0.0")`.

**Context sufficiency check:** Before enqueuing the brief job, check that the deal has at minimum a name attribute and either an amount or a linked company. If neither is present, skip generation. A deal with only a name and no other data produces a useless brief. Log skipped generations to console.

**`services/automation-engine.ts`** (extend existing if it exists from Phase 1, create if not):

Export `evaluateSignalForGeneration(signal: SignalEvent): Promise<void>`.

Rules:
- `signal.type === "record_created"` AND `signal.payload.objectType === "deals"` → enqueue `ai_generate` job with `{ documentType: "opportunity_brief", recordId: signal.recordId, contextTier: "light" }`
- `signal.type === "stage_changed"` AND `newStage matches /proposal/i` → enqueue `ai_generate` job with `{ documentType: "proposal", recordId: signal.recordId, contextTier: "full" }`
- `signal.type === "stage_changed"` AND `newStage matches /presentation|deck|pitch/i` → enqueue `ai_generate` job with `{ documentType: "deck", recordId: signal.recordId, contextTier: "full" }`

Stage matching uses case-insensitive regex against the stage name string — workspaces may name stages differently. This is a workspace-configurable heuristic, not a hardcoded stage ID.

**Verify:** Call `generateOpportunityBrief("workspace-id", "deal-id")` with a real deal — a row appears in `generated_assets` with `asset_type: "opportunity_brief"` and `status: "draft"`.

**Done:** Brief generator runs without throwing, creates draft asset. Automation engine correctly classifies record_created and stage_changed signals.

---

### Task 2: Proposal + deck generators + cron worker

**Files:** `apps/web/src/services/documents/proposal.ts`, `apps/web/src/app/api/v1/cron/generate/route.ts`

**Action:**

**`services/documents/proposal.ts`:**

Export `generateProposal(workspaceId: string, dealId: string): Promise<void>`.
Export `generateDeck(workspaceId: string, dealId: string): Promise<void>`.

Both use `assembleContext(workspaceId, dealId, "full")`.

**Proposal prompt structure:**
```
You are a proposal writer. Generate a professional sales proposal based on the following deal context.

Return structured JSON with keys: executive_summary, prospect_pain_points, our_solution, key_benefits (array of 3-5), proposed_scope (array of deliverables), pricing_summary, next_steps, timeline_estimate.

Do not fabricate specific numbers not present in the context. Use "TBD" for unknown values.

Deal context:
{context}
```

**Deck prompt structure:**
```
You are a presentation strategist. Generate a sales presentation outline based on the following deal context.

Return structured JSON with keys: title_slide (title, subtitle), agenda (array of slide titles), slides (array of objects with title, key_points array, speaker_notes).

Generate 8-12 slides total. Include: Problem/Pain, Solution Overview, Key Benefits, Social Proof/Case Study placeholder, Pricing Options, Next Steps.

Deal context:
{context}
```

Both call `createDraftAsset()` with the appropriate asset type.

**Cron worker** (`app/api/v1/cron/generate/route.ts`):

```typescript
export async function GET(req: Request) {
  // Verify CRON_SECRET header (Vercel Cron best practice)
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) return new Response("Unauthorized", { status: 401 });

  // Claim a batch of pending ai_generate jobs (max 5 per cron invocation)
  // From the background_jobs table (Phase 1 schema)
  // Set status = "running" with optimistic locking
  // For each job:
  //   switch(job.payload.documentType):
  //     "opportunity_brief": generateOpportunityBrief(workspaceId, recordId)
  //     "proposal": generateProposal(workspaceId, recordId)
  //     "deck": generateDeck(workspaceId, recordId)
  //   Mark job complete or failed (with retry increment)
  // Return 200 with { processed: N }
}
```

Add to `vercel.json` (create if not exists):
```json
{
  "crons": [
    { "path": "/api/v1/cron/generate", "schedule": "* * * * *" }
  ]
}
```

The cron runs every minute. The 5-job cap per invocation prevents overwhelming OpenRouter during a burst.

**Verify:** Create a deal, manually advance its stage to "Proposal" via the API, verify a `background_jobs` row appears with `type: "ai_generate"` and `payload.documentType: "proposal"`. Trigger the cron endpoint manually (`GET /api/v1/cron/generate` with correct Authorization header) — verify job runs and a `generated_assets` row appears with `asset_type: "proposal"` and `status: "draft"`.

**Done:** Proposal and deck generators run successfully. Cron worker processes jobs from the queue and creates draft assets.

---

## 03-03: Meeting Prep Brief + Post-Meeting Follow-Up Generators

```
---
phase: 03
plan: 03
type: execute
wave: 2
depends_on: [03-01]
files_modified:
  - apps/web/src/services/documents/followup.ts
  - apps/web/src/app/api/v1/cron/meeting-prep/route.ts
  - apps/web/src/services/automation-engine.ts
autonomous: true
requirements: [AGEN-04, AGEN-05]
must_haves:
  truths:
    - "Meeting prep brief appears in approval inbox 30 minutes before a deal-linked calendar event"
    - "Post-meeting follow-up draft appears after a meeting ends or notes are added"
    - "Both drafts are light-tier generation: compact context, haiku-class model"
  artifacts:
    - path: "apps/web/src/services/documents/followup.ts"
      provides: "Meeting prep brief + post-meeting follow-up generators"
      exports: ["generateMeetingPrepBrief", "generatePostMeetingFollowup"]
    - path: "apps/web/src/app/api/v1/cron/meeting-prep/route.ts"
      provides: "Cron job: scans upcoming meetings and enqueues prep brief jobs T-30min"
  key_links:
    - from: "cron/meeting-prep → scans calendar_events (Phase 2 table)"
      to: "background_jobs table"
      via: "enqueue meeting_prep job for events starting in 25-35 min"
    - from: "signal_type: meeting_ended OR note_added"
      to: "generatePostMeetingFollowup"
      via: "automation-engine evaluateSignalForGeneration"
---
```

### Task 1: Meeting prep brief generator

**Files:** `apps/web/src/services/documents/followup.ts`, `apps/web/src/app/api/v1/cron/meeting-prep/route.ts`

**Action:**

**`services/documents/followup.ts`** — Export `generateMeetingPrepBrief(workspaceId: string, dealId: string, meetingId: string): Promise<void>`.

1. Assemble light-tier context via `assembleContext(workspaceId, dealId, "light")`
2. Additionally load the specific meeting record from `calendar_events` table (Phase 2 schema): attendees, title, start_time
3. Prompt:
   ```
   You are a sales coach. Write a meeting prep brief for the following upcoming deal meeting.

   Return JSON with keys: meeting_overview (title, attendees, time), recent_activity_summary, talking_points (array of 3-5), objection_handling (array of {objection, response}), key_questions_to_ask (array of 3).

   Keep the brief concise — it will be read 30 minutes before the meeting.

   Deal context:
   {context}

   Meeting: {meetingTitle} with {attendees} at {startTime}
   ```
4. Call `createDraftAsset(workspaceId, dealId, "meeting_prep", content, model, "1.0.0", { meetingId })`.

**Cron worker** (`app/api/v1/cron/meeting-prep/route.ts`):

```typescript
export async function GET(req: Request) {
  // Verify CRON_SECRET header

  // Find calendar events starting in 25-35 minutes (the T-30min window)
  // FROM calendar_events WHERE start_time BETWEEN now() + 25min AND now() + 35min
  //   AND workspace_id IS NOT NULL
  //   AND record_id IS NOT NULL (linked to a deal)
  //   AND NOT EXISTS (
  //     SELECT 1 FROM generated_assets
  //     WHERE record_id = calendar_events.record_id
  //       AND asset_type = 'meeting_prep'
  //       AND metadata->>'meetingId' = calendar_events.id
  //       AND generated_at > now() - interval '2 hours'
  //   )

  // For each qualifying meeting: enqueue ai_generate job
  //   { documentType: "meeting_prep", recordId: event.recordId, meetingId: event.id, contextTier: "light" }

  // Return 200 with { scheduled: N }
}
```

Add to `vercel.json` crons: `{ "path": "/api/v1/cron/meeting-prep", "schedule": "* * * * *" }` (run every minute so the 25-35 min window catches every meeting).

**Verify:** Create a calendar_events row with `start_time = now() + 30min` linked to a deal record. Trigger the cron manually — verify a background_jobs row appears for meeting_prep. Execute the generate cron — verify a `generated_assets` row appears with `asset_type: "meeting_prep"`.

**Done:** Meeting prep brief appears for upcoming deal meetings. Deduplication check prevents double-generation.

---

### Task 2: Post-meeting follow-up generator + automation wiring

**Files:** `apps/web/src/services/documents/followup.ts` (extend), `apps/web/src/services/automation-engine.ts` (extend)

**Action:**

**Add to `services/documents/followup.ts`:**

Export `generatePostMeetingFollowup(workspaceId: string, dealId: string, triggerContext: { type: "meeting_ended" | "note_added", noteText?: string }): Promise<void>`.

1. Assemble light-tier context
2. If `noteText` is provided (meeting notes just added), include it in the prompt as "Meeting notes from today's call"
3. Prompt:
   ```
   You are a sales assistant. Write a post-meeting follow-up email draft.

   Return JSON with keys: subject_line, email_body (markdown), internal_next_steps (array of task descriptions with suggested due dates).

   The email should: thank the prospect, recap key points discussed, confirm agreed next steps, set a clear call-to-action.

   Do not invent specific commitments not mentioned in the context. Use [FILL IN] for gaps.

   Deal context:
   {context}

   {if noteText: Meeting notes: {noteText}}
   ```
4. Call `createDraftAsset(workspaceId, dealId, "followup", content, model, "1.0.0", { triggerType })`.

**Extend `services/automation-engine.ts` `evaluateSignalForGeneration()`:**

Add rules:
- `signal.type === "meeting_ended"` AND signal has `recordId` → enqueue `ai_generate` job with `{ documentType: "followup", recordId, contextTier: "light", triggerType: "meeting_ended" }`
- `signal.type === "note_added"` AND signal payload has a dealId AND note text length > 100 characters → enqueue `ai_generate` job with `{ documentType: "followup", recordId, contextTier: "light", triggerType: "note_added", noteText: signal.payload.noteText.substring(0, 500) }`

The note_added rule prevents tiny notes ("quick call") from triggering a follow-up. 100 character minimum ensures meaningful content.

**Verify:** Add a note longer than 100 characters to a deal record. Verify a `signal_events` row appears with `type: "note_added"`. Verify automation engine creates a background_jobs row for follow-up generation. Run the generate cron — verify `generated_assets` row with `asset_type: "followup"` appears.

**Done:** Follow-up drafts auto-generate from meeting signals and note additions. Rep sees them in the inbox.

---

## 03-04: Competitive Battlecard Generator

```
---
phase: 03
plan: 04
type: execute
wave: 2
depends_on: [03-01]
files_modified:
  - apps/web/src/services/documents/battlecard.ts
  - apps/web/src/services/competitor-detector.ts
  - apps/web/src/app/(dashboard)/battlecards/page.tsx
  - apps/web/src/app/api/v1/battlecards/route.ts
  - apps/web/src/services/automation-engine.ts
autonomous: true
requirements: [AGEN-06]
must_haves:
  truths:
    - "When a competitor name is detected in deal notes, emails, or transcripts, a battlecard job is enqueued"
    - "Battlecard generates with workspace-scoped competitive positioning"
    - "Workspace battlecard library page shows all approved battlecards by competitor"
  artifacts:
    - path: "apps/web/src/services/competitor-detector.ts"
      provides: "Rule-based competitor mention detection (Tier 1, no LLM)"
      exports: ["detectCompetitors"]
    - path: "apps/web/src/services/documents/battlecard.ts"
      provides: "Battlecard generator (full tier)"
      exports: ["generateBattlecard"]
    - path: "apps/web/src/app/(dashboard)/battlecards/page.tsx"
      provides: "Workspace battlecard library"
  key_links:
    - from: "competitor-detector.ts"
      to: "automation-engine.ts"
      via: "Called on note_added and email_received signals; returns detected competitor names"
    - from: "automation-engine"
      to: "ai_generate job with documentType: battlecard + competitorName"
      via: "Tier 1 rule match triggers Tier 3 full generation job"
---
```

### Task 1: Competitor detector + battlecard generator

**Files:** `apps/web/src/services/competitor-detector.ts`, `apps/web/src/services/documents/battlecard.ts`, `apps/web/src/services/automation-engine.ts` (extend)

**Action:**

**`services/competitor-detector.ts`:**

Export `detectCompetitors(text: string, workspaceId: string): Promise<string[]>`.

Implementation (Tier 1 — no LLM, pure string matching):
1. Load workspace competitors list. Store as a workspace setting in `workspaces.settings.competitors` (array of strings). Default to a common CRM competitors list: `["Salesforce", "HubSpot", "Pipedrive", "Zoho", "Close", "Monday Sales CRM"]`. Admin can edit this list.
2. Case-insensitive substring match each competitor name against `text`
3. Return array of matched competitor names (deduplicated)

This is Tier 1 — no LLM call. Zero cost. Fast.

**`services/documents/battlecard.ts`:**

Export `generateBattlecard(workspaceId: string, dealId: string, competitorName: string): Promise<void>`.

1. Assemble full-tier context via `assembleContext(workspaceId, dealId, "full")`
2. Prompt:
   ```
   You are a competitive intelligence analyst. Generate a battlecard for the following competitor.

   Return JSON with keys:
   - competitor_name
   - competitor_overview (2-3 sentences)
   - their_strengths (array of 4-6 items)
   - their_weaknesses (array of 4-6 items)
   - our_advantages (array of 4-6 items: how OpenClaw is better)
   - objection_handling (array of {their_claim, our_response})
   - discovery_questions (array of 3-5 questions to ask when this competitor is mentioned)

   Competitor: {competitorName}
   Deal context (use to tailor the messaging to this specific deal):
   {context}

   Note: If you do not have reliable knowledge about this competitor, say so in competitor_overview and focus on the discovery questions.
   ```
3. Check for existing approved battlecard for this competitor in this workspace. If one exists that was approved in the last 30 days, skip generation (battlecards have a freshness window — no need to regenerate frequently). Log skip.
4. Call `createDraftAsset(workspaceId, dealId, "battlecard", content, model, "1.0.0", { competitorName })`.

**Extend `automation-engine.ts` `evaluateSignalForGeneration()`:**

Add rules:
- On `signal.type === "note_added"` OR `"email_received"`: call `detectCompetitors(signal.payload.text, workspaceId)`. For each detected competitor: enqueue `ai_generate` job with `{ documentType: "battlecard", recordId, competitorName, contextTier: "full" }`.

**Verify:** Add a note to a deal containing "they're also looking at Salesforce." Verify `detectCompetitors()` returns `["Salesforce"]`. Verify a `background_jobs` row appears for battlecard generation. Run the cron — verify `generated_assets` row with `asset_type: "battlecard"` and `metadata.competitorName: "Salesforce"`.

**Done:** Competitor detection runs on every note add and email receive. Battlecard enqueued when competitor detected.

---

### Task 2: Battlecard library UI

**Files:** `apps/web/src/app/(dashboard)/battlecards/page.tsx`, `apps/web/src/app/api/v1/battlecards/route.ts`

**Action:**

**`GET /api/v1/battlecards`** — `getAuthContext` → query `generated_assets WHERE workspace_id = ? AND asset_type = "battlecard" AND status = "approved" ORDER BY approved_at DESC`. Return list. Supports `?competitor=` filter.

**`/battlecards` page:**

Server component. Renders a list of approved battlecards grouped by competitor name. Each card shows:
- Competitor name (large heading)
- Last updated date
- A summary of key advantages (2-3 bullet points from `content.our_advantages`)
- "View full battlecard" button → opens a Sheet with full structured content

Use shadcn Card, Sheet, Badge components.

Add `/battlecards` to dashboard sidebar navigation (after `/inbox`).

**Verify:** Approve a battlecard draft from the inbox. Navigate to `/battlecards` — the approved battlecard appears with competitor name and key advantages.

**Done:** Approved battlecards are discoverable in the workspace library.

---

## 03-05: Email Sequences

```
---
phase: 03
plan: 05
type: execute
wave: 2
depends_on: [03-01]
files_modified:
  - apps/web/src/db/schema/sequences.ts
  - apps/web/src/db/schema/index.ts
  - apps/web/src/services/email-sequences.ts
  - apps/web/src/app/api/v1/sequences/route.ts
  - apps/web/src/app/api/v1/sequences/[id]/route.ts
  - apps/web/src/app/api/v1/sequences/[id]/enroll/route.ts
  - apps/web/src/app/api/v1/cron/sequences/route.ts
  - apps/web/src/app/(dashboard)/sequences/page.tsx
  - apps/web/src/app/(dashboard)/sequences/[id]/page.tsx
autonomous: true
requirements: [SEQN-01, SEQN-02, SEQN-03, SEQN-04, SEQN-05]
must_haves:
  truths:
    - "Rep can create a multi-step sequence template with AI-suggested step content"
    - "Rep can enroll contacts into a sequence"
    - "Sequence steps execute on schedule via cron job"
    - "Sequence stops when a recipient replies (via reply detection signal)"
    - "Rep can view open rate, reply rate, and step completion metrics"
  artifacts:
    - path: "apps/web/src/db/schema/sequences.ts"
      provides: "sequences, sequence_steps, sequence_enrollments, sequence_metrics tables"
    - path: "apps/web/src/services/email-sequences.ts"
      provides: "Sequence CRUD, enrollment, step execution, reply detection, metrics"
      exports: ["createSequence", "enrollContact", "advanceSequenceStep", "stopEnrollment", "getSequenceMetrics"]
    - path: "apps/web/src/app/api/v1/cron/sequences/route.ts"
      provides: "Cron: dequeues pending sequence steps and executes sends"
  key_links:
    - from: "email_received signal"
      to: "stopEnrollment()"
      via: "automation-engine checks if sender is enrolled in a sequence as recipient"
    - from: "sequence step execution"
      to: "email_send job (Phase 1 job queue)"
      via: "enqueues email_send job; email goes to draft in approval inbox, not auto-sent"
---
```

### Task 1: Sequence schema + service

**Files:** `apps/web/src/db/schema/sequences.ts`, `apps/web/src/db/schema/index.ts`, `apps/web/src/services/email-sequences.ts`

**Action:**

**`db/schema/sequences.ts`:**

```typescript
// sequences table
// id, workspaceId, name, description, status: "active" | "archived"
// steps (array of steps stored as jsonb) OR separate steps table

// sequence_steps table
// id, sequenceId, workspaceId, stepNumber, delayDays, subject (template), body (template)
// variant: "a" | "b" (for A/B testing, SEQN-04)
// variantWeight: number (0-100, percent of enrollments that get this variant)

// sequence_enrollments table
// id, sequenceId, contactRecordId, workspaceId
// status: "active" | "completed" | "stopped" | "bounced"
// currentStep: integer (which step they're on)
// nextStepAt: timestamp (when to send next step)
// stoppedReason: text nullable ("replied" | "unsubscribed" | "bounced" | "manual")
// enrolledAt, stoppedAt

// sequence_step_sends table
// id, enrollmentId, stepId, sentAt, status: "draft" | "sent" | "failed"
// emailFrom, emailTo, subject, body (personalized content)
// opened: boolean, clicked: boolean, replied: boolean
```

**`services/email-sequences.ts`:**

Export `createSequence(workspaceId, name, steps: StepTemplate[]): Promise<Sequence>` — inserts sequence + steps.

Export `enrollContact(sequenceId, contactRecordId, workspaceId): Promise<Enrollment>` — inserts enrollment with `status: "active"`, `currentStep: 0`, `nextStepAt: now() + step[0].delayDays * days`. A/B variant assigned at enrollment: random roll against `variantWeight`.

Export `advanceSequenceStep(enrollmentId): Promise<void>`:
1. Load enrollment + current step
2. Generate personalized email content: call OpenRouter with light-tier context to personalize the step template (`{contactName}`, `{companyName}`, etc.)
3. Create a `sequence_step_sends` row with `status: "draft"` — this creates a `generated_assets` row via `createDraftAsset()` with `asset_type: "followup"` (re-used asset type, or add "sequence_step" if clearer)
4. The draft appears in the approval inbox — rep must approve before send
5. After approval (separate route), enqueue an `email_send` job to send via the workspace's connected email provider
6. Update enrollment: `currentStep++`, calculate `nextStepAt = now() + nextStep.delayDays * days`
7. If no next step: `status: "completed"`

Export `stopEnrollment(enrollmentId, reason: string): Promise<void>` — sets `status: "stopped"`, `stoppedReason: reason`, `stoppedAt: now()`.

Export `getSequenceMetrics(sequenceId, workspaceId): Promise<SequenceMetrics>`:
- Total enrolled, active, completed, stopped
- Per-step: sent count, open rate (opened/sent), reply rate (replied/sent), click rate
- Overall reply rate triggers stopEnrollment — surface this as the primary conversion metric

**Extend `automation-engine.ts`:** On `signal.type === "email_received"`:
- Check if the sender email matches a contact who is enrolled in a sequence (`sequence_enrollments` WHERE `status = "active"`)
- If yes: call `stopEnrollment(enrollmentId, "replied")`

This implements SEQN-03 (auto-stop on reply).

Run `pnpm db:push`.

**Verify:** `createSequence()` creates a sequence with steps. `enrollContact()` creates an enrollment. Check that `nextStepAt` is calculated correctly. `stopEnrollment()` transitions status to "stopped".

**Done:** Schema created, core service functions implemented, reply detection auto-stop wired.

---

### Task 2: Sequence API routes + UI + cron

**Files:** `apps/web/src/app/api/v1/sequences/route.ts`, `apps/web/src/app/api/v1/sequences/[id]/route.ts`, `apps/web/src/app/api/v1/sequences/[id]/enroll/route.ts`, `apps/web/src/app/api/v1/cron/sequences/route.ts`, `apps/web/src/app/(dashboard)/sequences/page.tsx`, `apps/web/src/app/(dashboard)/sequences/[id]/page.tsx`

**Action:**

**API routes:**

`GET /api/v1/sequences` — list workspace sequences (name, step count, enrolled count, status).

`POST /api/v1/sequences` — create sequence. Body: `{ name, description, steps: [{stepNumber, delayDays, subject, body, variant, variantWeight}] }`.

`GET /api/v1/sequences/[id]` — get sequence with steps and enrollment count.

`PUT /api/v1/sequences/[id]` — update name/description/status (archive).

`POST /api/v1/sequences/[id]/enroll` — enroll contacts. Body: `{ contactRecordIds: string[] }`. Calls `enrollContact()` for each.

`GET /api/v1/sequences/[id]/metrics` — returns `getSequenceMetrics()`.

**Cron worker** (`app/api/v1/cron/sequences/route.ts`):

```typescript
export async function GET(req: Request) {
  // Verify CRON_SECRET
  // Find enrollments WHERE status = "active" AND nextStepAt <= now()
  // For each: call advanceSequenceStep(enrollment.id) — creates draft in inbox
  // Mark enrollment nextStepAt advanced (done inside advanceSequenceStep)
  // Return 200 with { advanced: N }
}
```

Add to `vercel.json`: `{ "path": "/api/v1/cron/sequences", "schedule": "*/5 * * * *" }` (every 5 minutes for sequence step execution).

**Sequences list page** (`/sequences`): Table of all workspace sequences. Columns: Name, Steps, Enrolled, Reply Rate, Status. "Create Sequence" button → opens a Dialog form. Add to sidebar nav.

**Sequence detail page** (`/sequences/[id]`): Shows step list with delay days and content. Metrics section: total enrolled, reply rate per step (progress bars). "Enroll Contacts" button → opens a contact picker (search by name, multi-select).

Use shadcn Table, Dialog, Input, Textarea, Progress components.

**Verify:** Create a sequence via POST. Enroll a contact. Verify `nextStepAt` is set. Manually set `nextStepAt` to past. Trigger the sequences cron — verify `advanceSequenceStep()` is called and a draft appears in the inbox. Verify metrics endpoint returns correct counts.

**Done:** Full sequence CRUD works. Cron advances steps. Drafts appear in inbox. Metrics are queryable.

---

## 03-06: Lead Scoring + Inbound Capture

```
---
phase: 03
plan: 06
type: execute
wave: 2
depends_on: [03-01]
files_modified:
  - apps/web/src/services/lead-scoring.ts
  - apps/web/src/app/api/v1/cron/scores/route.ts
  - apps/web/src/app/api/v1/forms/route.ts
  - apps/web/src/app/api/v1/forms/[formId]/route.ts
  - apps/web/src/app/api/v1/forms/[formId]/submit/route.ts
  - apps/web/src/app/(dashboard)/settings/forms/page.tsx
  - apps/web/src/db/schema/forms.ts
  - apps/web/src/db/schema/index.ts
autonomous: true
requirements: [LEAD-01, LEAD-02, LEAD-03, LEAD-04]
must_haves:
  truths:
    - "Each deal/contact record has a numeric lead score (0-100) stored as an EAV number_value"
    - "Clicking into a lead shows a plain-language AI explanation of the score"
    - "A publicly accessible form URL creates a People record + Company record on submission"
    - "Submitted lead gets a lead score assigned within 2 cron cycles"
  artifacts:
    - path: "apps/web/src/services/lead-scoring.ts"
      provides: "Weighted scoring engine + AI explanation generator"
      exports: ["scoreRecord", "getScoreExplanation"]
    - path: "apps/web/src/db/schema/forms.ts"
      provides: "web_forms table: id, workspaceId, name, fields config, active"
    - path: "apps/web/src/app/api/v1/forms/[formId]/submit/route.ts"
      provides: "Public (no auth) form submission endpoint"
  key_links:
    - from: "form submission"
      to: "records.ts createRecord()"
      via: "Creates People record + optional Company record from form fields"
    - from: "record_created signal"
      to: "lead scoring cron"
      via: "Enqueues lead_score job"
    - from: "scoreRecord()"
      to: "record_values table"
      via: "Writes score as number_value for a 'lead_score' attribute on the object"
---
```

### Task 1: Lead scoring engine

**Files:** `apps/web/src/services/lead-scoring.ts`, `apps/web/src/app/api/v1/cron/scores/route.ts`

**Action:**

**`services/lead-scoring.ts`:**

Export `scoreRecord(workspaceId: string, recordId: string): Promise<number>`.

The scoring engine uses a weighted formula. Scoring dimensions:

| Dimension | Max Points | How Measured |
|-----------|------------|--------------|
| Title/role fit | 20 | Check `title` attribute against workspace ICP title list (stored in `workspaces.settings.icpTitles`). Exact match: 20, partial: 10, no match: 0 |
| Company size fit | 15 | Check `company_size` attribute against workspace ICP size range (`settings.icpCompanySize`). In range: 15, adjacent: 7, no data: 0 |
| Email engagement | 20 | Count email opens (from `signal_events WHERE type="email_opened" AND record_id=?` in last 30 days). 1-2 opens: 10, 3-5: 15, 6+: 20 |
| Meeting attended | 20 | `signal_events WHERE type="meeting_attended"`. Any meeting: 15, 2+ meetings: 20 |
| Deal stage velocity | 15 | How many stage advances in 30 days. 1: 8, 2+: 15 |
| Data completeness | 10 | Count non-null attribute values / total attributes. >70%: 10, 40-70%: 5, <40%: 0 |

Total score = sum of dimensions, clamped to 0-100.

Write score as EAV `number_value` on the record: find or create a `lead_score` attribute on the object (if it doesn't exist, create it with `type: "number"`). Update via `records.ts` attribute write pattern.

Export `getScoreExplanation(workspaceId: string, recordId: string): Promise<string>`.

This is a light-tier LLM call:
```
You are a sales intelligence tool. Explain this lead score in plain language.

Score: {score}/100
Scoring breakdown:
- Title fit: {points}/20 — {reason}
- Company size fit: {points}/15 — {reason}
- Email engagement: {points}/20 — {opens} opens in last 30 days
- Meeting attended: {points}/20 — {met or not}
- Stage velocity: {points}/15 — {advances} stage advances
- Data completeness: {points}/10 — {completePct}% of fields filled

Write one sentence per dimension that scored above 0. Write a 2-sentence overall assessment. Total 4-6 sentences. Plain language, no jargon.
```

Store the explanation in `workspaces.settings` or as a note on the record? Store as a `text_value` EAV attribute named `lead_score_explanation`. Update on every rescore.

**Cron worker** (`app/api/v1/cron/scores/route.ts`):

```typescript
export async function GET(req: Request) {
  // Verify CRON_SECRET
  // Dequeue pending lead_score jobs (from background_jobs table, max 20 per cron)
  // For each: scoreRecord(workspaceId, recordId) then getScoreExplanation()
  // Mark job complete
  // Return 200 with { scored: N }
}
```

Add to `vercel.json`: `{ "path": "/api/v1/cron/scores", "schedule": "*/10 * * * *" }` (every 10 minutes).

**Extend `automation-engine.ts`:** On `signal.type === "record_created"` where objectType is "people" or inferred contact/lead: enqueue `lead_score` job.

**Verify:** Call `scoreRecord(workspaceId, recordId)` on a People record — returns a number 0-100. Verify `lead_score` EAV attribute is written to the record. Call `getScoreExplanation()` — returns 4-6 plain-language sentences.

**Done:** Scoring engine computes and stores scores. AI explanation generated and stored per record.

---

### Task 2: Inbound web form capture

**Files:** `apps/web/src/db/schema/forms.ts`, `apps/web/src/db/schema/index.ts`, `apps/web/src/app/api/v1/forms/route.ts`, `apps/web/src/app/api/v1/forms/[formId]/route.ts`, `apps/web/src/app/api/v1/forms/[formId]/submit/route.ts`, `apps/web/src/app/(dashboard)/settings/forms/page.tsx`

**Action:**

**`db/schema/forms.ts`:**

```typescript
// web_forms table
// id (uuid), workspaceId, name, description
// fields: jsonb — array of { name, label, type: "text"|"email"|"tel"|"company", required: bool }
// targetObjectSlug: text (which object to create on submit, default: "people")
// active: boolean
// createdAt, updatedAt
```

**Public submit endpoint** (`/api/v1/forms/[formId]/submit` — no auth required, this is public):

```typescript
export async function POST(req: Request, { params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;

  // Load form by ID — no auth context needed (public endpoint)
  // Validate form is active
  // Parse submission body: { [fieldName]: value }
  // Validate required fields

  // Map form fields to record values:
  // - "email" field → email attribute on People object
  // - "name" → name attribute
  // - "company" → create/find Company record first, then set reference
  // - Other fields → text attribute by field name

  // Create record via createRecord(objectId, values, "form-submission")
  // Enqueue lead_score job for new record
  // Enqueue signal_events row: type: "record_created", source: "web_form", formId

  // Return 200 { success: true } — no redirect, form handles success state
}
```

This endpoint has no `getAuthContext` because it's public. Rate-limit by formId using a simple in-memory counter per minute (or skip rate limiting for v1 and add later).

**Settings forms page** (`/settings/forms`):

Server component showing workspace forms. "Create Form" button → Dialog with name, description, and a field builder (add/remove/reorder fields, set required). Each form shows its embed code:

```html
<!-- Embed code shown to the user -->
<script>
  const form = document.createElement('form');
  form.action = 'https://your-crm.com/api/v1/forms/{formId}/submit';
  form.method = 'POST';
  // ...
</script>
```

Or simpler: show a raw URL to POST to and a JSON example. No custom embed JavaScript in v1 — just the API endpoint URL and field names.

For LEAD-04 (email parsing): add a note in the UI that inbound email forwarding can be set up to POST to the form endpoint. Do NOT build an email parser in v1 — the form endpoint is sufficient to satisfy the requirement's spirit for initial launch, and full email-to-lead parsing is an extension.

**Verify:** Create a form via the settings page. POST to `/api/v1/forms/[formId]/submit` with `{ name: "Jane Doe", email: "jane@example.com", company: "Acme" }` — verify a People record is created. Verify a `background_jobs` row appears for lead scoring. Run the scores cron — verify `lead_score` attribute appears on the record.

**Done:** Web forms create records on submission. Lead score assigned automatically. Form management in settings.

---

## Phase-Level Verification

After all plans complete, verify the phase success criteria:

1. **Opportunity brief on deal creation:**
   - Create a deal with name + company + amount
   - Within 2 minutes: verify `generated_assets` row with `asset_type: "opportunity_brief"` and `status: "draft"`
   - Navigate to `/inbox` — brief appears
   - Approve brief — `status` changes to `"approved"`, brief disappears from inbox

2. **Stage-triggered proposal:**
   - Advance deal stage to a name containing "proposal"
   - Within 2 minutes: verify `generated_assets` row with `asset_type: "proposal"` and `status: "draft"`
   - Brief and proposal both in inbox

3. **Meeting prep brief T-30min:**
   - Create a `calendar_events` row linked to a deal with `start_time = now() + 30min`
   - Trigger meeting-prep cron
   - Verify `generated_assets` row with `asset_type: "meeting_prep"` created

4. **Email sequence:**
   - Create a 3-step sequence (step 1 immediate, step 2 at day 3, step 3 at day 7)
   - Enroll a contact
   - Verify `sequence_enrollments` row with `status: "active"` and `nextStepAt = now()`
   - Trigger sequences cron — verify step 1 draft appears in inbox
   - Approve step 1 — verify email_send job enqueued

5. **Lead scoring:**
   - Create a People record via form submission
   - Trigger scores cron
   - Verify `lead_score` attribute written with a numeric value 0-100
   - Verify `lead_score_explanation` attribute written with plain English text

---

## Implementation Sequence Within Phase

Execute in this order to respect dependencies:

1. **03-01 first** (wave 1) — all other plans need the schema and registry
2. **03-02, 03-03, 03-04, 03-05, 03-06 in parallel** (wave 2) — independent of each other, all depend only on 03-01

After all wave 2 plans complete, run the phase-level verification above.

---

## Deferred / Out of Scope for Phase 3

Per research and roadmap, the following are explicitly deferred:

- **LEAD-04 (email parsing):** Inbound web form (LEAD-03) is the v1 implementation. Full email-to-lead parsing requires an inbound email webhook and parser — deferred to v1.x.
- **A/B statistical significance testing (SEQN-04):** Schema supports A/B variants; metrics track per-variant open/reply rates. Statistical significance calculation deferred to Phase 5 analytics.
- **`@react-pdf/renderer` PDF output:** Proposals and decks are stored as structured JSON in Phase 3. PDF rendering is built in Phase 4 (contract generation) when `@react-pdf/renderer` is installed. Phase 3 renders structured content via the UI.
- **`pptxgenjs` deck export:** Same as above — JSON structured content in Phase 3; actual PPTX file export in Phase 4.
- **Approval workflow engine (Phase 4):** The approval inbox in Phase 3 is a lightweight draft review UI. The full configurable approval workflow (discount routing, legal review) is Phase 4.
- **LinkedIn competitor signals:** Battlecard detection uses notes/emails only in Phase 3. Call transcript detection added in Phase 4 (telephony).

---

## Critical Implementation Guards

From research pitfalls — these must be true at the end of Phase 3:

- [ ] No LLM call inside any CRUD service function (all generation runs inside cron worker jobs)
- [ ] Every proactive AI output has `status: "draft"` before the rep sees it — no auto-send
- [ ] `buildSystemPrompt` from `ai-chat.ts` is NOT called in any generator — `assembleContext()` only
- [ ] `context_tier` is set in every `ai_generate` job payload before the job is created
- [ ] All `generated_assets` rows are workspace-scoped — no cross-workspace leakage possible
- [ ] Public form endpoint (`/api/v1/forms/[formId]/submit`) has no auth but has form existence/active check to prevent SSRF-style abuse
- [ ] Competitor detection is pure string matching (Tier 1) — no LLM call in the detection step
- [ ] Sequence step execution creates a draft in the inbox first — the rep approves before any email sends
