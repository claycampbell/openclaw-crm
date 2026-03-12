---
status: complete
started: 2026-03-12
completed: 2026-03-12
---

# S06: Joint Opportunity Cross-Visibility & Integration — Summary

## What was delivered

Joint opportunities from agencies appear in participating entities' deal lists. Record detail includes participation data. Full integrated flow verified: agency hierarchy + joint deals + participation + roll-up.

## Changes

### `records.ts`
- `getParticipatedRecords(workspaceId, objectSlug?)` — fetches records where a workspace participates via `deal_participations`, returns hydrated records marked with `isParticipation: true`

### `GET /api/v1/objects/[slug]/records/[recordId]`
- Now enriches response with `isJoint` flag and `participations` array from `getParticipationsForRecord`
- Record lookup searches across scoped workspaces (roll-up aware) if not found in primary

## Integration verification
Full flow tested:
1. Agency → Company → BU hierarchy created
2. Joint deal created in Agency, flagged as joint
3. Company + BU added as participants
4. Company's participated records returns the joint deal with `isParticipation: true`
5. Record detail returns 2 participations (Alpha Corp as lead, Alpha West as support)
6. Agency roll-up shows 2 total deals (1 agency joint + 1 BU regular)
7. Company roll-up shows 1 deal (BU's own) + 1 participated deal (would be merged by frontend)
