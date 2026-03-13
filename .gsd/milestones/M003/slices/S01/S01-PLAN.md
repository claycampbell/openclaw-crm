# S01: Sidebar Navigation Polish

**Goal:** Every sidebar icon has a styled tooltip label on hover when collapsed, nav items are grouped with visual separators and section labels, and the active state is unmistakably clear.
**Demo:** Hover over any collapsed sidebar icon → a styled Radix tooltip appears instantly with the page name. The sidebar visually groups icons into Core (home/chat/inbox/tasks), Content (notes/notifications), Analytics (dashboard/sequences/battlecards/approvals/contracts/handoff), Objects (people/companies/deals), and System (docs/settings/theme).

## Must-Haves

- Radix-based Tooltip component (shadcn/ui pattern) installed and working
- Every NavItem shows a styled tooltip when sidebar is collapsed (not browser-native `title`)
- Nav sections have visible group separators (already partially present — formalize with consistent spacing)
- Active nav item has a bold left-edge indicator or stronger background contrast
- Theme toggle and bottom nav items also get tooltips
- `pnpm build` passes

## Proof Level

- This slice proves: integration
- Real runtime required: yes (tooltip rendering requires browser)
- Human/UAT required: visual review of tooltip placement and active state

## Verification

- `pnpm build` succeeds with no type errors
- `apps/web/src/components/ui/tooltip.tsx` exists and exports Tooltip components
- `grep -rn "Tooltip" apps/web/src/components/layout/sidebar.tsx` shows Tooltip usage
- Browser: hover over collapsed sidebar icon → tooltip appears within 200ms
- Browser: active nav item is visually distinct from inactive items

## Observability / Diagnostics

- Runtime signals: none — purely visual UI
- Inspection surfaces: browser hover inspection
- Failure visibility: tooltip not appearing on hover = visible bug
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: `@radix-ui/react-tooltip` (peer dep of shadcn), existing sidebar component
- New wiring introduced in this slice: Tooltip provider in layout, Tooltip wrapping each NavItem
- What remains before the milestone is truly usable end-to-end: S02-S07 cover remaining audit items

## Tasks

- [ ] **T01: Add shadcn Tooltip component and wire into sidebar** `est:45m`
  - Why: The sidebar has 18+ icons with no discoverable labels when collapsed — the `title` attribute gives an ugly, delayed browser tooltip. Need proper Radix-based tooltips.
  - Files: `apps/web/src/components/ui/tooltip.tsx`, `apps/web/src/components/layout/sidebar.tsx`, `apps/web/src/app/(dashboard)/layout.tsx`
  - Do: (1) Add shadcn/ui Tooltip component (`tooltip.tsx`) using Radix primitives. (2) Wrap dashboard layout with `<TooltipProvider delayDuration={0}>`. (3) In sidebar NavItem, when `!expanded`, wrap the Link in `<Tooltip><TooltipTrigger asChild>...</TooltipTrigger><TooltipContent side="right">{label}</TooltipContent></Tooltip>`. Remove the `title` attribute. (4) Add tooltips to theme toggle and bottom nav items too. (5) Ensure tooltips only show when sidebar is collapsed (not expanded).
  - Verify: `pnpm build` passes; hover over collapsed sidebar icon in browser → styled tooltip appears immediately
  - Done when: Every sidebar icon shows a Radix tooltip on hover when collapsed; no browser-native title tooltips remain

- [ ] **T02: Strengthen nav grouping and active state indicator** `est:30m`
  - Why: The sidebar has separators but no section labels, and the active state is a subtle background change that's easy to miss.
  - Files: `apps/web/src/components/layout/sidebar.tsx`, `apps/web/src/app/globals.css`
  - Do: (1) Add small section labels visible when expanded: "CORE", "OBJECTS", "ANALYTICS", "SYSTEM" — tiny uppercase muted text above each group. Hide labels when collapsed. (2) Strengthen active nav item indicator: add a 2px left border in primary color (`border-l-2 border-primary`) on the active item, or a stronger background. (3) Ensure separators are consistent between all groups. (4) Tighten spacing so the sidebar doesn't feel like an undifferentiated list.
  - Verify: `pnpm build` passes; visual inspection shows clear section grouping; active item is immediately identifiable
  - Done when: Nav sections have labels when expanded; active item has a distinct left-edge indicator; visual grouping is clear

## Files Likely Touched

- `apps/web/src/components/ui/tooltip.tsx` (new)
- `apps/web/src/components/layout/sidebar.tsx`
- `apps/web/src/app/(dashboard)/layout.tsx`
- `apps/web/src/app/globals.css`
