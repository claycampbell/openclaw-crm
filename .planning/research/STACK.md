# Technology Stack

**Project:** OpenClaw CRM v2.0 -- Stack Additions
**Researched:** 2026-03-11
**Scope:** NEW libraries/patterns only for v2.0 features. Existing stack (Next.js 15, Drizzle, PostgreSQL 16+, Better Auth, shadcn/ui, TanStack Table, TipTap, dnd-kit, Zod, googleapis, assemblyai) is validated and not re-evaluated.

---

## Context: What Exists and Works

The v1.0 stack is committed. The project already has:
- A working `background_jobs` table with `job-queue.ts` service (enqueue + processJobs with retry)
- A cron route at `/api/v1/cron/jobs` that calls `processJobs(10)`
- An `automation_rules` schema with trigger/condition/action pattern
- An `automation-engine.ts` that evaluates signals and enqueues jobs
- A hand-rolled CSV parser/exporter in `csv-utils.ts`
- An `email_messages` schema with thread support
- `signal_events` and `processed_signals` tables for event processing
- Gmail, Outlook, Zoom OAuth integration stubs
- `generated-assets` schema for AI-produced documents

The research below covers **only net-new library additions** needed for the v2.0 feature set.

---

## Recommended Stack Additions

### 1. Toast Notifications -- sonner

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **sonner** | ^2.0.7 | Toast notification system | shadcn/ui first-class integration (official component). Imperative `toast()` API callable from anywhere without hooks or providers. TypeScript-first. Used by OpenAI, Adobe, Sonos. |

**Confidence:** HIGH -- shadcn/ui official component, verified v2.0.7 on npm (Mar 2026).

**Integration:** Add `<Toaster />` to root layout once. Replace all `window.alert()` and inline error states with `toast()`, `toast.error()`, `toast.success()`. No Context provider needed -- sonner uses a global singleton.

**Why not react-hot-toast:** sonner has native shadcn/ui integration via their component library; react-hot-toast requires custom styling to match.

---

### 2. Error Boundaries -- react-error-boundary

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **react-error-boundary** | ^6.1.1 | Graceful error recovery in client components | Standard React error boundary wrapper by Brian Vaughn (React core team). Provides `ErrorBoundary` component, `useErrorBoundary()` hook, and `fallbackRender` prop. Works with React 19. 3KB. |

**Confidence:** HIGH -- v6.1.1 published Feb 2026, actively maintained.

**Integration:** Wrap route segments and critical client components (record tables, kanban boards, AI chat). Use `onReset` to clear stale state. Pair with sonner to toast error details before showing fallback UI.

---

### 3. Form Validation -- react-hook-form

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **react-hook-form** | ^7.54.0 | Form state management with inline validation | Uncontrolled form approach minimizes re-renders. shadcn/ui Form component is built on react-hook-form. |
| **@hookform/resolvers** | ^5.2.2 | Zod-to-react-hook-form bridge | Connects existing Zod schemas to form validation via single `zodResolver(schema)` call. |

**Confidence:** HIGH -- shadcn/ui Form component docs use this exact stack. Zod already installed (^3.24.0). Versions verified on npm.

**Why v7 stable, not v8 beta:** react-hook-form v8 entered beta (v8.0.0-beta.1) in Jan 2026 with breaking changes. Stay on stable v7 for production.

**Why not manual Zod validation:** react-hook-form handles focus management on errors, dirty/touched tracking, submission states, and field-level error display. The EAV dynamic forms (variable field counts per object) benefit from `useFieldArray` and dynamic field registration. Building this by hand is 500+ lines of boilerplate per form.

**Integration:** Use shadcn/ui `<Form>`, `<FormField>`, `<FormMessage>` components. Apply `zodResolver` with Zod schemas already in the services layer. Add to: record create/edit modal, workspace settings forms, automation rule editor, import field mapping.

---

### 4. Visual Workflow Builder -- @xyflow/react

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **@xyflow/react** | ^12.10.1 | Node-based visual workflow/automation builder | The standard for node-graph UIs in React. 25k+ GitHub stars. Custom nodes, edges, handles. Built-in minimap, controls, background grid. MIT licensed. Migrated their own docs to Next.js App Router. |

**Confidence:** HIGH -- v12.10.1 published Feb 2026, actively maintained, verified on npm.

**Integration:** Define custom node types for: triggers (signal events like stage_changed, email_received), conditions (field comparisons, time delays), and actions (enqueue_ai_generate, create_task, send_email). Store the workflow graph as JSONB -- either extend the existing `automation_rules.conditions` / `action_payload` columns or add a `workflow_graph` JSONB column to `automation_rules`. The visual builder becomes the UI for the automation engine that already exists in `automation-engine.ts`.

**Why not alternatives:**
- **n8n embed** -- Too heavy, brings its own backend and database, AGPL licensing.
- **Custom dnd-kit** -- dnd-kit (already installed) handles linear drag-and-drop but lacks edge routing, connection handles, layout algorithms, and minimap that a workflow graph requires.
- **Flume / rete.js** -- @xyflow/react has 10x the community, better docs, active maintenance.

---

### 5. Virtual Scrolling -- @tanstack/react-virtual

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **@tanstack/react-virtual** | ^3.13.21 | Virtual scrolling for large record lists | Same TanStack ecosystem as react-table (already installed). Virtualizes DOM so only visible rows render. Essential for replacing the hardcoded `limit=200`. |

**Confidence:** HIGH -- v3.13.21 published Mar 2026, same maintainers as TanStack Table.

**Cursor-based pagination:** Use Drizzle's native cursor pagination pattern (documented in official Drizzle guides). No additional library needed. Implement a `cursorPaginate()` helper using `where(gt(column, cursor)).limit(pageSize)` with composite cursor (`createdAt` + `id`) for stable ordering.

**Why not offset pagination:** PROJECT.md already decided cursor-based. Offset skips/duplicates rows during concurrent inserts and degrades as offset grows (Postgres scans all skipped rows). Cursor is O(1) for any page.

**Why not drizzle-cursor / drizzle-pagination packages:** Thin wrappers (~50 lines) around a pattern Drizzle documents natively. Adding a dependency for trivial code creates maintenance burden for no benefit.

---

### 6. @mentions -- TipTap Extensions

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **@tiptap/extension-mention** | ^3.20.1 | @mention support in TipTap editors | First-party TipTap extension. Version-aligned with existing TipTap ^3.19.x. Renders mention nodes with customizable display. |
| **@tiptap/suggestion** | ^3.20.1 | Autocomplete dropdown for mentions | Peer dependency of extension-mention. Provides suggestion popup lifecycle (show, navigate, select). |

**Confidence:** HIGH -- first-party TipTap extensions, published Mar 2026, version-aligned with installed TipTap.

**Integration:** Add to existing TipTap editor config in `note-editor.tsx` and the message input component. Provide a `suggestion` config that queries workspace members via existing `/api/v1/workspace/members`. Store mentions as TipTap JSON nodes. Extract mentioned user IDs server-side when saving to create notification records via the existing notifications service.

---

### 7. CSV Import -- papaparse

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **papaparse** | ^5.5.2 | Robust CSV parsing for import with field mapping | Production-grade CSV parser with Web Worker support for large files, encoding detection, streaming, header auto-detection. 5M+ weekly npm downloads. |

**Confidence:** HIGH -- industry standard, battle-tested.

**Dev dependency:**

| Technology | Version | Purpose |
|------------|---------|---------|
| **@types/papaparse** | latest | TypeScript definitions |

**Why replace the existing parser:** The current `parseCSV()` in `csv-utils.ts` is ~60 lines handling basic quoting. It lacks: streaming for large files (10k+ rows), BOM/encoding detection, Web Worker support (UI blocks during parse), type inference, and error recovery on malformed rows. For production import with field mapping and duplicate detection, PapaParse handles the edge cases.

**Integration:** Use PapaParse client-side with `Papa.parse(file, { worker: true, step: callback })` for streaming. The field mapping UI maps PapaParse-detected headers to workspace attribute slugs. Keep existing `generateCSV()` for export (it works fine).

---

### 8. URL State Management (Conditional) -- nuqs

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **nuqs** | ^2.x | Type-safe URL search params for pagination, filters, sort | Like `useState` but stored in URL. Used by Vercel, Sentry, Supabase. Featured at Next.js Conf 2025. 6KB gzipped. Native App Router support. |

**Confidence:** MEDIUM -- excellent library but conditional. Add it if URL-shareable table views (bookmarkable filtered/sorted/paginated states) are a requirement. If internal-only views are fine, skip it and use component state.

**Integration:** Define typed parsers for cursor, pageSize, sortColumn, sortDirection. Use `useQueryState()` in table components. Enables shareable filtered views and browser back/forward through pagination.

---

## Libraries to NOT Add

| Library | Why Not | Use Instead |
|---------|---------|-------------|
| **pg-boss** | The existing `background_jobs` table + `job-queue.ts` + `processJobs()` already implements claim-execute-retry with proper indexing. pg-boss adds its own schema, advisory locks, and maintenance cron. The current stub just needs its `processJobs()` to call `executeJob()` (it currently skips straight to "completed"). Fix the 3-line bug, do not replace the architecture. | Fix existing `job-queue.ts` |
| **BullMQ / Redis** | Requires Redis infrastructure. PostgreSQL-based job queue is sufficient for CRM workloads. | Existing `background_jobs` table |
| **Trigger.dev / Inngest** | Managed platforms introduce external vendor dependency for job processing that touches PII (email content, contact data). | Existing job queue |
| **socket.io / Pusher** | Real-time push (live notifications, presence) is out of scope for v2.0. SSE exists for AI chat. Polling handles notification badges. WebSockets add infrastructure. | Polling / SSE |
| **xlsx / exceljs** | Excel export not in v2.0 requirements. CSV covers the use case. Add later if needed. | CSV via existing `generateCSV()` |
| **Resend React Email for compose** | Email compose should send through user's own Gmail/Outlook OAuth. Resend is for system transactional emails (invites, notifications), not user compose. | Gmail/Outlook APIs |
| **Prisma** | Drizzle ORM is committed. No migration. | Drizzle |
| **tRPC** | 99 REST API routes with established patterns. Adding tRPC creates two paradigms. | Existing REST routes |
| **Jotai / Zustand** | No global state manager needed. react-hook-form handles forms, nuqs handles URL state, React context handles the rest. | React state + context |
| **Temporal / Conductor** | Extreme operational overhead for workflow orchestration. Requires running a separate server. The automation engine + visual builder + background jobs covers workflow needs. | @xyflow/react + automation-engine.ts |
| **Vercel AI SDK** | The existing `ai-chat.ts` uses raw OpenRouter fetch with SSE streaming that works. The AI SDK would be a rewrite of working code. For structured generation, raw JSON mode with Zod validation is sufficient -- the schemas already exist. | Existing OpenRouter integration |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Toast | sonner ^2.0.7 | react-hot-toast | sonner has native shadcn/ui integration; react-hot-toast needs custom styling |
| Workflow UI | @xyflow/react ^12.10.1 | Flume, rete.js | @xyflow/react has 10x community, better docs, MIT license |
| Form validation | react-hook-form ^7.54 + Zod | Conform | Conform is less mature, fewer shadcn/ui examples |
| CSV parsing | papaparse ^5.5.2 | csv-parse, d3-dsv | PapaParse has browser Web Worker support; csv-parse is Node-focused |
| Virtual scroll | @tanstack/react-virtual ^3.13.21 | react-window, react-virtuoso | TanStack ecosystem consistency with existing TanStack Table |
| Error boundary | react-error-boundary ^6.1.1 | Custom class component | Library provides hooks, reset, fallback patterns |
| Mentions | @tiptap/extension-mention ^3.20.1 | Custom ProseMirror plugin | First-party, version-aligned, maintained by TipTap team |

---

## Installation

```bash
# From apps/web/

# Definite additions (all v2.0 features need these)
pnpm add sonner react-error-boundary react-hook-form @hookform/resolvers @xyflow/react @tanstack/react-virtual papaparse @tiptap/extension-mention @tiptap/suggestion

# Type definitions
pnpm add -D @types/papaparse

# Conditional (evaluate during pagination implementation)
# pnpm add nuqs
```

---

## Summary: Stack Changes by v2.0 Feature

| v2.0 Feature | New Library | Existing Stack Used |
|--------------|-------------|---------------------|
| Toast notifications | **sonner** | shadcn/ui Toaster component |
| Error boundaries | **react-error-boundary** | React 19 |
| Form validation | **react-hook-form**, **@hookform/resolvers** | Zod ^3.24.0 (already installed) |
| Workflow builder | **@xyflow/react** | automation_rules schema, automation-engine.ts |
| Pagination + infinite scroll | **@tanstack/react-virtual** | Drizzle cursor queries, TanStack Table |
| @mentions + comments | **@tiptap/extension-mention**, **@tiptap/suggestion** | TipTap ^3.19.x, notifications service |
| Import improvements | **papaparse** | csv-utils.ts (export stays), csv-import-modal.tsx |
| Confirmation dialogs | *None* | shadcn/ui AlertDialog (Radix already installed) |
| Background job execution | *None -- fix existing stub* | background_jobs table, job-queue.ts, cron/jobs route |
| AI asset generation | *None* | OpenRouter, generated-assets schema, automation-engine |
| Integration sync | *None* | googleapis (installed), integration services |
| Analytics calculations | *None* | Drizzle aggregate queries, existing analytics services |
| Email compose | *None* | Gmail/Outlook OAuth (installed), email_messages schema |
| Activity scoring | *None* | signal_events schema, Drizzle aggregate queries |
| Team collaboration | *None beyond TipTap mention ext* | notifications, workspace members, existing chat |
| CSV export | *None* | csv-utils.ts generateCSV (works) |
| Outbound webhooks | *None* | background_jobs (enqueue webhook delivery as job) |
| URL state (conditional) | **nuqs** | useSearchParams |

**Net new packages: 9 definite + 1 conditional + 1 dev dependency = 10-11 total.**

---

## Sources

- [sonner on npm](https://www.npmjs.com/package/sonner) -- v2.0.7, verified Mar 2026
- [sonner shadcn/ui integration](https://ui.shadcn.com/docs/components/radix/sonner)
- [react-error-boundary on npm](https://www.npmjs.com/package/react-error-boundary) -- v6.1.1, verified Mar 2026
- [@xyflow/react on npm](https://www.npmjs.com/package/@xyflow/react) -- v12.10.1, verified Mar 2026
- [React Flow Next.js/Tailwind 4 update](https://reactflow.dev/whats-new/2025-10-28)
- [react-hook-form docs](https://react-hook-form.com/docs/useform)
- [@hookform/resolvers on npm](https://www.npmjs.com/package/@hookform/resolvers) -- v5.2.2, verified Mar 2026
- [shadcn/ui Form component](https://ui.shadcn.com/docs/forms/react-hook-form)
- [@tanstack/react-virtual on npm](https://www.npmjs.com/package/@tanstack/react-virtual) -- v3.13.21, verified Mar 2026
- [Drizzle cursor-based pagination guide](https://orm.drizzle.team/docs/guides/cursor-based-pagination)
- [PapaParse on npm](https://www.npmjs.com/package/papaparse) -- v5.5.x
- [@tiptap/extension-mention on npm](https://www.npmjs.com/package/@tiptap/extension-mention) -- v3.20.1, verified Mar 2026
- [nuqs official site](https://nuqs.dev/) -- featured at Next.js Conf 2025
- [nuqs at React Advanced 2025](https://www.infoq.com/news/2025/12/nuqs-react-advanced/)
