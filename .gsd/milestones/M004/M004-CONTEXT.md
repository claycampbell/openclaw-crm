# M004: Company / Business Unit Hierarchy & Intelligent Agency — Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

## Project Description

Extend OpenClaw CRM's flat workspace model into a two-level hierarchy: **Companies** (top-level workspaces like Seawolf, Resourceful, Vivid) and **Business Units** (sub-workspaces under each company). Add a cross-cutting **Intelligent Agency** layer that holds joint opportunities spanning multiple companies/BUs, with explicit identification of which opportunities are joint vs. single-entity.

## Why This Milestone

The current workspace model is flat — each workspace is an isolated silo. Real organizations operate as companies with multiple business units, and some opportunities span organizational boundaries. Without hierarchy, there's no roll-up visibility (company leadership can't see across BUs), and joint opportunities have no home. This is a foundational data model change that everything else (reporting, permissions, AI context) will build on.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Create a Company workspace (e.g. "Seawolf") and add Business Unit sub-workspaces under it (e.g. "Seawolf - Engineering Services", "Seawolf - Consulting")
- Switch between Company-level view (aggregated across all BUs) and individual BU views
- See all records from child BUs when viewing at the Company level (roll-up)
- Flag an opportunity/deal as a "Joint Opportunity" that spans multiple companies/BUs
- View and manage joint opportunities from a dedicated Intelligent Agency workspace
- Have joint opportunities visible from each participating company/BU's pipeline

### Entry point / environment

- Entry point: Web app at `http://localhost:3001`, workspace switcher, sidebar navigation
- Environment: Local dev / browser
- Live dependencies involved: PostgreSQL database

## Completion Class

- Contract complete means: Schema migrations applied, API endpoints return correct hierarchical data, E2E tests prove create/switch/roll-up flows
- Integration complete means: Existing record CRUD, pipeline views, dashboard, and AI chat all work correctly within the new hierarchy without regression
- Operational complete means: Workspace switching is fast, roll-up queries are performant with indexes

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- A user can create Company "Seawolf" → add BU "Engineering" and BU "Consulting" → create deals in each BU → view rolled-up pipeline at Company level showing both BUs' deals
- A user can mark a deal as Joint → it appears in Intelligent Agency → all participating entities can see and update it
- Existing single-workspace users experience zero breaking changes — their workspace just works as before (treated as a standalone Company with no BUs)

## Risks and Unknowns

- **Data model change ripple** — `workspace_id` is on virtually every table. Changing how workspace scoping works could break many queries. Mitigation: keep `workspace_id` as-is on records (it stays the BU-level workspace), add hierarchy above it.
- **Roll-up query performance** — Querying across multiple child workspaces needs to be efficient. The EAV model with correlated EXISTS subqueries could be slow across many workspaces.
- **Joint opportunity ownership** — Who "owns" a joint opportunity? Which workspace's pipeline does it appear in? Need clear data model for multi-workspace record visibility.
- **Permission model** — Company admins need visibility into BUs, but BU members shouldn't necessarily see other BUs. This adds a new permission dimension.
- **Backward compatibility** — Existing workspaces must continue to work without migration. They become standalone Companies by default.

## Existing Codebase / Prior Art

- `apps/web/src/db/schema/workspace.ts` — Current flat workspace schema (workspaces, workspace_members, workspace_invites). Will be extended with type/hierarchy fields.
- `apps/web/src/services/workspace.ts` — Workspace CRUD, member management, seeding. Entry point for hierarchy logic.
- `apps/web/src/lib/api-utils.ts` — `getAuthContext()` resolves userId + workspaceId + role. Must be extended to understand hierarchy context.
- `apps/web/src/middleware.ts` — Guards routes, checks `active-workspace-id` cookie. May need to support workspace-type-aware routing.
- `apps/web/src/db/schema/objects.ts` — Objects scoped by `workspace_id`. Roll-up queries must resolve child workspace IDs.
- `apps/web/src/lib/query-builder.ts` — Filter/sort engine using correlated EXISTS. Must handle multi-workspace scoping for roll-ups.
- `apps/web/src/app/api/v1/workspaces/switch/route.ts` — Workspace switching via cookie. Must support switching between Company/BU views.
- `apps/web/src/components/layout/sidebar.tsx` — Workspace switcher UI. Must show hierarchy.

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Scope

### In Scope

- Workspace type field (company, business_unit, agency)
- Parent-child relationship between Company and Business Unit workspaces
- Company-level roll-up views (see all child BU data)
- Intelligent Agency workspace concept for joint opportunities
- Joint opportunity flag on deals with multi-entity participation
- Workspace switcher UI showing hierarchy
- Company admin permission to view child BUs
- Backward compatibility for existing flat workspaces

### Out of Scope / Non-Goals

- Cross-company permissions beyond Intelligent Agency (BU-to-BU direct sharing)
- Company-level custom objects/attributes (each BU keeps its own schema)
- Billing or subscription model per workspace type
- Migration tool for restructuring existing workspaces into hierarchy
- Advanced role-based access within the hierarchy (viewer, editor, approver at BU vs Company level)

## Technical Constraints

- PostgreSQL 16+ with Drizzle ORM — all schema changes via Drizzle migrations
- `workspace_id` FK exists on ~20+ tables — cannot break existing FK constraints
- Cookie-based workspace switching — `active-workspace-id` cookie holds one ID
- EAV data model — records don't directly have `workspace_id`, they inherit it via `object_id → objects.workspace_id`
- Better Auth session model — no workspace-aware sessions natively

## Integration Points

- **Record CRUD** (`services/records.ts`) — Must scope correctly when viewing at Company level (aggregate child workspaces)
- **Pipeline/Kanban views** — Must show BU-specific or rolled-up deals based on context
- **AI Chat** (`services/ai-chat.ts`) — System prompt includes workspace schema; must understand hierarchy context
- **Dashboard** (`services/dashboard.ts`) — Metrics need roll-up capability
- **Search** (`services/search.ts`) — Cross-BU search when at Company level
- **Automations** — Signals and rules are workspace-scoped; joint opportunities may trigger in multiple contexts

## Open Questions

- **Intelligent Agency as workspace vs. virtual** — Should the Agency be a real workspace with its own `workspace_id`, or a virtual view that aggregates joint records from their source workspaces? Current thinking: real workspace — simpler data model, clearer ownership, standard CRUD.
- **Joint opportunity data residency** — Does a joint deal live in the Agency workspace with references back to participating BUs, or live in one BU and get "shared" to the Agency? Current thinking: lives in Agency workspace, with `record_reference` links to participating entities.
- **Company-level objects** — When viewing at Company level, which object schema applies if BUs have diverged? Current thinking: Company inherits the seeded standard objects; roll-up views query across child workspace objects with matching slugs.
