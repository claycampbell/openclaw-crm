---
status: complete
started: 2026-03-12
completed: 2026-03-12
---

# S01: Three-Tier Workspace Schema & Core API — Summary

## What was delivered

Extended the flat workspace model into a three-tier hierarchy: **Agency → Company → Business Unit**, with a `deal_participations` junction table for cross-entity deal tracking.

## Schema changes

- Added `workspace_type` enum (`agency`, `company`, `business_unit`) to PostgreSQL
- Added `type` column (default `'company'`) and `parent_workspace_id` self-referential FK to `workspaces` table
- Added indexes on `type` and `parent_workspace_id`
- Created `deal_participations` table with `record_id`, `workspace_id`, `role`, `notes`, `added_at`, `added_by` columns
- Unique constraint on `(record_id, workspace_id)` prevents duplicate participations
- All existing workspaces auto-typed as `company` — zero breaking changes

## Services added/modified

- `workspace.ts` — Added `createWorkspaceWithHierarchy()`, `getWorkspaceWithHierarchy()`, `getDescendantWorkspaceIds()` (recursive CTE), `getWorkspaceTree()`. Extended `listUserWorkspaces()` to include `type` and `parentWorkspaceId`.
- `deal-participations.ts` (new) — `addParticipation()`, `removeParticipation()`, `removeParticipationById()`, `getParticipationsForRecord()`, `getParticipatedRecordIds()`

## API endpoints added/modified

- `POST /api/v1/workspaces` — Extended to accept `type` and `parentWorkspaceId` (backward compatible)
- `GET /api/v1/workspaces/:id/hierarchy` — Returns workspace + parent + children; full tree for agency type
- `GET /api/v1/workspaces/:id/children` — Direct children; `?recursive=true` for all descendants
- `GET /api/v1/records/:id/participations` — List deal participations
- `POST /api/v1/records/:id/participations` — Add participation `{workspaceId, role}`
- `DELETE /api/v1/records/:id/participations` — Remove participation `{workspaceId}`

## Shared types exported

- `WORKSPACE_TYPES`, `WorkspaceType`, `DEAL_PARTICIPATION_ROLES`, `DealParticipationRole`
- `WorkspaceWithHierarchy`, `WorkspaceBasic`, `WorkspaceTree`, `WorkspaceTreeCompany`, `DealParticipation`

## Validation rules enforced

- Agency workspaces cannot have a parent
- Company parent must be an agency (or null for standalone)
- Business unit must have a company parent
- All validated at service layer with clear error messages, surfaced as 400 from API

## Verification

Smoke test script exercised the full flow: create agency → companies → BUs → query hierarchy → query descendants → full tree → validation rejection → deal participations add/query/remove. All passed.

## Key decisions

- Used `db:push` instead of `db:generate + db:migrate` since the migration system was out of sync (prior tables were pushed directly without migrations)
- Agency workspaces don't get seeded standard objects (People/Companies/Deals) — they're organizational containers only
- `deal_participations` uses upsert on conflict to allow role changes without delete/re-add
