# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the repo root unless noted.

```bash
pnpm dev           # Start dev server at http://localhost:3001 (uses Turbopack)
pnpm build         # Build all packages
pnpm lint          # Lint all packages

pnpm db:push       # Push schema changes to DB (skips migration files)
pnpm db:generate   # Generate migration files from schema changes
pnpm db:migrate    # Apply migration files
pnpm db:seed       # Seed workspace, standard objects (People/Companies/Deals), deal stages

# E2E tests (run from apps/web/)
cd apps/web && pnpm test:e2e
cd apps/web && pnpm test:e2e:ui
```

There are no unit tests — only Playwright E2E tests in `apps/web/e2e/`.

## Environment Setup

Copy `.env.example` to `apps/web/.env`. Required vars:
- `DATABASE_URL` — PostgreSQL 16+ connection string
- `BETTER_AUTH_SECRET` — random string ≥32 chars
- `NEXT_PUBLIC_APP_URL` — app URL (defaults to `http://localhost:3001`)

Optional: `GITHUB_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET` for OAuth, `RESEND_API_KEY` for email.

Start the database: `docker compose up db -d`

## Architecture

**Monorepo**: Turborepo + pnpm workspaces. Two packages:
- `apps/web` — the Next.js 15 app (everything)
- `packages/shared` — types and constants shared between app code and potential external consumers

### Database: Typed EAV Pattern

The core data model is a **Typed Entity-Attribute-Value** pattern:

- `objects` — define entity types (People, Companies, Deals, or custom). Scoped by `workspace_id`.
- `attributes` — define fields on objects (17 types: text, number, currency, date, email, phone, select, status, rating, record_reference, etc.)
- `records` — instances of objects
- `record_values` — attribute values, stored in **typed columns** (`text_value`, `number_value`, `date_value`, `timestamp_value`, `boolean_value`, `json_value`, `referenced_record_id`, `actor_id`) with one column used per row based on attribute type. Indexed per type for native SQL filtering.

`ATTRIBUTE_TYPE_COLUMN_MAP` in `packages/shared` maps attribute types to their storage column.

Schema files live in `apps/web/src/db/schema/`. Drizzle ORM handles all DB access.

### Auth & Multi-tenancy

- **Better Auth** handles sessions (cookie-based) and OAuth (GitHub, Google optional)
- Every authenticated request resolves an `AuthContext` (`userId`, `workspaceId`, `workspaceRole`) via `getAuthContext()` in `apps/web/src/lib/api-utils.ts`
- Auth checks Bearer token (`oc_sk_` prefix API keys, SHA-256 hashed in DB) first, then falls back to session cookie + `active-workspace-id` cookie
- Middleware (`apps/web/src/middleware.ts`) guards all routes, redirecting unauthenticated users to `/login` and users without an active workspace to `/select-workspace`

### API Layer (`apps/web/src/app/api/v1/`)

Route handlers follow a consistent pattern:
1. Call `getAuthContext(req)` → return `unauthorized()` if null
2. Parse/validate request body
3. Call a service function from `apps/web/src/services/`
4. Return `success(data)`, `notFound()`, `badRequest(msg)`, or `forbidden(msg)`

All response helpers are in `apps/web/src/lib/api-utils.ts`.

### Services (`apps/web/src/services/`)

Business logic layer called by both API routes and server components. Key services:

| Service | Purpose |
|---------|---------|
| `records.ts` | CRUD for records + attribute value reads/writes |
| `objects.ts` | Object/attribute management |
| `attributes.ts` | Attribute CRUD and type management |
| `ai-chat.ts` | OpenRouter integration, tool definitions, multi-round tool calling (up to 10 rounds) |
| `search.ts` | Full-text search across records |
| `tasks.ts` | Task CRUD, uses `taskRecords` join table for record association |
| `notes.ts` | Note CRUD with TipTap rich text |
| `lists.ts` | Smart lists with filter criteria |
| `notifications.ts` | In-app notification system |
| `approvals.ts` | Approval rules and request processing |
| `contracts.ts` | Contract generation, templates, status tracking |
| `sequences.ts` | Email sequences with enrollment and steps |
| `generated-assets.ts` | AI-generated documents (briefs, proposals, etc.) |
| `activity-scoring.ts` | Composite activity scores with 30-day exponential decay |
| `automation-engine.ts` | Evaluates user-defined rules + built-in hardcoded rules |
| `webhook-delivery.ts` | HMAC-SHA256 signed delivery, 5s timeout, auto-disable after 10 failures |
| `crm-events.ts` | Dispatches record.created/updated/deleted and deal.stage_changed |
| `signals.ts` | Signal event system, auto-enqueues `signal_evaluate` jobs |
| `job-queue.ts` | Background job execution with `FOR UPDATE SKIP LOCKED` |
| `close-flow.ts` | Handoff brief generation for closed-won deals |
| `dashboard.ts` | Pipeline data for rep/manager/leadership views |
| `workspace.ts` | Workspace and member management |
| `api-keys.ts` | API key generation and validation |
| `analytics/win-loss.ts` | Win/loss pattern analysis (requires 30+ closed deals) |
| `analytics/rep-coaching.ts` | Rep performance coaching metrics |
| `analytics/forecasting.ts` | Pipeline forecast and revenue projections |
| `analytics/next-best-action.ts` | AI-powered next best action suggestions |

### Filtering & Sorting

`apps/web/src/lib/query-builder.ts` translates `FilterGroup`/`FilterCondition` (from `packages/shared`) into Drizzle SQL using correlated `EXISTS` subqueries against `record_values`. This enables compound AND/OR filters on any typed attribute without schema changes.

### Frontend

- **Next.js 15 App Router** with server and client components
- **shadcn/ui** + **Tailwind CSS v4** for UI
- **TanStack Table v8** for sortable/filterable data tables
- **dnd-kit** for Kanban drag-and-drop
- **TipTap** for rich text notes
- **Sonner** for toast notifications (4000ms, bottom-right, richColors)
- Dashboard routes are in `apps/web/src/app/(dashboard)/` (route group, requires auth + workspace)
- Auth routes in `apps/web/src/app/(auth)/`

### Navigation Structure

The sidebar is organized into 4 sections with a click-to-toggle collapse (persisted in localStorage):

| Section | Pages |
|---------|-------|
| **Core** | Home, Chat, Reviews (AI Drafts + Approvals tabs), Tasks, Notes, Notifications |
| **Records** | People, Companies, Deals (+ custom objects) |
| **Sales** | Dashboard (Pipeline + Win/Loss + Rep Coaching + Forecast tabs), Hot Leads, Sequences, Battlecards, Close (Contracts + Handoff tabs) |
| **Automation** | Automations |
| **Bottom** | Docs, Settings (General, Members, Objects, API Keys, AI Agent, Aria, Integrations, Approvals, Webhooks) |

Key consolidated pages:
- `/inbox` → "Reviews" — combines AI draft review + approval requests in tabs
- `/dashboard` → Pipeline view + analytics (Win/Loss, Rep Coaching, Forecast) in tabs
- `/close` → Contracts + Handoff briefs in tabs

### AI Chat

Uses OpenRouter (configured per workspace via Settings > AI). The chat system:
- Streams SSE responses from `/api/v1/chat/completions`
- Has 8 read tools (auto-execute) and 5 write tools (require user confirmation via `/api/v1/chat/tool-confirm`)
- Builds a dynamic system prompt from the workspace's object schema
- Stores conversations/messages in `chat.ts` schema tables

### Background Jobs & Automation

- Job queue uses `FOR UPDATE SKIP LOCKED` for concurrent safety
- Job types: `ai_generate`, `lead_score`, `email_send`, `meeting_prep`, `signal_evaluate`
- Automation engine evaluates both hardcoded built-in rules AND user-defined DB rules
- Signal events auto-enqueue evaluation jobs
- Webhook dispatch is always non-blocking and non-throwing (`.catch(() => {})`)
- Webhook events: `record.created`, `record.updated`, `record.deleted`, `deal.stage_changed`

### Form Validation

`apps/web/src/lib/attribute-schema.ts` provides `buildAttributeSchema()` which generates Zod schemas from EAV attribute definitions. Inline error display with red borders/labels, errors clear on change.

### Key Libraries & Patterns

- **Cursor-based pagination**: `apps/web/src/lib/cursor-pagination.ts` — Load More button in record tables
- **CSV import/export**: `apps/web/src/lib/csv-utils.ts` — field mapping, EAV flattening
- **Confirmation dialogs**: `apps/web/src/hooks/use-confirm-dialog.ts` — Promise-based, returns `Promise<boolean>`
- **Error boundaries**: `apps/web/src/components/error-boundary-wrapper.tsx` — wraps all dashboard routes
- **Activity scoring**: `(notes×3 + tasks×2 + completedTasks×1) × exp(-age/30days)` — Hot (≥8), Warm (≥4), Cold

### Important Constraints

- Zero `window.confirm()` or `window.alert()` calls — use `useConfirmDialog` hook or Sonner toasts
- Raw SQL `ANY(${array})` must NOT be used with Drizzle — use `inArray()` instead
- Webhook secrets are never returned in API responses — only `hasSecret` boolean flag
- Table headers use sentence case (no `uppercase tracking-wider`)
- Skeleton loading uses `bg-primary/10 animate-pulse` pattern
- Object nav icons are color-coded: People=violet, Companies=blue, Deals=emerald
- Toast duration 4000ms, position bottom-right, richColors enabled

## Full API Reference

### Records & Objects
```
GET,POST   /api/v1/objects                              # List/create objects
GET,PATCH,DELETE /api/v1/objects/{slug}                  # Get/update/delete object
GET,POST,PATCH,DELETE /api/v1/objects/{slug}/attributes  # Manage attributes
GET,POST,PATCH,DELETE /api/v1/objects/{slug}/attributes/options # Select/status options
GET,POST   /api/v1/objects/{slug}/records               # List/create records
POST       /api/v1/objects/{slug}/records/query          # Query with filters/sort/pagination
POST       /api/v1/objects/{slug}/records/import         # CSV import
POST       /api/v1/objects/{slug}/records/reorder        # Kanban reorder
GET,PATCH,DELETE /api/v1/objects/{slug}/records/{recordId} # Get/update/delete record
GET        /api/v1/objects/{slug}/records/{recordId}/activity # Activity timeline
GET,POST   /api/v1/objects/{slug}/records/{recordId}/notes   # Record notes
GET        /api/v1/objects/{slug}/records/{recordId}/related  # Related records
GET        /api/v1/objects/{slug}/records/{recordId}/tasks    # Record tasks
GET        /api/v1/records/{recordId}                    # Get record by ID (any object)
GET        /api/v1/records/browse                        # Browse records across objects
GET        /api/v1/search                                # Full-text search
```

### Tasks & Notes
```
GET,POST   /api/v1/tasks                    # List/create tasks
PATCH,DELETE /api/v1/tasks/{taskId}          # Update/delete task
GET,POST   /api/v1/notes                    # List/create notes
GET,PATCH,DELETE /api/v1/notes/{noteId}      # Get/update/delete note
```

### Lists
```
GET,POST   /api/v1/lists                              # List/create lists
GET,PATCH,DELETE /api/v1/lists/{listId}                # Get/update/delete list
GET,POST   /api/v1/lists/{listId}/entries              # List/add entries
PATCH,DELETE /api/v1/lists/{listId}/entries/{entryId}  # Update/remove entry
GET,POST,PATCH,DELETE /api/v1/lists/{listId}/attributes # List-specific attributes
GET        /api/v1/lists/{listId}/available-records     # Records not yet in list
```

### AI Chat
```
GET,POST   /api/v1/chat/conversations                    # List/create conversations
GET,PATCH,DELETE /api/v1/chat/conversations/{conversationId} # Manage conversation
POST       /api/v1/chat/completions                      # Stream AI response (SSE)
POST       /api/v1/chat/tool-confirm                     # Confirm/deny write tool execution
GET        /api/v1/chat/channels                         # List agent channels
```

### Reviews (Inbox)
```
GET        /api/v1/assets                           # List generated assets (AI drafts)
GET        /api/v1/assets/{id}                      # Get asset detail
POST       /api/v1/assets/{id}/approve              # Approve AI draft
POST       /api/v1/assets/{id}/reject               # Reject AI draft
GET,POST   /api/v1/approvals/requests               # List/create approval requests
GET        /api/v1/approvals/requests/{requestId}   # Get approval request
POST       /api/v1/approvals/requests/{requestId}/approve # Approve request
POST       /api/v1/approvals/requests/{requestId}/reject  # Reject request
GET,POST   /api/v1/approvals/rules                  # List/create approval rules
PUT,DELETE /api/v1/approvals/rules/{ruleId}          # Update/delete approval rule
```

### Dashboard & Analytics
```
GET        /api/v1/dashboard                    # Pipeline data (?view=rep|manager|leadership)
POST       /api/v1/dashboard/preferences        # Save dashboard view preference
GET        /api/v1/analytics/win-loss           # Win/loss pattern analysis
GET        /api/v1/analytics/rep-coaching       # Rep coaching metrics
GET        /api/v1/analytics/forecast           # Pipeline forecast
GET        /api/v1/analytics/next-best-action   # AI next best action
GET        /api/v1/activity-scores              # Activity scores (?limit=20)
```

### Sales Tools
```
GET,POST   /api/v1/sequences                    # List/create sequences
GET,PATCH,DELETE /api/v1/sequences/{id}          # Manage sequence
POST       /api/v1/sequences/{id}/steps          # Add sequence step
POST       /api/v1/sequences/{id}/enrollments    # Enroll contacts
GET        /api/v1/battlecards                   # List battlecards
```

### Close (Contracts + Handoff)
```
GET,POST   /api/v1/contracts                        # List/create contracts
GET,PATCH  /api/v1/contracts/{contractId}            # Get/update contract
GET        /api/v1/contracts/{contractId}/download   # Download contract
GET,POST   /api/v1/contracts/templates               # List/create templates
GET,POST   /api/v1/close-flow/handoff                # List/create handoff briefs
POST       /api/v1/close-flow/handoff/{assetId}/deliver # Deliver handoff via webhook
```

### Automations & Webhooks
```
GET,POST   /api/v1/automations              # List/create automation rules
GET,PATCH,DELETE /api/v1/automations/{id}    # Manage automation rule
GET,POST   /api/v1/webhooks                 # List/create outbound webhooks
PATCH,DELETE /api/v1/webhooks/{id}           # Update/delete webhook
POST       /api/v1/webhooks/{id}/test        # Send test ping to webhook
```

### Notifications
```
GET        /api/v1/notifications                     # List notifications (?limit=50)
PATCH      /api/v1/notifications/{notificationId}    # Mark as read
POST       /api/v1/notifications/mark-all-read       # Mark all as read
```

### Workspace & Settings
```
GET,POST   /api/v1/workspaces               # List/create workspaces
POST       /api/v1/workspaces/switch         # Switch active workspace
GET,PATCH  /api/v1/workspace                 # Get/update current workspace
GET,POST   /api/v1/workspace-members         # List/invite members
PATCH,DELETE /api/v1/workspace-members/{memberId} # Update/remove member
POST       /api/v1/invites/{token}/accept    # Accept workspace invite
GET,POST   /api/v1/api-keys                  # List/create API keys
DELETE     /api/v1/api-keys/{keyId}           # Revoke API key
GET,PATCH  /api/v1/ai-settings               # Get/update AI config (OpenRouter)
POST       /api/v1/ai-settings/test           # Test AI connection
GET        /api/v1/timeline/{recordId}        # Record activity timeline
```

### Integrations
```
GET        /api/v1/integrations/status                    # All integration statuses
GET        /api/v1/integrations/gmail/connect              # Start Gmail OAuth
GET        /api/v1/integrations/gmail/callback             # Gmail OAuth callback
POST       /api/v1/integrations/gmail/disconnect           # Disconnect Gmail
POST       /api/v1/integrations/gmail/send                 # Send email via Gmail
POST       /api/v1/integrations/gmail/webhook              # Gmail push notification
GET        /api/v1/integrations/outlook/connect             # Start Outlook OAuth
GET        /api/v1/integrations/outlook/callback            # Outlook OAuth callback
POST       /api/v1/integrations/outlook/disconnect          # Disconnect Outlook
POST       /api/v1/integrations/outlook/send                # Send email via Outlook
GET,POST   /api/v1/integrations/outlook/webhook             # Outlook webhook
POST       /api/v1/integrations/google-calendar/webhook     # Google Calendar webhook
GET,POST   /api/v1/integrations/outlook-calendar/webhook    # Outlook Calendar webhook
POST       /api/v1/integrations/linkedin/enrich             # LinkedIn profile enrichment
POST,PATCH /api/v1/integrations/zoom/connect                # Connect Zoom
POST       /api/v1/integrations/zoom/disconnect             # Disconnect Zoom
GET,POST   /api/v1/integrations/zoom/webhook                # Zoom webhook
POST       /api/v1/integrations/resend/webhook              # Resend email webhook
```

### Cron / Background Jobs
```
GET        /api/v1/cron/jobs              # Process background job queue
GET        /api/v1/cron/generate          # Trigger AI generation pipeline
GET        /api/v1/cron/approvals         # Process expired approvals
POST       /api/v1/cron/gmail-sync        # Sync Gmail messages
POST       /api/v1/cron/outlook-sync      # Sync Outlook messages
POST       /api/v1/cron/calendar-sync     # Sync calendar events
POST       /api/v1/cron/telephony         # Process telephony events
```
