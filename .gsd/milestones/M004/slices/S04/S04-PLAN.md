# S04: Intelligent Agency & Joint Opportunities

**Goal:** Agency workspaces can hold joint opportunity deals. Deals can be flagged as joint and linked to multiple participating entities via the participation system. Agency roll-up works for viewing across all its companies/BUs.

**Demo:** Create agency → create company + BU under it → create a deal in the agency → add company as participant → verify deal shows participations → agency roll-up shows all deals.

## Tasks

- [x] **T01: Seed Agency with deal objects + extend participation model** `est:20m`
  - Files: `apps/web/src/services/workspace.ts`, `apps/web/src/db/schema/records.ts`
  - Do: Allow agency workspaces to get Deals object seeded (but not People/Companies — agencies manage only joint deals). Add `isJoint` boolean column to records table for flagging joint opportunities.
  - Verify: Build passes

- [x] **T02: Joint opportunity service functions** `est:20m`
  - Files: `apps/web/src/services/records.ts`
  - Do: Add `flagAsJoint(recordId, isJoint)` to toggle the joint flag. Add `listJointRecords(workspaceId)` that queries records flagged as joint. Extend `getRecord` response to include participation data when the record is joint.
  - Verify: Build passes

- [x] **T03: Joint opportunity API endpoints** `est:15m`
  - Files: `apps/web/src/app/api/v1/records/[recordId]/joint/route.ts`
  - Do: Add `POST /api/v1/records/:id/joint` to toggle joint flag `{isJoint: true/false}`. Response includes updated record.
  - Verify: Build passes

- [x] **T04: Smoke test** `est:15m`
  - Do: Create agency + company hierarchy → seed agency with deals → create deal in agency → flag as joint → add company as participant → verify participations → verify roll-up. Clean up.
  - Verify: All assertions pass
