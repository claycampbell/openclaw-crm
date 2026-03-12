# S05: Workspace Hierarchy UI

**Goal:** Sidebar workspace switcher displays Company → BU hierarchy with visual grouping. Users can switch between any workspace level. Create-workspace flow supports BU creation under a Company. Active workspace shows its type badge.

## Tasks

- [x] **T01: Update sidebar workspace switcher to show hierarchy** `est:30m`
  - Files: `apps/web/src/components/layout/sidebar.tsx`
  - Do: Fetch workspaces with `?grouped=true`. Display workspace groups with indentation — agencies and standalone companies at top level, companies under agencies indented once, BUs under companies indented twice. Show workspace type badge (tiny pill). Active workspace gets a check mark. Add "Add Business Unit" option under companies.
  - Verify: Visual verification in browser

- [x] **T02: Update select-workspace page for hierarchy creation** `est:20m`
  - Files: `apps/web/src/app/(auth)/select-workspace/page.tsx`
  - Do: Show workspace type in the list. Add option to create BU under existing companies. Add agency creation option for admin users.
  - Verify: Visual verification in browser

- [x] **T03: Visual verification** `est:10m`
  - Do: Start dev server, create test hierarchy, verify sidebar shows correct grouping, switch between workspaces, verify type badges.
  - Verify: Browser assertions
