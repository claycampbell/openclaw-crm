# Architecture

**Analysis Date:** 2026-03-10

## Pattern Overview

**Overall:** Layered client-server architecture with typed EAV (Entity-Attribute-Value) data model, multi-tenant workspace support, and API-driven design.

**Key Characteristics:**
- Multi-tenant: Every query scoped by `workspaceId`
- Flexible schema via Typed EAV: Custom fields defined per workspace, not in code
- API-first: All data mutations go through REST API layer, reusable by frontend and external consumers
- Service layer abstraction: Business logic separated from HTTP concerns
- Server-side rendering (SSR) for performance: Dashboard routes prefer server components, client components for interactivity
- Authentication dual-track: Cookie-based sessions (UI) + API key tokens (external clients)
- Streaming AI chat: SSE response streaming with multi-round tool calling

## Layers

**Presentation (Frontend):**
- Purpose: User interface and interactions
- Location: `./apps/web/src/app/(auth)/`, `./apps/web/src/app/(dashboard)/`, `./apps/web/src/components/`
- Contains: Next.js pages, server components, client components, React hooks
- Depends on: Services (via server-side calls), API layer (client-side calls via `fetch`)
- Used by: End users via web browser

**API Layer:**
- Purpose: HTTP request/response handling, auth checks, request validation, standardized response format
- Location: `./apps/web/src/app/api/v1/`
- Contains: Route handlers following `(GET|POST|PUT|DELETE)(req, params) => Response` pattern
- Depends on: Services, AuthContext, response helpers from `./apps/web/src/lib/api-utils.ts`
- Used by: Frontend client code, external API consumers, Mobile apps
- Pattern: Every route calls `getAuthContext(req)`, validates body, calls service, returns `success()` or error responses

**Service Layer:**
- Purpose: Business logic - data access, transformation, multi-step operations
- Location: `./apps/web/src/services/`
- Contains: Exported async functions, one service per domain (records, objects, ai-chat, search, etc.)
- Key files:
  - `records.ts`: CRUD for records + typed attribute value reads/writes (20KB)
  - `objects.ts`: Object/attribute definitions management
  - `ai-chat.ts`: OpenRouter integration, system prompt building, tool definitions and multi-round calling
  - `lists.ts`: List-as-kanban board operations
  - `search.ts`: Full-text record search
  - `workspace.ts`: Workspace and member operations
  - `tasks.ts`, `notes.ts`: Record-linked metadata
- Depends on: Database models, query-builder utility for filtering
- Used by: API routes, server components, event handlers

**Query Layer:**
- Purpose: Translate high-level filter/sort specifications into type-safe SQL
- Location: `./apps/web/src/lib/query-builder.ts` (210 lines)
- Contains: `buildFilterSQL()` and `buildSortExpressions()` functions
- Pattern: Uses Drizzle ORM and SQL template literals; generates correlated `EXISTS` subqueries to filter `record_values` by attribute type
- Depends on: Drizzle ORM, `ATTRIBUTE_TYPE_COLUMN_MAP` from shared package

**Database (Data):**
- Purpose: Persistent data storage
- Location: `./apps/web/src/db/schema/`, migrations in `./apps/web/src/db/migrations/`
- ORM: Drizzle ORM with PostgreSQL 16+
- Pattern: Typed EAV with column mapping — each `record_values` row has typed columns (`text_value`, `number_value`, `date_value`, `boolean_value`, `json_value`, `referenced_record_id`) and uses one per row based on attribute type
- Key tables: `objects`, `attributes`, `records`, `record_values`, `workspaces`, `workspace_members`, `api_keys`, `conversations`, `messages`, `chat_channels`, `notes`, `tasks`, `notifications`
- Scoping: All data includes `workspace_id` for multi-tenancy

**Authentication:**
- Purpose: Session and API key management
- Location: `./apps/web/src/lib/auth.ts`, `./apps/web/src/lib/api-utils.ts`, middleware
- Pattern:
  1. Better Auth (cookie-based sessions) for web UI
  2. API key tokens (`oc_sk_` prefix) for external consumers, SHA-256 hashed in DB
  3. `getAuthContext(req)` resolves to `{userId, workspaceId, workspaceRole, authMethod}`
  4. Middleware guards routes, redirects unauthenticated users to `/login`
- Depends on: Better Auth library, database for API key lookups

## Data Flow

**Record Read (GET /api/v1/objects/[slug]/records):**

1. Middleware allows request if authenticated
2. Route handler calls `getAuthContext(req)` → gets `{userId, workspaceId}`
3. Route calls `listRecords(objectId, {limit, offset})` from service
4. Service loads:
   - Attribute definitions for object (maps slug → id, type, multiselect)
   - Record rows scoped to `objectId`
   - `record_values` rows for those records
5. Service transforms: maps `record_values` rows to flat object keyed by attribute slug
6. Service returns array of `FlatRecord` with typed values
7. Route wraps in `success(data)` response
8. Frontend consumes JSON via `fetch`

**Record Write (POST /api/v1/objects/[slug]/records):**

1. Middleware allows request if authenticated
2. Route parses request body: `{values: {[attributeSlug]: value, ...}}`
3. Route calls `createRecord(objectId, values, userId)` from service
4. Service:
   - Loads attribute definitions
   - For each attribute, maps value to correct typed column (via `ATTRIBUTE_TYPE_COLUMN_MAP`)
   - Inserts `record` row + multiple `record_values` rows (one per attribute)
   - Returns flat record
5. Route fires-and-forgets event handler for side effects (e.g., notifications)
6. Route returns `success(record, 201)`

**Filtering (GET /api/v1/objects/[slug]/records/query):**

1. Request includes `FilterGroup` (nested AND/OR structure with conditions)
2. Service loads attributes to build `Map<attributeSlug, {id, type}>`
3. Service calls `buildFilterSQL(filterGroup, attrMap)` to translate to SQL
4. Query builder generates `WHERE EXISTS (SELECT 1 FROM record_values rv WHERE ...)`
5. Each condition becomes `rv.attribute_id = ? AND rv.[type_column] = ?`
6. Drizzle executes; results are records with at least one matching attribute value
7. Service flattens results into `FlatRecord[]` and returns

**AI Chat (POST /api/v1/chat/completions):**

1. Route saves user message to conversation
2. Route builds system prompt by introspecting workspace object schema (attributes, enum values)
3. Route fetches conversation message history
4. Route calls `callOpenRouter()` with OpenRouter API + system prompt
5. OpenRouter response includes tool calls (if model chose a tool)
6. Route streams tokens via SSE
7. For each tool call:
   - If auto-execute (read tool): execute immediately, append result to conversation
   - If manual-confirm (write tool): pause stream, return confirmation UI, wait for user approval at `/api/v1/chat/tool-confirm`
8. After tool execution, call OpenRouter again with tool results appended to messages (up to 10 rounds)
9. Stream final assistant message

**State Management:**

- **Server state:** Persisted in PostgreSQL, accessed via services
- **Session state:** Managed by Better Auth (cookies), resolved per request in `getAuthContext()`
- **Workspace context:** Stored in `active-workspace-id` cookie, used by middleware to scope requests
- **Client state:** Minimal; mostly local state for UI interactions (form inputs, modals), synced with server on mutation

## Key Abstractions

**AuthContext:**
- Purpose: Represents authenticated user in current workspace
- Type: `{userId: string, workspaceId: string, workspaceRole: "admin" | "member", authMethod?: "cookie" | "api_key"}`
- Created by: `getAuthContext(req)` in `./apps/web/src/lib/api-utils.ts`
- Validation: Checked in every API route; middleware enforces cookie auth for UI routes

**FlatRecord:**
- Purpose: Flattened record with typed attribute values
- Type: `{id, objectId, createdAt, createdBy, updatedAt, values: Record<string, unknown>}`
- Pattern: Values keyed by attribute slug (e.g., `record.values["company-name"]`)
- Typing: Values are untyped (`unknown`) because attributes are dynamic per workspace

**FilterGroup & FilterCondition:**
- Purpose: Query DSL for dynamic filtering without schema changes
- Location: Defined in `@openclaw-crm/shared` (shared package)
- Structure: Nested groups with AND/OR operator; conditions with attribute slug, operator (equals, contains, greater_than, etc.), value
- Consumed by: `buildFilterSQL()` in query-builder, validated by routes

**ToolHandler:**
- Purpose: Define LLM tools the AI can call
- Type: `{requiresConfirmation: bool, execute: (args, ctx) => Promise<unknown>}`
- Pattern: 8 read tools (auto-execute) + 5 write tools (require confirmation)
- Examples: `searchRecords`, `getRecord`, `createRecord`, `updateRecord`, `deleteRecord`, `createNote`, `createTask`, `listTasks`

**WorkspaceSettings:**
- Purpose: Workspace-level configuration (stored as JSON in `workspaces.settings`)
- Fields: `openrouterApiKey?`, `openrouterModel?`, other future settings
- Scoping: Workspace-private; not exposed to other workspaces

## Entry Points

**Web App UI:**
- Location: `./apps/web/src/app/`
- Triggers: Browser navigation
- Responsibilities: Render pages, handle client-side interactivity, call API routes via `fetch`
- Auth: Better Auth session cookie validated by middleware

**API v1:**
- Location: `./apps/web/src/app/api/v1/`
- Triggers: HTTP requests (from frontend, external consumers)
- Responsibilities: Authenticate, validate, call services, return JSON
- Auth: Bearer token (API key) or session cookie

**Middleware:**
- Location: `./apps/web/src/middleware.ts`
- Triggers: Every request (except static assets)
- Responsibilities: Check auth, redirect unauthenticated users, enforce active workspace
- Flow: If no cookie → redirect to login; if cookie but no workspace → redirect to workspace selection

**Database Seeding:**
- Location: `./apps/web/src/db/seed.ts`
- Triggers: `pnpm db:seed` command
- Responsibilities: Create default objects (People, Companies, Deals) and deal stages per workspace

## Error Handling

**Strategy:** Fail fast with standardized JSON responses, no stack traces in production.

**Patterns:**

API responses:
```typescript
// Success: 200 (or 201 for POST)
{data: <any>}

// Error: 400, 401, 403, 404
{error: {code: "BAD_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND", message: string}}
```

Helper functions in `./apps/web/src/lib/api-utils.ts`:
- `unauthorized()` → 401
- `forbidden()` → 403
- `notFound()` → 404
- `badRequest(msg)` → 400
- `success(data, status?)` → 200 (or custom status)
- `requireAdmin(ctx)` → returns 403 if user not admin

Service-level errors:
- Throw native JavaScript `Error` with descriptive message
- API route catches and converts to appropriate HTTP status (not currently explicit; relies on error propagation)

## Cross-Cutting Concerns

**Logging:**
- Approach: `console.log()` / `console.error()` for development debugging
- No structured logging framework configured
- Notable: `[getAuthContext] auth.api.getSession threw:` logged on auth failures

**Validation:**
- Request body: Manual `typeof` checks or Zod schemas (partial use)
- Path params: Next.js type-safe via `params: Promise<{...}>`
- Example: `if (!values || typeof values !== "object")` in POST handlers

**Authentication:**
- Strategy: Two-track (session + API key) unified into `AuthContext`
- Middleware enforces on routes
- Services don't re-check; they assume `AuthContext` provided by route handler

**Authorization:**
- Workspace role checked with `requireAdmin(ctx)` helper
- No row-level access control (assumes single workspace = single team)

**Multi-tenancy Scoping:**
- Every query includes `workspace_id` WHERE clause
- Middleware sets `active-workspace-id` cookie
- Services don't assume workspace; routes provide via `ctx.workspaceId`

**Caching:**
- No application-level cache (Redis, etc.)
- Database queries not cached; fresh on every request
- UI uses server components where possible to avoid client-side fetching

---

*Architecture analysis: 2026-03-10*
