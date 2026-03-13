# S03: Company Roll-Up Views & BU Scoping

**Goal:** When viewing at Company level, record lists aggregate data from all child BU workspaces. When viewing at BU level, only that BU's data shows. The query builder and services handle multi-workspace scoping transparently.

**Demo:** Create Company + 2 BUs with records in each → view at Company level shows all records → view at BU level shows only that BU's records.

## Tasks

- [x] **T01: Add multi-workspace object + record query functions** `est:30m`
  - Files: `apps/web/src/services/objects.ts`, `apps/web/src/services/records.ts`
  - Do: Add `getObjectsBySlugAcrossWorkspaces(workspaceIds, slug)` that finds objects with matching slug across multiple workspace IDs. Add `listRecordsMultiWorkspace(objectIds, options)` that queries records from multiple objects (same slug, different workspaces) and merges results. Reuse existing `hydrateRecords` and filter/sort logic.
  - Verify: Build passes

- [x] **T02: Wire multi-workspace scoping into record API routes** `est:20m`
  - Files: `apps/web/src/app/api/v1/objects/[slug]/records/route.ts`, `apps/web/src/app/api/v1/objects/[slug]/records/query/route.ts`
  - Do: When `ctx.childWorkspaceIds.length > 0`, use `resolveWorkspaceScope(ctx)` to get all workspace IDs, find matching objects across those workspaces, and query records from all of them. Fall back to single-workspace behavior when no children.
  - Verify: Build passes, existing single-workspace queries unchanged

- [x] **T03: Wire multi-workspace scoping into object list** `est:10m`
  - Files: `apps/web/src/app/api/v1/objects/route.ts`
  - Do: When at company level, return the union of objects from the company and its BUs (deduplicated by slug, preferring the company's definition). This ensures the sidebar shows all available object types.
  - Verify: Build passes

- [x] **T04: Smoke test** `est:15m`
  - Do: Create hierarchy with records in BUs → verify company-level API returns merged records → verify BU-level returns only its own.
  - Verify: All assertions pass
