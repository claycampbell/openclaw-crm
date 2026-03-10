# Codebase Structure

**Analysis Date:** 2026-03-10

## Directory Layout

```
openclaw-crm/                          # Monorepo root
├── apps/
│   └── web/                           # Next.js 15 application (everything)
│       ├── src/
│       │   ├── app/                   # Next.js App Router
│       │   │   ├── (auth)/            # Auth routes (login, register, select-workspace)
│       │   │   ├── (dashboard)/       # Protected routes (chat, home, lists, objects, settings, etc.)
│       │   │   ├── api/v1/            # REST API endpoints
│       │   │   ├── blog/              # Marketing blog pages
│       │   │   ├── compare/           # Product comparison pages
│       │   │   ├── docs/              # Documentation pages
│       │   │   └── invite/            # Public invite acceptance
│       │   ├── components/            # React components (UI + feature-specific)
│       │   ├── db/                    # Database (schema, migrations, seed)
│       │   ├── hooks/                 # Custom React hooks
│       │   ├── lib/                   # Utilities (auth, API helpers, query-builder, filters)
│       │   ├── services/              # Business logic layer
│       │   ├── middleware.ts          # Request middleware (auth, workspace routing)
│       │   ├── package.json
│       │   ├── next.config.ts
│       │   └── tsconfig.json
│       ├── e2e/                       # Playwright E2E tests
│       ├── public/                    # Static assets
│       └── content/                   # Blog posts + competitor pages
├── packages/
│   └── shared/                        # Shared types and constants
│       ├── src/
│       │   ├── types/                 # TypeScript type definitions
│       │   ├── constants/             # Shared constants (ATTRIBUTE_TYPE_COLUMN_MAP, etc.)
│       │   └── index.ts               # Main export
│       └── package.json
├── package.json                       # Monorepo root (Turborepo)
├── pnpm-workspace.yaml                # pnpm workspaces config
├── turbo.json                         # Turborepo build config
├── CLAUDE.md                          # Development instructions
├── docker-compose.yml                 # Dev database (PostgreSQL)
├── docker-compose.prod.yml            # Production database config
├── Dockerfile                         # Container build
└── .github/workflows/                 # CI/CD actions
```

## Directory Purposes

**apps/web/src/app:**
- Purpose: Next.js App Router pages and API routes
- Contains: Page components, layout components, route handlers
- Key files:
  - `(auth)/` — Public routes: `/login`, `/register`, `/select-workspace`
  - `(dashboard)/` — Protected routes requiring auth + active workspace
  - `api/v1/` — REST API endpoints, versioned as v1
  - `api/auth/` — Better Auth endpoints
  - `middleware.ts` — Request guard (auth, workspace scoping)

**apps/web/src/components:**
- Purpose: Reusable React UI components
- Contains: 57 `.tsx` files organized by feature
- Subdirectories:
  - `ui/` — shadcn/ui components (Button, Card, Dialog, etc.)
  - `chat/` — AI chat UI (message list, input, confirmation cards)
  - `records/` — Record display and editing components
  - `filters/` — Filter builder and sort UI
  - `lists/` — Kanban board and list view components
  - `notes/` — Note display and editor
  - `tasks/` — Task management UI
  - `workspace/` — Workspace picker, member management
  - `layout/` — Sidebar, topbar, command palette
  - `landing/` — Marketing page components
  - `analytics/` — Analytics scripts (GA4, Plausible, Amplitude)

**apps/web/src/db:**
- Purpose: Database schema, migrations, seeding
- Contains:
  - `schema/` — Drizzle ORM table definitions (objects, records, attributes, workspace members, etc.)
  - `migrations/` — Drizzle migration files (generated, committed)
  - `migrations/meta/` — Drizzle metadata
  - `seed.ts` — Populate default data (People, Companies, Deals objects, deal stages)
  - `index.ts` — Database client initialization

**apps/web/src/lib:**
- Purpose: Shared utilities and helpers
- Key files:
  - `api-utils.ts` — `getAuthContext()`, response helpers (`success()`, `unauthorized()`, etc.), `requireAdmin()`
  - `query-builder.ts` — `buildFilterSQL()`, `buildSortExpressions()` for dynamic filtering
  - `auth.ts` — Better Auth client configuration
  - `auth-client.ts` — Client-side auth API
  - `filter-utils.ts` — Operator labels and type-specific operators
  - `csv-utils.ts` — CSV import/export helpers
  - `display-name.ts` — Record display name extraction
  - `content.ts` — Blog and docs parsing
  - `analytics.ts` — Analytics tracking
  - `utils.ts` — Generic utilities (empty/minimal)

**apps/web/src/services:**
- Purpose: Business logic layer (data access, transformations, multi-step operations)
- Key files (13 services):
  - `records.ts` — CRUD for records + attribute value reads/writes (20KB, core service)
  - `objects.ts` — Object/attribute definitions
  - `ai-chat.ts` — OpenRouter integration, tool definitions, multi-round tool calling (22KB)
  - `lists.ts` — Kanban list operations (15KB)
  - `search.ts` — Full-text record search
  - `workspace.ts` — Workspace and member operations
  - `tasks.ts` — Task CRUD linked to records
  - `notes.ts` — Note CRUD linked to records
  - `notifications.ts` — Notification creation
  - `attributes.ts` — Attribute field creation/update
  - `api-keys.ts` — API key generation and validation
  - `display-names.ts` — Batch display name retrieval
  - `crm-events.ts` — Side effects (e.g., notifications on record create)
  - `agent-channels.ts` — Chat channel management for agent conversations

**apps/web/src/hooks:**
- Purpose: Custom React hooks for data fetching and state management
- Key files:
  - `use-object-records.ts` — Fetch records for an object with filtering/sorting
  - `use-list.ts` — Fetch kanban list with entries

**apps/web/src/app/api/v1:**
- Purpose: REST API routes
- Structure: Each endpoint is a folder with `route.ts` containing `GET`, `POST`, `PUT`, `DELETE` handlers
- Patterns:
  - `[slug]` — Dynamic path segment (e.g., object slug)
  - `[recordId]` — Dynamic ID
  - Nested routes group related endpoints (e.g., `/api/v1/objects/[slug]/records/`)
- Examples:
  - `GET /api/v1/objects/[slug]/records` — List records
  - `POST /api/v1/objects/[slug]/records` — Create record
  - `GET /api/v1/objects/[slug]/records/[recordId]` — Get single record
  - `GET /api/v1/search` — Full-text search
  - `POST /api/v1/chat/completions` — Stream AI chat response
  - `POST /api/v1/chat/tool-confirm` — Confirm write tool execution

**packages/shared/src:**
- Purpose: Types and constants shared between app code and external consumers
- Contains:
  - `types/` — TypeScript types (FilterGroup, FilterCondition, SortConfig, etc.)
  - `constants/` — ATTRIBUTE_TYPE_COLUMN_MAP (maps attribute types to database columns)
  - `index.ts` — Main export

**apps/web/e2e:**
- Purpose: End-to-end tests with Playwright
- Pattern: Test login, create records, filter, search, chat interactions
- Run: `cd apps/web && pnpm test:e2e`

## Key File Locations

**Entry Points:**

- `./apps/web/src/app/layout.tsx` — Root layout (providers, theme)
- `./apps/web/src/app/(auth)/login/page.tsx` — Login page
- `./apps/web/src/app/(dashboard)/home/page.tsx` — Dashboard home (protected)
- `./apps/web/src/app/api/v1/objects/[slug]/records/route.ts` — Records endpoint
- `./apps/web/src/app/api/v1/chat/completions/route.ts` — AI chat streaming endpoint

**Configuration:**

- `./apps/web/next.config.ts` — Next.js config (turbopack, compression, etc.)
- `./apps/web/tsconfig.json` — TypeScript config (path aliases like `@/*` → `src/*`)
- `./apps/web/.env.example` → `.env` — Environment variables (DATABASE_URL, BETTER_AUTH_SECRET, OpenRouter API key, OAuth secrets)
- `./docker-compose.yml` — Local dev database

**Core Logic:**

- `./apps/web/src/middleware.ts` — Request guard and workspace routing
- `./apps/web/src/lib/api-utils.ts` — Auth context, response helpers
- `./apps/web/src/lib/query-builder.ts` — Filter-to-SQL compilation
- `./apps/web/src/services/records.ts` — Record CRUD (core domain model)
- `./apps/web/src/services/ai-chat.ts` — LLM integration with tool definitions
- `./apps/web/src/db/schema/` — All Drizzle ORM table definitions

**Testing:**

- `./apps/web/e2e/` — Playwright test files
- No unit tests; only E2E tests

## Naming Conventions

**Files:**

- Route handlers: `route.ts` (not `page.ts` for API)
- Components: `component-name.tsx` (kebab-case)
- Services: `domain.ts` (e.g., `records.ts`, `objects.ts`)
- Utilities: `utility-name.ts` (e.g., `query-builder.ts`, `filter-utils.ts`)
- Database schema: Table name `.ts` (e.g., `objects.ts` defines objects table)
- Page components: `page.tsx` (Next.js convention)
- Layout components: `layout.tsx` (Next.js convention)

**Directories:**

- Feature routes: Use parentheses for grouping (e.g., `(auth)`, `(dashboard)`) — Next.js convention, not included in URL
- Dynamic routes: Use brackets (e.g., `[slug]`, `[recordId]`)
- Utility directories: Lowercase plural (e.g., `services`, `components`, `hooks`, `lib`)
- Feature components: Descriptive plural (e.g., `filters`, `records`, `chat`)

**Variables & Functions:**

- camelCase: Variable names, function names
- PascalCase: React component names, types, interfaces, classes
- SCREAMING_SNAKE_CASE: Constants (e.g., `ATTRIBUTE_TYPE_COLUMN_MAP`)
- Prefixes: React hooks start with `use` (e.g., `useObjectRecords`, `useList`)

**Types:**

- Exported types in `packages/shared` (shared across app and API consumers)
- Local interface types defined in service/utility files where used
- Example: `FilterGroup`, `FilterCondition`, `AuthContext`, `FlatRecord`, `ToolHandler`

## Where to Add New Code

**New Feature (e.g., new dashboard page):**
1. Create route folder: `./apps/web/src/app/(dashboard)/[feature-name]/`
2. Add `page.tsx` (server component by default)
3. Add feature components: `./apps/web/src/components/[feature-name]/`
4. If data needs creation/update: add API route under `./apps/web/src/app/api/v1/[feature-name]/`
5. If complex logic: add service file `./apps/web/src/services/[feature-name].ts`
6. If data fetching: add hook `./apps/web/src/hooks/use-[feature-name].ts`

**New Object Type (e.g., custom "Project" object):**
1. No schema changes needed; use existing objects/attributes tables
2. On workspace creation, seed via `./apps/web/src/db/seed.ts`
3. Workspace admin creates via Settings > Objects page
4. Attributes created dynamically at `POST /api/v1/objects/[slug]/attributes`

**New API Endpoint:**
1. Create folder: `./apps/web/src/app/api/v1/[resource]/`
2. Add `route.ts` with `export async function GET(req, params)` etc.
3. Start with `getAuthContext(req)` → `unauthorized()` if null
4. Call service function from `./apps/web/src/services/`
5. Return `success(data)` or error response

**New Service:**
1. Create `./apps/web/src/services/[domain].ts`
2. Export async functions (no class-based services)
3. Imported by API routes and server components
4. Use Drizzle ORM from `./apps/web/src/db/index.ts`
5. Reference `types` from `packages/shared` if needed

**New Database Table:**
1. Define in `./apps/web/src/db/schema/[table-name].ts`
2. Export from `./apps/web/src/db/schema/index.ts`
3. Run `pnpm db:generate` to create migration file
4. Run `pnpm db:push` to apply to dev database
5. Update seed if needed

**New Component:**
1. Create `./apps/web/src/components/[feature]/[component-name].tsx`
2. Use `"use client"` directive if interactive
3. Use shadcn/ui building blocks where possible
4. Import types from `packages/shared` if needed

**New Shared Type:**
1. Define in `./packages/shared/src/types/[domain].ts`
2. Export from `./packages/shared/src/index.ts`
3. Import in app code or external consumers via `@openclaw-crm/shared`

## Special Directories

**./apps/web/node_modules:**
- Purpose: Installed dependencies for web app
- Generated: Yes (via `pnpm install`)
- Committed: No (.gitignore)
- Size: Large; not tracked in git

**./apps/web/.next:**
- Purpose: Next.js build output (compiled app)
- Generated: Yes (via `pnpm build` or `pnpm dev`)
- Committed: No (.gitignore)
- Size: Large

**./apps/web/public:**
- Purpose: Static assets served at root (e.g., `/favicon.ico`)
- Contains: Favicon, robots.txt, sitemaps, favicon variants
- Committed: Yes
- Editing: Add files directly; no build step needed

**./apps/web/content:**
- Purpose: Blog posts and marketing page content
- Contains: Markdown files, parsed by `./apps/web/src/lib/content.ts`
- Subdirectories: `blog-posts/`, `competitor-pages/`
- Committed: Yes

**./apps/web/src/db/migrations:**
- Purpose: Drizzle migration files (snapshot of schema changes)
- Generated: Yes (via `pnpm db:generate`)
- Committed: Yes (allows replay on other environments)
- Pattern: One file per schema change, named with timestamp

**./packages/shared:**
- Purpose: Shared package for types and constants
- Published: No (internal only; used via `workspace:*` reference)
- Versioning: Not published to npm; just internal sharing

---

*Structure analysis: 2026-03-10*
