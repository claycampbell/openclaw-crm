---
status: complete
started: 2026-03-12
completed: 2026-03-12
---

# S04: Intelligent Agency & Joint Opportunities — Summary

## What was delivered

Agency workspaces now host joint opportunity deals. Records have an `isJoint` flag. Deal participations link joint opportunities to participating companies/BUs. Agency roll-up works across all descendant deals.

## Changes

### Schema
- Added `is_joint` boolean column to `records` table (default `false`)
- Pushed via `drizzle-kit push --force`

### Services
- `workspace.ts` — `seedAgencyObjects()` seeds only Deals (renamed to "Joint Opportunity"/"Joint Opportunities") for agency workspaces, skipping People/Companies
- `records.ts` — `flagAsJoint(recordId, isJoint)` toggles the joint flag; `listJointRecords(objectId)` queries only joint-flagged records

### API
- `POST /api/v1/records/:id/joint` — toggles joint flag `{isJoint: true/false}`

## Key decisions
- Agency workspaces get only Deals object (renamed to "Joint Opportunity") — they're not for managing contacts/companies, just for cross-entity deals
- `isJoint` is on the record itself (not just via participations) for efficient querying
- Agency roll-up via `listRecordsMultiObject` (from S03) already works — agency + all descendant deal objects are aggregated

## Verification
Smoke test: agency → company → BU → create deal in agency → flag joint → add participants → verify participations → list joint records → agency roll-up includes BU deals. All passed.
