---
status: complete
started: 2026-03-12
completed: 2026-03-12
---

# S03: Company Roll-Up Views & BU Scoping — Summary

## What was delivered

Company-level workspace views now aggregate records from all child BU workspaces. BU-level views show only their own data. The query builder and services handle multi-workspace scoping transparently.

## Changes

### `objects.ts` — Multi-workspace queries
- `getObjectsBySlugAcrossWorkspaces(workspaceIds, slug)` — finds objects with matching slug across multiple workspaces
- `listObjectsAcrossWorkspaces(workspaceIds)` — lists objects across workspaces, deduplicated by slug

### `records.ts` — Multi-object record listing
- `listRecordsMultiObject(objectIds, options)` — queries records from multiple objects (same slug, different workspaces) with unified attribute hydration and filter/sort support

### API routes updated
- `GET /api/v1/objects/[slug]/records` — uses `resolveWorkspaceScope()` to detect roll-up context, queries across all scoped workspace objects
- `POST /api/v1/objects/[slug]/records/query` — same roll-up for filtered/sorted queries (offset mode); cursor mode stays single-workspace
- `GET /api/v1/objects` — returns deduplicated object list across scoped workspaces

## Key decisions
- Roll-up uses offset pagination (not cursor) since cursor pagination across multiple objects with different attribute IDs requires more complexity. Can be added later if needed.
- The first object's attributes serve as the canonical schema for filter/sort in multi-object mode. Since BUs are seeded from the same standard objects, attributes match by slug.
- Object deduplication prefers the primary workspace's definition (first in the scope array).
- Writes (POST /records, assert mode) always go to the primary workspace's object — roll-up is read-only.

## Verification
Smoke test: company + 2 BUs created → records inserted in each → BU-level returns 1 record each → company-level roll-up returns all 3 → object list correctly deduplicated to 3 slugs.
