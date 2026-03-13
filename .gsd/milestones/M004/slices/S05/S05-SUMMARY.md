---
status: complete
started: 2026-03-12
completed: 2026-03-12
---

# S05: Workspace Hierarchy UI — Summary

## What was delivered

Sidebar workspace switcher displays workspace hierarchy with type badges and visual grouping. Select-workspace page shows type badges. Active workspace shows its type in the header.

## Changes

### Sidebar (`sidebar.tsx`)
- Added `WorkspaceGroup` type and `workspaceGroups` state
- Fetches `GET /api/v1/workspaces?grouped=true` for hierarchical display
- New `WorkspaceSwitchItem` component with:
  - Type badges: AG (amber) for Agency, CO (blue) for Company, BU (green) for Business Unit
  - Indent levels: 0 for top-level, 1 for companies under agencies, 2 for BUs under companies
  - Checkmark for active workspace
- Header shows workspace type label for non-company types (e.g. "Business Unit", "Agency")
- Falls back to flat list if grouped API returns empty

### Select-workspace page
- `Workspace` interface extended with `type` and `parentWorkspaceId`
- Type badge pill shown for non-company workspaces (BU/Agency)

## Visual verification
Logged in → sidebar shows workspace switcher dropdown with CO badge → dropdown opens with grouped layout → type badges render correctly.
