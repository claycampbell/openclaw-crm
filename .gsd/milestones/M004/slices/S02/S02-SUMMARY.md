---
status: complete
started: 2026-03-12
completed: 2026-03-12
---

# S02: Hierarchy-Aware Auth Context & Workspace Switching — Summary

## What was delivered

Extended `AuthContext` with workspace hierarchy fields and added `resolveWorkspaceScope()` for multi-workspace query scoping. Made workspace listing and switching hierarchy-aware.

## Changes

### `api-utils.ts` — AuthContext extended
- Added `workspaceType: WorkspaceType`, `parentWorkspaceId: string | null`, `childWorkspaceIds: string[]` to `AuthContext`
- New `buildAuthContext()` helper fetches workspace type/parent + descendant IDs in one pass
- Both cookie and API key auth paths now populate hierarchy fields
- New `resolveWorkspaceScope(ctx)` → returns `[workspaceId, ...childWorkspaceIds]` for roll-up queries

### `workspace.ts` — Grouped listing
- Added `listUserWorkspacesWithHierarchy(userId)` that returns workspaces grouped as:
  - Standalone companies (no parent)
  - Agency groups: agency → companies → BUs (three-tier nesting)

### `GET /api/v1/workspaces` — `?grouped=true` param
- Default (no param): flat list — backward compatible
- `?grouped=true`: returns nested hierarchy structure

### `POST /api/v1/workspaces/switch` — Richer response
- Now returns `workspaceName`, `workspaceType`, `parentWorkspaceId` alongside `workspaceId`

## Scope decisions
- `resolveWorkspaceScope` returns all descendants — S03 will use this for roll-up queries
- `buildAuthContext` does 2 DB queries (workspace lookup + descendant CTE) — acceptable overhead for the auth path since it caches per-request
- Backward compatible: existing consumers that only use `userId/workspaceId/workspaceRole` continue to work unchanged

## Verification
Smoke test created hierarchy → verified AuthContext fields populate correctly → verified scope resolution returns correct ID sets → verified grouped listing nests correctly → cleaned up.
