# Decisions Register

<!-- Append-only. Never edit or remove existing rows.
     To reverse a decision, add a new row that supersedes it.
     Read this file at the start of any planning or research phase. -->

| # | When | Scope | Decision | Choice | Rationale | Revisable? |
|---|------|-------|----------|--------|-----------|------------|
| 1 | 2026-03-10 | data-model | Core data model pattern | Typed EAV (objects/attributes/records/record_values) | Enables custom objects/fields per workspace without migrations | No |
| 2 | 2026-03-10 | ai | AI provider | OpenRouter (multi-model, workspace-configurable) | Multi-model flexibility, workspace-level model selection | No |
| 3 | 2026-03-10 | architecture | Background job execution | PostgreSQL background_jobs table with cron polling (no pg-boss/BullMQ/Redis) | CRM scale doesn't need external job queue; keeps infrastructure simple | Yes |
| 4 | 2026-03-10 | architecture | Signal-driven automation | CRM events → signal_events → automation rules → job dispatch | Decouples event producers from action handlers | No |
| 5 | 2026-03-10 | auth | Auth system | Better Auth for sessions + OAuth, API keys (oc_sk_ prefix) for external | Committed, handles both browser sessions and programmatic access | No |
| 6 | 2026-03-10 | ui | Toast notifications | Sonner (shadcn/ui native integration) | Lightweight, imperative API, replaces all window.alert() | No |
| 7 | 2026-03-10 | data | Pagination strategy | Cursor-based (not offset) | Better perf for large datasets, stable under inserts | No |
| 8 | 2026-03-11 | roadmap | v2.0 phase ordering | 6 phases (6-11): Infrastructure first, then sync, then AI, then power user features | Job system fix unblocks all async features; dependency graph dictates order | Yes |
| 9 | 2026-03-11 | roadmap | Phase parallelism | Phases 9+10 depend only on Phase 6 (parallel with 7-8); Phase 11 depends on 8 | Maximizes parallelism where dependencies allow | Yes |
| 10 | 2026-03-10 | ui | Contract PDF generation | Deferred — text download only (React 19 + @react-pdf/renderer compatibility risk) | Install later when verified compatible | Yes |
| 11 | 2026-03-10 | ai | PII safety in analytics | Rep names never sent to LLM; enriched server-side after LLM calls complete | Privacy by design for OpenRouter calls | No |
| 12 | 2026-03-11 | architecture | Email sending path | Always OAuth provider API (never SMTP relay) for user-addressed mail | SPF/DKIM/DMARC alignment fails with relay, causing spam | No |
| 13 | 2026-03-11 | architecture | AI generation cost control | Per-workspace daily budget + 15-min dedup window from day one | Prevents cost blowout from signal cascades | No |
| 14 | 2026-03-11 | stack | New v2.0 packages | 9 packages: sonner, react-error-boundary, react-hook-form, @hookform/resolvers, @xyflow/react, @tanstack/react-virtual, papaparse, @tiptap/extension-mention, @tiptap/suggestion | Minimal additions, all verified compatible | Yes |
| 15 | 2026-03-11 | architecture | Workflow automation UI | Form-based trigger-condition-action (not node-graph) | Covers 90% of CRM automations; 10x less effort than visual graph editor | Yes |
