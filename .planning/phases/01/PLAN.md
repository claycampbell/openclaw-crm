# Phase 1: Async Infrastructure — Master Plan

**Phase:** 01-async-infrastructure
**Goal:** The system can process work asynchronously, emit and consume signal events, store OAuth tokens securely, and hold AI-generated drafts in a reviewable approval inbox — without any of this happening inside synchronous request handlers
**Requirements:** INFR-01, INFR-02, INFR-03, INFR-04, INFR-05, INFR-06, INFR-07
**Plans:** 4 plans across 3 waves

---

## Wave Structure

| Wave | Plan | Objective | Autonomous | Requirements |
|------|------|-----------|------------|--------------|
| 1 | 01-01 | pg-boss job queue — schema, enqueue/process helpers, cron worker, retry/dead-letter | Yes | INFR-01 |
| 2 | 01-02 | Signal event bus — signal_events table, write helpers, stage-change hooks, processed_signals deduplication | Yes | INFR-02, INFR-06 |
| 3 | 01-03 | Automation engine — automation_rules table, rule evaluator, job dispatch on signal match | Yes | INFR-03 |
| 3 | 01-04 | Generated assets table + approval inbox — generated_assets schema, integration_tokens schema, draft lifecycle, review UI | No (checkpoint) | INFR-04, INFR-05, INFR-07 |

Plans 01-03 and 01-04 are both Wave 3 (depend on 01-01 and 01-02 respectively, and both depend on each other in 01-04's case). Execute 01-03 before 01-04 since 01-04 registers the ai_generate handler that references automation output.

---

## Dependency Graph

```
01-01 (job queue)
  └─► 01-02 (signal bus — enqueues signal_evaluate jobs)
        └─► 01-03 (automation engine — registers signal_evaluate handler)
              └─► 01-04 (assets + inbox — registers ai_generate handler, approval UI)
```

Sequential by necessity: each plan consumes types and infrastructure from the prior plan.

---

## Phase Success Criteria

1. **INFR-01**: A background job submitted to the queue is retried automatically on failure and lands in status=failed after exhausting retries — verifiable by triggering a failing job via the cron endpoint
2. **INFR-02**: When a deal stage changes in the CRM, a signal event row appears in the signal_events table — no stage change goes unrecorded
3. **INFR-03**: When a workspace automation rule matches a signal event, an appropriate background job is dispatched — verifiable by creating a rule and advancing a deal stage, then checking background_jobs
4. **INFR-04 + INFR-05**: Rep can open /inbox, see AI-generated draft items, and approve, edit, or reject each one before any customer-facing action occurs
5. **INFR-06**: A duplicate external signal is silently deduplicated via ON CONFLICT DO NOTHING on processed_signals
6. **INFR-07**: integration_tokens table exists with encrypted column design (access_token, refresh_token as encrypted text) and unique index on (workspace_id, user_id, provider)

---

## New Tables Created

| Table | Plan | Purpose |
|-------|------|---------|
| background_jobs | 01-01 | Durable job queue with retry/backoff/dead-letter |
| signal_events | 01-02 | Transactional outbox for all CRM state changes |
| processed_signals | 01-02 | Deduplication for external webhook signals |
| automation_rules | 01-03 | Workspace-scoped rule definitions triggering jobs |
| generated_assets | 01-04 | All AI-generated content with draft lifecycle |
| integration_tokens | 01-04 | Encrypted OAuth token storage for Phase 2 integrations |

---

## New Services Created

| Service | Plan | Key Exports |
|---------|------|-------------|
| services/job-queue.ts | 01-01 | enqueueJob(), processJobs(), registerJobHandler() |
| services/signals.ts | 01-02 | writeSignalEvent(), deduplicateSignal() |
| services/automation-engine.ts | 01-03 | evaluateSignalById() |
| services/generated-assets.ts | 01-04 | createDraft(), listDrafts(), approveDraft(), rejectDraft() |

---

## New API Routes Created

| Route | Plan | Method(s) |
|-------|------|-----------|
| /api/v1/cron/jobs | 01-01 | GET (cron-triggered job worker) |
| /api/v1/automations | 01-03 | GET, POST |
| /api/v1/automations/[id] | 01-03 | PATCH, DELETE |
| /api/v1/assets | 01-04 | GET, POST |
| /api/v1/assets/[id] | 01-04 | GET |
| /api/v1/assets/[id]/approve | 01-04 | POST |
| /api/v1/assets/[id]/reject | 01-04 | POST |

---

## New UI Pages Created

| Route | Plan | Description |
|-------|------|-------------|
| /inbox | 01-04 | Approval inbox — list of pending AI drafts with approve/reject actions |

---

## Critical Patterns Established

These patterns are required for ALL future proactive AI work in Phases 2–5:

1. **No LLM calls in CRUD handlers** — all AI work goes through background_jobs
2. **Signal-first architecture** — every CRM state change writes to signal_events before side effects
3. **Deduplication before processing** — external signals always call deduplicateSignal() first
4. **Draft-first output** — all AI-generated content lands as status=draft in generated_assets
5. **Approval gate** — no customer-facing action occurs without rep approval via the inbox
6. **Workspace scoping** — every table has workspace_id, every query filters by it

---

## Execute Order

```bash
# Wave 1 — independent, run first
/gsd:execute-plan 01-01

# Wave 2 — after 01-01 complete
/gsd:execute-plan 01-02

# Wave 3 — after 01-02 complete, run sequentially
/gsd:execute-plan 01-03
/gsd:execute-plan 01-04
```

---

## End-to-End Verification (Full Phase)

After all four plans are complete, verify the entire async loop:

1. Create an automation rule: POST /api/v1/automations `{name: "Stage→Proposal triggers brief", triggerType: "stage_changed", conditions: [], actionType: "enqueue_ai_generate", actionPayload: {documentType: "opportunity_brief"}}`

2. Advance a deal to a new stage via the CRM UI or PATCH /api/v1/objects/deals/records/[id]

3. Check background_jobs — should have:
   - One row type=signal_evaluate, status=completed (or pending if cron hasn't fired)
   - One row type=ai_generate, status=completed (after cron fires)

4. Check signal_events — should have a stage_changed row with processed_at set

5. Check generated_assets — should have a draft row with assetType=opportunity_brief, status=draft

6. Navigate to /inbox — draft should appear

7. Click Approve — status updates to approved, approved_by and approved_at are set

8. Trigger the same stage change again with the same idempotency key — verify only one ai_generate job is created (deduplication working)

---

*Phase 1 plan created: 2026-03-10*
