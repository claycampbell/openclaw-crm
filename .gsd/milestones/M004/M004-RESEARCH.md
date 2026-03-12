# M004: Company / BU Hierarchy & Intelligent Agency — Research

**Date:** 2026-03-12

## Summary

The current workspace model is flat: one `workspaces` table with no hierarchy. Every table in the system that references workspace does so via a direct `workspace_id` FK. Records don't carry `workspace_id` directly — they reference `objects`, which reference `workspaces`. This indirection is actually helpful: we can add hierarchy *above* the workspace without touching records or record_values at all.

The recommended approach adds three columns to `workspaces` (`type`, `parent_workspace_id`, `is_joint_eligible`) and creates one new junction table (`joint_opportunity_participants`) that links a joint record to its participating workspaces. No existing FK is changed. Existing workspaces become `type: 'company'` with `parent_workspace_id: null` — fully backward compatible.

The Intelligent Agency is modeled as a real workspace with `type: 'agency'`. Joint opportunities are regular records created within the Agency workspace. A junction table tracks which companies/BUs participate in each joint opportunity. This avoids a "virtual view" pattern that would require invasive changes to every query.

## Recommendation

**Add hierarchy to the existing workspace table, not a separate table.** The workspace is already the multi-tenancy boundary. Adding a `parent_workspace_id` self-reference and a `type` enum keeps all existing FKs valid and avoids a parallel hierarchy system.

**Model the Agency as a first-class workspace.** Joint opportunities are records owned by the Agency workspace, just like any other records. A lightweight junction table (`joint_opportunity_participants`) links a record in the Agency to its participating workspaces. This lets the Agency use all standard CRM features (pipeline, AI chat, etc.) without special-casing.

**Roll-up is a query-time concept, not a data model change.** When viewing at Company level, the system resolves all child workspace IDs and queries across them. The `getAuthContext()` enrichment returns both the active workspace and its children (if Company-level), and services use this expanded scope.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Schema migrations | Drizzle ORM `db:generate` + `db:migrate` | Already the project standard, generates SQL migration files |
| Self-referential FK | Drizzle `references(() => workspaces.id)` | Standard pattern, Drizzle handles it fine |
| Enum types in PG | `pgEnum` in Drizzle | Already used for `workspace_role`, `attribute_type` |

## Existing Code and Patterns

- `apps/web/src/db/schema/workspace.ts` — Extend with `type`, `parentWorkspaceId`. Follow existing pattern of `pgEnum` + `pgTable`.
- `apps/web/src/lib/api-utils.ts` `getAuthContext()` — Extend `AuthContext` interface to include `workspaceType` and optionally `childWorkspaceIds[]` for Company-level views. This is the single point where all API routes get their scope.
- `apps/web/src/services/workspace.ts` `createWorkspace()` — Already handles seeding standard objects. Extend to accept `type` and `parentWorkspaceId`. BU creation should inherit some config from parent Company.
- `apps/web/src/lib/query-builder.ts` — The filter engine uses `objects.workspaceId`. For roll-up, pass an array of workspace IDs and use `inArray()` instead of `eq()`. This is the key query change.
- `apps/web/src/app/api/v1/workspaces/switch/route.ts` — Cookie currently stores one workspace ID. For Company-level view, the cookie stores the Company workspace ID; the API layer resolves children.
- `apps/web/src/components/layout/sidebar.tsx` — Workspace switcher fetches flat list. Must be restructured to show hierarchy: Company → BUs, with ability to select Company-level or specific BU.

## Constraints

- All existing `workspace_id` FKs remain unchanged — records belong to their BU workspace
- The `active-workspace-id` cookie stores exactly one ID — the active Company or BU
- EAV query path: `record_values → records → objects.workspace_id` — roll-up resolves at the `objects` layer
- Standard objects (People, Companies, Deals) are seeded per-workspace — each BU gets its own set
- Better Auth has no workspace hierarchy awareness — hierarchy is purely application-level

## Common Pitfalls

- **Changing workspace_id FKs on existing tables** — Don't. The current FK structure works fine. Hierarchy lives above the workspace, not inside it. Every existing table keeps its `workspace_id` pointing to the leaf workspace (BU or standalone Company).
- **Virtual roll-up views** — Tempting but creates massive complexity. Every service, every query, every API endpoint would need to understand "am I in roll-up mode?" Better to keep the Agency as a real workspace with real records.
- **Over-complicating permissions early** — Start with: Company admins can see all child BUs. BU members see only their BU. Agency members see Agency records. Don't build a full RBAC hierarchy yet.
- **Joint opportunity as a special record type** — Don't create a new record type. Joint opportunities are regular Deal records in the Agency workspace. The junction table handles multi-entity participation. This keeps all existing deal features (pipeline, stages, AI tools) working.

## Open Risks

- **Roll-up query performance with many BUs** — If a Company has 20+ BUs, roll-up queries hit 20+ workspace scopes. May need materialized views or caching later, but premature for now.
- **Object schema divergence** — If BU "Engineering" adds a custom attribute to Deals and BU "Consulting" doesn't, Company-level roll-up shows inconsistent columns. Acceptable for now; can be addressed with a "Company template" concept later.
- **Joint opportunity lifecycle** — When a joint deal closes, which BU gets credit? Revenue attribution is a business logic question that should be deferred to after the data model is proven.

## Data Model Design

### Schema Changes to `workspaces`

```sql
-- New enum
CREATE TYPE workspace_type AS ENUM ('company', 'business_unit', 'agency');

-- Add columns to workspaces
ALTER TABLE workspaces ADD COLUMN type workspace_type NOT NULL DEFAULT 'company';
ALTER TABLE workspaces ADD COLUMN parent_workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE workspaces ADD COLUMN is_joint_eligible BOOLEAN NOT NULL DEFAULT false;

-- Indexes
CREATE INDEX workspaces_parent ON workspaces(parent_workspace_id);
CREATE INDEX workspaces_type ON workspaces(type);
```

### New Table: `joint_opportunity_participants`

```sql
CREATE TABLE joint_opportunity_participants (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'participant',  -- 'lead', 'participant', 'support'
  added_at TIMESTAMP NOT NULL DEFAULT NOW(),
  added_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(record_id, workspace_id)
);
```

### Extended AuthContext

```typescript
interface AuthContext {
  userId: string;
  workspaceId: string;
  workspaceRole: "admin" | "member";
  workspaceType: "company" | "business_unit" | "agency";
  parentWorkspaceId: string | null;
  childWorkspaceIds: string[];  // populated when viewing at Company level
  authMethod?: "cookie" | "api_key";
}
```

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Drizzle self-referential FK | Standard pattern | Built-in |
| PostgreSQL ENUM alter | `pgEnum` in Drizzle | Built-in |

## Sources

- Existing codebase analysis (schema, services, middleware, API utils)
