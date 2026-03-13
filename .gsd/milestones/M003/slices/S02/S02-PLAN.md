# S02: Standardized Empty States + Table Header Consistency

**Goal:** All empty states use a shared EmptyState component with icon + heading + description + optional CTA. All table headers use sentence case instead of ALL CAPS.
**Demo:** Navigate to any empty page (tasks, notes, sequences, records table) → see a polished empty state with an icon, description, and action button. Table headers say "Name", "Expected close date" — not "NAME", "EXPECTED CLOSE DATE".

## Must-Haves

- Reusable `<EmptyState>` component with icon, title, description, and optional action button
- All inline empty state text replaced with the component
- Table header `uppercase` removed, headers use sentence case
- `pnpm build` passes

## Proof Level

- This slice proves: integration
- Real runtime required: yes
- Human/UAT required: visual review

## Verification

- `pnpm build` succeeds
- `grep -rn "uppercase" apps/web/src/components/records/record-table.tsx` returns nothing
- Browser: empty records table shows EmptyState component with icon + CTA
- Browser: table headers show sentence case

## Tasks

- [ ] **T01: Build EmptyState component and replace all inline empty states + fix table headers** `est:1h`
  - Why: 12+ inconsistent empty state patterns across the app; ALL CAPS table headers feel aggressive
  - Files: `apps/web/src/components/ui/empty-state.tsx` (new), `apps/web/src/components/records/record-table.tsx`, `apps/web/src/components/tasks/task-list.tsx`, `apps/web/src/components/tasks/record-tasks.tsx`, `apps/web/src/components/notes/record-notes.tsx`, `apps/web/src/app/(dashboard)/notes/page.tsx`, `apps/web/src/app/(dashboard)/sequences/page.tsx`, `apps/web/src/app/(dashboard)/home/page.tsx`
  - Do: (1) Create EmptyState component. (2) Roll out to all pages with empty states. (3) Remove `uppercase` from record-table header class. (4) Ensure all column header strings use sentence case.
  - Verify: `pnpm build` passes; browser shows styled empty states and sentence-case headers
  - Done when: No inline "No X yet" strings remain; all tables use sentence case headers

## Files Likely Touched

- `apps/web/src/components/ui/empty-state.tsx` (new)
- `apps/web/src/components/records/record-table.tsx`
- `apps/web/src/components/tasks/task-list.tsx`
- `apps/web/src/components/tasks/record-tasks.tsx`
- `apps/web/src/components/notes/record-notes.tsx`
- `apps/web/src/app/(dashboard)/notes/page.tsx`
- `apps/web/src/app/(dashboard)/sequences/page.tsx`
- `apps/web/src/app/(dashboard)/home/page.tsx`
- `apps/web/src/components/chat/conversation-list.tsx`
