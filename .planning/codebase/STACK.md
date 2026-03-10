# Technology Stack

**Analysis Date:** 2026-03-10

## Languages

**Primary:**
- TypeScript 5.7.0 - All application code, including Next.js app and shared utilities

**Secondary:**
- JavaScript - Build configuration files (postcss.config.mjs)

## Runtime

**Environment:**
- Node.js 20 LTS (Alpine-based Docker images)

**Package Manager:**
- pnpm 9.15.0
- Lockfile: `pnpm-lock.yaml` (present)

## Frameworks

**Core:**
- Next.js 15.1.0 - Full-stack React application with App Router, SSE, and API routes
- React 19.0.0 - UI component library
- Drizzle ORM 0.41.0 - PostgreSQL database access and migrations

**UI & Components:**
- shadcn/ui - Headless component library built on Radix UI primitives
- Radix UI 1.1.0-2.1.0 - Foundation for accessible component system
- TailwindCSS 4.0.0 - Utility-first CSS framework
- Lucide React 0.460.0 - Icon library

**Data & State:**
- TanStack Table (React Table) 8.21.3 - Sortable/filterable data tables
- dnd-kit 6.3.1 - Drag-and-drop library for Kanban boards

**Rich Text:**
- TipTap 3.19.0 - Rich text editor with extensions
- Remark 15.0.1 + Remark GFM 4.0.1 - Markdown parsing with GitHub-flavored support

**Testing:**
- Playwright 1.58.2 - E2E browser automation tests

**Build & Dev:**
- Turbo 2.5.0 - Monorepo build orchestration
- Drizzle Kit 0.31.4 - Database schema migrations

## Key Dependencies

**Critical:**
- `better-auth` 1.2.0+ - Session management, OAuth (GitHub, Google), email/password auth
- `postgres` 3.4.0 - PostgreSQL client with connection pooling
- `zod` 3.24.0 - TypeScript schema validation
- `date-fns` 4.1.0 - Date formatting and manipulation

**Infrastructure:**
- `@neondatabase/serverless` 0.10.0 - Serverless PostgreSQL driver (Neon support)
- `gray-matter` 4.0.3 - YAML frontmatter parsing
- `dotenv` 17.2.4 - Environment variable loading
- `@amplitude/analytics-browser` 2.36.0 - Browser-based analytics

**UI Utilities:**
- `class-variance-authority` 0.7.0 - Component variant system
- `clsx` 2.1.0 - Conditional className utility
- `cmdk` 1.1.1 - Command palette/search interface
- `tailwind-merge` 2.6.0 - Tailwind class conflict resolution

## Configuration

**Environment:**
- `.env` file required in `apps/web/` with variables from `.env.example`
- Key vars:
  - `DATABASE_URL` - PostgreSQL 16+ connection string
  - `BETTER_AUTH_SECRET` - ≥32 character random secret for session signing
  - `NEXT_PUBLIC_APP_URL` - Public application URL (defaults to `http://localhost:3001`)
  - `OPENROUTER_API_KEY` - Optional; can be set per-workspace in Settings
  - `OPENROUTER_MODEL` - Optional; defaults to `anthropic/claude-sonnet-4`
  - `GITHUB_CLIENT_ID/SECRET` - Optional OAuth provider
  - `GOOGLE_CLIENT_ID/SECRET` - Optional OAuth provider
  - `NEXT_PUBLIC_AMPLITUDE_API_KEY` - Optional analytics
  - `TRUSTED_ORIGINS` - Comma-separated origins for CORS (optional)

**Build:**
- `next.config.ts` - Next.js configuration with Turbopack dev bundler
- `drizzle.config.ts` - Drizzle ORM configuration pointing to schema and migrations
- `playwright.config.ts` - E2E test configuration
- `postcss.config.mjs` - PostCSS with Tailwind v4 plugin
- `tsconfig.json` - Path aliases: `@/*` → `./src/*`

## Platform Requirements

**Development:**
- Node.js 20 LTS
- PostgreSQL 16+ (via Docker or remote)
- pnpm 9.15.0+

**Production:**
- Node.js 20 LTS
- PostgreSQL 16+
- Docker 20.10+ (Dockerfile provided with multi-stage build)
- Environment: Stateless Next.js on serverless or container platforms

**Database:**
- PostgreSQL 16 Alpine (docker-compose.yml)
- Drizzle migrations stored in `apps/web/src/db/migrations/`
- SSL required in production (`process.env.NODE_ENV === "production"`)

## Deployment

**Docker:**
- Multi-stage build: deps → builder → runner
- Production image: Node.js 20 Alpine
- Output: Standalone Next.js server (`NEXT_OUTPUT=standalone`)
- Exposes port 3000

**Development:**
- Turbopack-enabled dev server on port 3001
- Hot module replacement (HMR)

---

*Stack analysis: 2026-03-10*
