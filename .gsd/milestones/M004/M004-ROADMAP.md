# M004: Company / Business Unit Hierarchy & Intelligent Agency

**Vision:** Transform the flat workspace model into a Company → Business Unit hierarchy with an Intelligent Agency layer for cross-entity joint opportunities, enabling roll-up visibility and multi-org collaboration.

## Success Criteria

- A Company workspace (e.g. "Seawolf") can contain multiple Business Unit sub-workspaces
- Viewing at Company level aggregates records from all child BUs
- Joint opportunities live in an Intelligent Agency workspace and track participating entities
- Existing single workspaces continue to function without changes (backward compatible)
- Workspace switcher shows hierarchy and allows switching between Company/BU views
- The `getAuthContext()` pipeline correctly scopes queries to the active hierarchy level

## Key Risks / Unknowns

- **Data model ripple** — `workspace_id` is referenced across 20+ tables. The hierarchy must layer above existing FKs without breaking them. High risk if we get this wrong in S01.
- **Roll-up query performance** — Company-level views query across multiple child workspaces through the EAV model. Could be slow with many BUs.
- **Joint opportunity data model** — Whether Agency-owned records with a junction table is the right pattern, or if shared references would be cleaner.

## Proof Strategy

- **Data model ripple** → retire in S01 by proving: schema migration applies cleanly, existing workspace CRUD works unchanged, Company+BU creation works, no FK violations
- **Roll-up query performance** → retire in S03 by proving: Company-level record list loads correctly across 2+ BUs with acceptable performance
- **Joint opportunity data model** → retire in S04 by proving: Agency records with junction participants work end-to-end (create, view from each participant, pipeline)

## Verification Classes

- Contract verification: E2E Playwright tests for key flows (create hierarchy, switch views, joint opportunity CRUD)
- Integration verification: Existing record CRUD, pipeline, dashboard, and AI chat work within new hierarchy
- Operational verification: Workspace switching is responsive, roll-up queries complete within acceptable time
- UAT / human verification: Workspace switcher UX is intuitive, hierarchy is clear

## Milestone Definition of Done

This milestone is complete only when all are true:

- Schema migrations applied with zero data loss on existing workspaces
- Company → BU → Record hierarchy works end-to-end
- Intelligent Agency with joint opportunities works end-to-end
- Existing flat workspaces work exactly as before (treated as standalone Companies)
- Workspace switcher shows hierarchy and supports Company-level vs BU-level views
- Roll-up views correctly aggregate child BU data at Company level
- E2E tests cover the critical paths

## Requirement Coverage

- Covers: New requirements (R-HIERARCHY, R-AGENCY, R-JOINT-OPP — to be formalized)
- Partially covers: Existing multi-tenancy requirements (enhanced with hierarchy)
- Leaves for later: Advanced hierarchy permissions (RBAC), revenue attribution for joint deals, Company-level object templates

## Slices

- [x] **S01: Workspace Hierarchy Schema & Core API** `risk:high` `depends:[]`
  > After this: Company and BU workspaces can be created via API, existing workspaces are auto-typed as 'company', parent-child relationships are stored and queryable, the migration is proven safe

- [x] **S02: Hierarchy-Aware Auth Context & Workspace Switching** `risk:high` `depends:[S01]`
  > After this: `getAuthContext()` returns workspace type and child IDs, the workspace switcher API supports hierarchy-aware switching, the cookie correctly tracks Company vs BU level context

- [x] **S03: Company Roll-Up Views & BU Scoping** `risk:medium` `depends:[S02]`
  > After this: Viewing records at Company level aggregates data from all child BUs, viewing at BU level shows only that BU's data, the query builder handles multi-workspace scoping

- [x] **S04: Intelligent Agency & Joint Opportunities** `risk:medium` `depends:[S01]`
  > After this: An Agency workspace exists with its own pipeline, deals can be created as joint opportunities with participating entities tracked via junction table, joint deals show participation info

- [x] **S05: Workspace Hierarchy UI** `risk:medium` `depends:[S02, S04]`
  > After this: Sidebar workspace switcher displays Company → BU hierarchy, users can switch between Company-level and BU-level views, Agency workspace is accessible, create-workspace flow supports BU creation under a Company

- [x] **S06: Joint Opportunity Cross-Visibility & Integration** `risk:low` `depends:[S03, S04, S05]`
  > After this: Joint opportunities appear in each participating entity's pipeline view with a badge, Company roll-up includes Agency joint deals, dashboard metrics include joint opportunity data, E2E tests prove the full integrated flow

## Boundary Map

### S01 → S02

Produces:
- `workspace_type` enum ('company', 'business_unit', 'agency') on `workspaces` table
- `parent_workspace_id` self-referential FK on `workspaces` table
- `getChildWorkspaces(workspaceId)` service function returning child workspace IDs
- `getWorkspaceWithHierarchy(workspaceId)` service returning workspace + parent + children
- API endpoints: `POST /api/v1/workspaces` extended with `type` and `parentWorkspaceId` params
- Updated `WorkspaceType` shared type

Consumes:
- nothing (first slice)

### S01 → S04

Produces:
- `workspace_type` enum including 'agency' type
- Ability to create Agency-typed workspaces
- `is_joint_eligible` flag on workspaces

Consumes:
- nothing (first slice)

### S02 → S03

Produces:
- Extended `AuthContext` with `workspaceType`, `parentWorkspaceId`, `childWorkspaceIds`
- `resolveWorkspaceScope(authContext)` returning array of workspace IDs to query
- Workspace switching API that sets correct context for Company vs BU level

Consumes:
- S01 schema and hierarchy service functions

### S02 → S05

Produces:
- `listUserWorkspacesWithHierarchy(userId)` returning grouped Company → BU structure
- Workspace switch endpoint handling hierarchy context

Consumes:
- S01 schema and hierarchy service functions

### S04 → S05

Produces:
- Agency workspace CRUD API
- `joint_opportunity_participants` table and service functions
- API to mark a record as joint and manage participants

Consumes:
- S01 workspace hierarchy schema

### S03, S04, S05 → S06

Produces:
- Roll-up query capability (S03)
- Joint opportunity data + API (S04)
- Hierarchy UI + switching (S05)

Consumes:
- All prior slices — this is the integration slice
