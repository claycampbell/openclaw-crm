# External Integrations

**Analysis Date:** 2026-03-10

## APIs & External Services

**LLM & AI:**
- OpenRouter - AI chat interface for multi-model LLM access
  - SDK/Client: `fetch` HTTP calls to `https://openrouter.ai/api/v1/chat/completions`
  - Auth: Bearer token from `OPENROUTER_API_KEY` (workspace setting or env var)
  - Implementation: `apps/web/src/services/ai-chat.ts` → `callOpenRouter()` function
  - Default model: `anthropic/claude-sonnet-4`
  - Supports tool calling with auto-execute (read) and confirmation (write) workflows
  - Headers: `Authorization` (Bearer token), `Content-Type: application/json`, `HTTP-Referer`

## Data Storage

**Databases:**
- PostgreSQL 16 (primary data store)
  - Connection: `DATABASE_URL` environment variable
  - Client: `postgres` package (node-postgres driver)
  - ORM: Drizzle ORM 0.41.0
  - Architecture: Typed Entity-Attribute-Value (EAV) pattern with typed value columns
  - Schema location: `apps/web/src/db/schema/`
    - `auth.ts` - Better Auth tables (users, sessions, accounts, verifications)
    - `workspace.ts` - Workspace and membership management
    - `objects.ts` - Object/attribute definitions
    - `records.ts` - Record instances and attribute values (with typed columns: `text_value`, `number_value`, `currency_value`, `date_value`, `timestamp_value`, `boolean_value`, `json_value`, `referenced_record_id`, `actor_id`)
    - `notes.ts` - Rich text notes linked to records
    - `tasks.ts` - Task management
    - `lists.ts` - Custom list definitions and entries
    - `notifications.ts` - Event notifications
    - `api-keys.ts` - API key storage (hashed with SHA-256)
    - `chat.ts` - Conversation and message history
  - Migrations: `apps/web/src/db/migrations/` (managed by Drizzle Kit)
  - SSL required in production

**File Storage:**
- Local filesystem only via Next.js public directory (`apps/web/public/`)
- No cloud storage integration detected

**Caching:**
- None configured; Drizzle queries are direct to PostgreSQL

## Authentication & Identity

**Auth Provider:**
- Better Auth 1.2.0 (custom auth framework)
  - Implementation: `apps/web/src/lib/auth.ts`
  - Database: Drizzle adapter with custom schema
  - Session: 7-day expiration with 1-day update window
  - Methods:
    - Email/password (enabled)
    - GitHub OAuth (optional, requires `GITHUB_CLIENT_ID/SECRET`)
    - Google OAuth (optional, requires `GOOGLE_CLIENT_ID/SECRET`)
  - Session storage: Cookie-based
  - Base URL: `NEXT_PUBLIC_APP_URL` (defaults to `http://localhost:3001`)

**Authorization:**
- Custom context layer: `getAuthContext()` in `apps/web/src/lib/api-utils.ts`
  - Resolves: `userId`, `workspaceId`, `workspaceRole` (admin/member)
  - Auth chain: Bearer token (API key, `oc_sk_` prefix, SHA-256 hashed) → Session cookie + `active-workspace-id` cookie
  - Applied to: All route handlers via `apps/web/src/app/api/v1/**` routes
  - Middleware: `apps/web/src/middleware.ts` guards routes, redirects to `/login` or `/select-workspace`

**API Keys:**
- Workspace-scoped API keys with `oc_sk_` prefix
- Storage: Hashed (SHA-256) in `api-keys` table
- Lookup: By workspace ID and key hash
- Service: `apps/web/src/services/api-keys.ts`

## Monitoring & Observability

**Error Tracking:**
- None configured (no Sentry, Rollbar, etc.)

**Logs:**
- Server-side: Node.js console (captured via Docker container logs)
- Client-side: Browser console

**Analytics:**
- Amplitude 2.36.0 (optional, browser-based)
  - Implementation: `apps/web/src/components/analytics/amplitude-script.tsx`
  - API Key: `NEXT_PUBLIC_AMPLITUDE_API_KEY` (optional)
  - Client: `@amplitude/analytics-browser`
  - Initialization: Conditional on `NEXT_PUBLIC_AMPLITUDE_API_KEY` presence
  - Tracking: `apps/web/src/lib/analytics.ts` → `track()` helper

## CI/CD & Deployment

**Hosting:**
- Containerized (Docker) with public port 3000
- Stateless application for serverless/container deployment
- Multi-stage build with standalone Next.js output

**CI Pipeline:**
- None detected (no GitHub Actions, GitLab CI, etc. configs)

**Secrets Management:**
- Environment variables only (.env file, Docker env)
- SSH: Not configured

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` - PostgreSQL connection string
- `BETTER_AUTH_SECRET` - ≥32 char random secret
- `NEXT_PUBLIC_APP_URL` - Public app URL

**Optional env vars:**
- `OPENROUTER_API_KEY` - AI integration (can also be set per-workspace)
- `OPENROUTER_MODEL` - LLM model selection
- `GITHUB_CLIENT_ID/SECRET` - OAuth
- `GOOGLE_CLIENT_ID/SECRET` - OAuth
- `NEXT_PUBLIC_AMPLITUDE_API_KEY` - Analytics
- `TRUSTED_ORIGINS` - CORS origins (comma-separated)
- `NODE_ENV` - Set to `production` for SSL requirement
- `NEXT_OUTPUT` - Set to `standalone` in Docker for optimized output
- `NEXT_TELEMETRY_DISABLED` - Set in Docker builds
- `BASE_URL` - Playwright test base URL (defaults to `http://localhost:3000`)

**Secrets location:**
- `.env` file in `apps/web/` (Git-ignored)
- Docker environment variables in `docker-compose.yml`

## Webhooks & Callbacks

**Incoming:**
- Workspace invite accept: `/api/v1/invites/[token]/accept` - Token-based workspace invitation flow
- Better Auth routes: `/api/auth/[...all]` - OAuth callback routing

**Outgoing:**
- None detected (no outbound webhook calls to external services)

## Data Integration Points

**Search:**
- Full-text search: `apps/web/src/services/search.ts` → `globalSearch()` - Native PostgreSQL search across records

**Chat Tools:**
- 8 read-only tools (auto-execute):
  - `search_records` - Full-text search
  - `get_record` - Fetch single record with attributes
  - `list_records` - Paginated record listing
  - `list_objects` - Available object types
  - `get_object_schema` - Object definition with attributes
  - `list_tasks` - User/workspace tasks
  - `list_lists` - Custom list definitions
  - `list_list_entries` - Entries within a list
- 5 write tools (require user confirmation):
  - `create_record` - New record creation
  - `update_record` - Record attribute updates
  - `delete_record` - Record deletion
  - `create_task` - Task creation
  - `create_note` - Note creation on records
- Implementation: `apps/web/src/services/ai-chat.ts` → `toolDefinitions` and `toolHandlers`
- Streaming: Server-Sent Events (SSE) from `/api/v1/chat/completions`
- Confirmation: `/api/v1/chat/tool-confirm` endpoint

---

*Integration audit: 2026-03-10*
