# S06: Joint Opportunity Cross-Visibility & Integration

**Goal:** Joint opportunities from the Agency appear in each participating entity's pipeline view with a badge. Company roll-up includes Agency joint deals. Dashboard metrics include joint opportunity data. Verify full integrated flow.

## Tasks

- [x] **T01: Include participated deals in record lists** `est:25m`
  - Files: `apps/web/src/services/records.ts`, `apps/web/src/app/api/v1/objects/[slug]/records/route.ts`
  - Do: When listing deals for a workspace, also include deals where this workspace is a participant (from deal_participations). Mark these records with a `isParticipation: true` flag in the response so the UI can badge them.
  - Verify: Build passes

- [x] **T02: Add joint badge + participation info to record detail** `est:15m`
  - Files: `apps/web/src/app/api/v1/objects/[slug]/records/[recordId]/route.ts`
  - Do: When fetching a single record that is joint, include `participations` array in the response from `getParticipationsForRecord`. Add `isJoint` field to record response.
  - Verify: Build passes

- [x] **T03: Integration smoke test** `est:20m`
  - Do: Create full hierarchy → create joint deal in agency → add company as participant → verify company's deal list includes the joint deal → verify record detail includes participations → verify agency roll-up. Clean up.
  - Verify: All assertions pass
