# S01: Three-Tier Workspace Schema & Core API

**Goal:** Extend the workspace data model to support Agency → Company → Business Unit hierarchy with correct parent-child constraints, add the deal participation linkage table, and expose hierarchy CRUD via API — all backward compatible with existing workspaces.

**Demo:** Create an Agency workspace → create Companies under it → create BUs under Companies → query hierarchy → existing workspaces still function as standalone Companies.

## Must-Haves

- `workspace_type` enum ('agency', 'company', 'business_unit') on workspaces table
- `parent_workspace_id` self-referential FK on workspaces table
- `deal_participations` table with record/workspace junction + role
- Hierarchy validation (BU parent must be Company, Company parent must be Agency)
- Existing workspaces default to `type: 'company'` with null parent (backward compatible)
- API endpoints for hierarchy CRUD (create workspace with type/parent, list hierarchy)
- Service functions: `getDescendantWorkspaceIds()`, `getWorkspaceWithHierarchy()`
- Shared types exported from `packages/shared`

## Proof Level

- This slice proves: contract
- Real runtime required: yes (database migration + API calls)
- Human/UAT required: no

## Verification

- `pnpm db:push` succeeds with new schema columns
- `pnpm build` passes with no type errors
- Manual API test: POST create agency → POST create company under agency → POST create BU under company → GET hierarchy returns correct tree
- Existing workspace CRUD still works (create workspace without type defaults to company)

## Observability / Diagnostics

- Runtime signals: API returns clear error messages for invalid hierarchy (e.g. "BU parent must be a company")
- Inspection surfaces: `GET /api/v1/workspaces` returns type and parent info; `GET /api/v1/workspaces/:id/hierarchy` returns full tree
- Failure visibility: 400 status with specific error codes for hierarchy constraint violations
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: existing `workspaces`, `workspace_members`, `records` schema
- New wiring introduced in this slice: schema columns, new table, shared types, service functions, API extensions
- What remains before the milestone is truly usable end-to-end: S02 (auth context), S03 (roll-up queries), S04 (participation API wiring), S05 (UI), S06 (integration)

## Tasks

- [x] **T01: Schema — Add workspace hierarchy columns + deal participations table** `est:30m`
  - Why: Foundation for everything else. Schema must be right before any service or API code.
  - Files: `apps/web/src/db/schema/workspace.ts`, `apps/web/src/db/schema/deal-participations.ts`, `apps/web/src/db/schema/index.ts`, `packages/shared/src/types/workspaces.ts`, `packages/shared/src/index.ts`
  - Do: Add `workspaceTypeEnum` ('agency', 'company', 'business_unit'). Add `type` and `parentWorkspaceId` columns to `workspaces`. Create `dealParticipations` table (id, recordId, workspaceId, role, notes, addedAt, addedBy) with unique(recordId, workspaceId). Add indexes. Export `WorkspaceType` and `DealParticipationRole` from shared. 
  - Verify: `pnpm db:push` succeeds, `pnpm build` passes
  - Done when: Schema changes applied to DB, shared types exported, no type errors

- [x] **T02: Service — Workspace hierarchy CRUD functions** `est:45m`
  - Why: Business logic for creating/querying hierarchical workspaces with validation rules
  - Files: `apps/web/src/services/workspace.ts`
  - Do: Add `createWorkspaceWithHierarchy(name, type, parentWorkspaceId, userId)` with validation (agency has no parent, company parent must be agency, BU parent must be company). Add `getWorkspaceWithHierarchy(workspaceId)` returning workspace + parent + direct children. Add `getDescendantWorkspaceIds(workspaceId)` using recursive query. Add `getWorkspaceTree(agencyId)` returning full three-tier tree. Update existing `createWorkspace()` to default type='company'. Update `listUserWorkspaces()` to include type and parentWorkspaceId.
  - Verify: Build passes, functions are importable and typed correctly
  - Done when: All hierarchy service functions exist with correct validation and return types

- [x] **T03: Service — Deal participation CRUD functions** `est:30m`
  - Why: Service layer for managing deal participation linkages
  - Files: `apps/web/src/services/deal-participations.ts`
  - Do: Create service with: `addParticipation(recordId, workspaceId, role, addedBy)`, `removeParticipation(recordId, workspaceId)`, `getParticipationsForRecord(recordId)` returning workspaces with roles, `getParticipatedRecordIds(workspaceId)` returning record IDs linked to a workspace. Validate that the record exists and the workspace exists before adding.
  - Verify: Build passes, functions are importable and typed correctly
  - Done when: All participation service functions exist with correct types

- [x] **T04: API — Extend workspace endpoints for hierarchy** `est:45m`
  - Why: Expose hierarchy CRUD to the frontend and external consumers
  - Files: `apps/web/src/app/api/v1/workspaces/route.ts`, `apps/web/src/app/api/v1/workspaces/[workspaceId]/hierarchy/route.ts`, `apps/web/src/app/api/v1/workspaces/[workspaceId]/children/route.ts`
  - Do: Extend `POST /api/v1/workspaces` to accept `type` and `parentWorkspaceId` (default type='company' for backward compat). Add `GET /api/v1/workspaces/:id/hierarchy` returning full tree from that workspace down. Add `GET /api/v1/workspaces/:id/children` returning direct children. Extend `GET /api/v1/workspaces` to include type/parent in response. All endpoints use `getAuthContext()` and enforce workspace membership.
  - Verify: `pnpm build` passes, dev server starts, API calls return expected data
  - Done when: Hierarchy API endpoints work correctly with proper auth

- [x] **T05: API — Deal participation endpoints** `est:30m`
  - Why: Expose deal participation CRUD to frontend
  - Files: `apps/web/src/app/api/v1/records/[recordId]/participations/route.ts`
  - Do: Add `GET /api/v1/records/:recordId/participations` returning all participations for a record. Add `POST /api/v1/records/:recordId/participations` to add a workspace as participant (body: {workspaceId, role}). Add `DELETE /api/v1/records/:recordId/participations/:participationId` to remove. Auth: user must be member of the record's home workspace to add/remove participations.
  - Verify: `pnpm build` passes, API calls work
  - Done when: Participation endpoints handle CRUD with auth

- [x] **T06: Smoke test — Verify full hierarchy flow via API** `est:20m`
  - Why: Prove the entire slice works end-to-end against a real database
  - Files: none (manual API testing via dev server)
  - Do: Start dev server. Create Agency workspace. Create Company under Agency. Create BU under Company. Verify hierarchy endpoint returns correct tree. Create a deal record in the BU. Add Agency as participant on that deal. Verify participation shows up. Verify existing workspace creation still defaults to company type.
  - Verify: All API calls return expected responses, no 500 errors
  - Done when: Full hierarchy + participation flow works via API, backward compatibility confirmed

## Files Likely Touched

- `apps/web/src/db/schema/workspace.ts`
- `apps/web/src/db/schema/deal-participations.ts` (new)
- `apps/web/src/db/schema/index.ts`
- `packages/shared/src/types/workspaces.ts` (new)
- `packages/shared/src/index.ts`
- `apps/web/src/services/workspace.ts`
- `apps/web/src/services/deal-participations.ts` (new)
- `apps/web/src/app/api/v1/workspaces/route.ts`
- `apps/web/src/app/api/v1/workspaces/[workspaceId]/hierarchy/route.ts` (new)
- `apps/web/src/app/api/v1/workspaces/[workspaceId]/children/route.ts` (new)
- `apps/web/src/app/api/v1/records/[recordId]/participations/route.ts` (new)
