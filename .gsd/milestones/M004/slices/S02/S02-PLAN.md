# S02: Hierarchy-Aware Auth Context & Workspace Switching

**Goal:** Extend `AuthContext` with workspace hierarchy info (type, parent, children), add `resolveWorkspaceScope()` for multi-workspace queries, and make workspace listing/switching hierarchy-aware — so downstream slices (S03 roll-up, S05 UI) have the primitives they need.

**Demo:** Auth context includes workspace type + child IDs. `resolveWorkspaceScope()` returns correct scope arrays. Workspace list API returns grouped hierarchy. Workspace switch works for any workspace type. Existing flows unchanged.

## Tasks

- [x] **T01: Extend AuthContext with hierarchy fields** `est:20m`
  - Files: `apps/web/src/lib/api-utils.ts`
  - Do: Add `workspaceType`, `parentWorkspaceId`, `childWorkspaceIds` to `AuthContext` interface. Update `getAuthContext()` to fetch workspace type/parent from DB alongside membership check. Add `resolveWorkspaceScope(ctx)` function that returns `[ctx.workspaceId, ...ctx.childWorkspaceIds]` for company-level views, or just `[ctx.workspaceId]` for BU-level.
  - Verify: `pnpm build` passes, no type errors

- [x] **T02: Add listUserWorkspacesWithHierarchy service** `est:20m`
  - Files: `apps/web/src/services/workspace.ts`
  - Do: Add `listUserWorkspacesWithHierarchy(userId)` that returns workspaces grouped by hierarchy: agencies at top, then standalone companies, then companies under agencies with their BUs nested. Each item includes type and parentWorkspaceId. This powers the workspace switcher UI.
  - Verify: Build passes

- [x] **T03: Update workspace list API to include hierarchy** `est:15m`
  - Files: `apps/web/src/app/api/v1/workspaces/route.ts`
  - Do: Add `?grouped=true` query param to `GET /api/v1/workspaces` that returns the grouped hierarchy structure from `listUserWorkspacesWithHierarchy`. Default (no param) returns flat list for backward compat.
  - Verify: Build passes

- [x] **T04: Update workspace switch to handle hierarchy context** `est:15m`
  - Files: `apps/web/src/app/api/v1/workspaces/switch/route.ts`
  - Do: Extend switch response to include `workspaceType` and `parentWorkspaceId` so the frontend knows what level it's operating at. No behavioral change — just richer response data.
  - Verify: Build passes, existing switch still works

- [x] **T05: Smoke test** `est:15m`
  - Do: Create test hierarchy, verify AuthContext includes hierarchy fields, verify resolveWorkspaceScope returns correct arrays, verify grouped workspace list, verify switch response includes type. Clean up.
  - Verify: All assertions pass
