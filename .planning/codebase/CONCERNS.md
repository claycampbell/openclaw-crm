# Codebase Concerns

**Analysis Date:** 2026-03-10

## Tech Debt

**Markdown HTML Sanitization:**
- Issue: remark-html configured with `sanitize: false` in content rendering pipeline
- Files: `apps/web/src/lib/content.ts` (line 42)
- Impact: Blog posts and comparison pages use `dangerouslySetInnerHTML` to render HTML from markdown, opening XSS vulnerability if markdown contains untrusted content
- Fix approach: Enable HTML sanitization by removing `{ sanitize: false }` or use DOMPurify/rehype-sanitize library to properly escape dangerous HTML elements

**Large Complex Components:**
- Issue: Multiple components exceed 600+ lines, combining multiple concerns in single files
- Files:
  - `apps/web/src/components/tasks/task-dialog.tsx` (731 lines)
  - `apps/web/src/app/(dashboard)/home/page.tsx` (675 lines)
  - `apps/web/src/app/(dashboard)/settings/aria/page.tsx` (602 lines)
  - `apps/web/src/components/records/record-kanban.tsx` (561 lines)
- Impact: Difficult to test, maintain, and reason about; increases cognitive load for developers
- Fix approach: Extract reusable sub-components, separate logic/presentation concerns, consider custom hooks for state management

**Missing Request Validation in JSON Parsing:**
- Issue: Multiple `JSON.parse()` calls wrapped in try-catch with empty catch blocks, silently swallowing parse errors
- Files:
  - `apps/web/src/app/api/v1/chat/completions/route.ts` (lines 212, 247)
  - `apps/web/src/app/api/v1/chat/tool-confirm/route.ts` (lines 70, 222, 248)
  - `apps/web/src/app/(dashboard)/chat/page.tsx` (multiple locations)
- Impact: Silent failures make debugging difficult; malformed tool arguments could be processed as empty objects `{}`
- Fix approach: Log parse failures, validate parsed data against schemas (zod), return explicit error responses to client

**No Database Transactions for Multi-Step Operations:**
- Issue: Record create/update operations involve multiple sequential DB calls without transaction wrapping
- Files: `apps/web/src/services/records.ts` (lines 352-369, 372-414)
- Impact: Race conditions possible if requests fail mid-operation; orphaned record_values if record insert succeeds but value inserts fail
- Fix approach: Wrap create/update/delete operations in `db.transaction()` calls to ensure atomicity

**Hard-Coded Default AI Model:**
- Issue: Default model `anthropic/claude-sonnet-4` is hard-coded; if OpenRouter deprecates this model, users get no fallback
- Files: `apps/web/src/services/ai-chat.ts` (line 73), `apps/web/src/services/ai-chat.ts` (line 573)
- Impact: Application breaks if model becomes unavailable; no graceful degradation
- Fix approach: Add configurable fallback models, implement model availability check with graceful error messages

**Fire-and-Forget Database Operations:**
- Issue: Several DB operations are not awaited and exceptions are caught and ignored
- Files:
  - `apps/web/src/app/api/v1/chat/completions/route.ts` (lines 62-68): title generation
  - `apps/web/src/lib/api-utils.ts` (lines 129-133): API key last_used_at update
- Impact: Silent failures in background operations; difficult to debug; data inconsistency
- Fix approach: Properly await all DB operations or use proper async task queue (e.g., Bull, BullMQ)

**Missing Cascading Delete Validation:**
- Issue: Record deletion via `deleteRecord()` cascades to record_values but no check for dependent references
- Files: `apps/web/src/services/records.ts` (lines 417-428)
- Impact: Deleting a record can orphan `referenced_record_id` foreign keys if other records point to it
- Fix approach: Add `getRelatedRecords()` check before delete, warn user or prevent deletion if references exist

## Known Bugs

**Incomplete Tool Call Error Handling:**
- Symptoms: If OpenRouter returns malformed tool_calls delta (missing id, name, or arguments), the code may create incomplete tool call objects
- Files: `apps/web/src/app/api/v1/chat/completions/route.ts` (lines 153-169), `apps/web/src/app/api/v1/chat/tool-confirm/route.ts` (lines 189-205)
- Trigger: LLM returns delta with missing fields
- Workaround: Validate tool call objects have all required fields before processing

**Race Condition in Conversation Title Generation:**
- Symptoms: Two concurrent API calls to completions endpoint may both trigger title generation, causing duplicate updates
- Files: `apps/web/src/app/api/v1/chat/completions/route.ts` (lines 59-69)
- Trigger: Rapidly send multiple messages to same conversation
- Workaround: Frontend should disable message input during title generation

**Test Skipped Due to Auth State:**
- Symptoms: All dashboard E2E tests are skipped and will not run in CI
- Files: `apps/web/e2e/dashboard.spec.ts` (line 8)
- Trigger: No authenticated test user session setup
- Workaround: Use Playwright storageState to save authenticated session

## Security Considerations

**XSS via HTML Rendering:**
- Risk: Blog and comparison pages render markdown-to-HTML without sanitization, trusting all markdown content
- Files: `apps/web/src/lib/content.ts` (line 42), `apps/web/src/app/blog/[slug]/page.tsx` (dangerouslySetInnerHTML), `apps/web/src/app/compare/[slug]/page.tsx` (dangerouslySetInnerHTML)
- Current mitigation: Content is stored in Git, not user-supplied
- Recommendations:
  - Enable HTML sanitization in remark config
  - Or use `rehype-sanitize` plugin
  - Add Content Security Policy headers
  - Regular security audits of content files

**API Key Exposure in Error Messages:**
- Risk: Tool execution errors could leak partial API responses containing sensitive data
- Files: `apps/web/src/app/api/v1/chat/completions/route.ts` (line 278), `apps/web/src/app/api/v1/chat/tool-confirm/route.ts` (line 261)
- Current mitigation: Errors are caught and sent to client as JSON
- Recommendations:
  - Log full errors server-side only
  - Send generic error messages to client
  - Never include stack traces in API responses
  - Add PII scrubbing in error messages

**Weak Record Reference Validation:**
- Risk: UUID format validation regex in buildValueRow() could be bypassed with variant UUID formats
- Files: `apps/web/src/services/records.ts` (line 117)
- Current mitigation: Invalid UUIDs are skipped (return null)
- Recommendations:
  - Use `uuid` package for validation instead of regex
  - Log rejected values for auditing
  - Consider database-level constraint checks

**Conversation Ownership Not Verified in Tool Execution:**
- Risk: Tool execution context receives workspaceId/userId but doesn't verify conversation belongs to workspace
- Files: `apps/web/src/app/api/v1/chat/tool-confirm/route.ts` (line 41): only checks conversation exists, not workspace membership
- Current mitigation: Conversation lookup includes userId check
- Recommendations:
  - Add explicit workspace_id check on conversation record
  - Verify user is member of conversation's workspace

## Performance Bottlenecks

**Repeated Attribute Loading in Record Operations:**
- Problem: Each record operation calls `loadAttributes()` which queries all attributes for object; called on every CRUD operation
- Files: `apps/web/src/services/records.ts` (lines 271, 333, 357, 378)
- Cause: No caching of object schema; attributes rarely change
- Improvement path:
  - Cache attributes per object in memory or Redis
  - Invalidate cache on attribute creation/update/delete
  - Consider workspace-scoped cache with TTL

**N+1 Query Pattern in Related Record Resolution:**
- Problem: While display names use batch loading, related records still require 3-4 separate DB queries
- Files: `apps/web/src/services/records.ts` (lines 461-494): getRelatedRecords() needs name attributes + values loaded in separate queries
- Cause: Cascading queries to resolve object slugs and display names
- Improvement path:
  - Pre-load object slugs and name attributes in single query
  - Cache object schema information
  - Consider single denormalized query with proper indexing

**System Prompt Generation on Every Chat Message:**
- Problem: `buildSystemPrompt()` loads all objects and attributes on every API call
- Files: `apps/web/src/app/api/v1/chat/completions/route.ts` (line 52)
- Cause: No caching; AI config has model info only
- Improvement path:
  - Cache system prompt with invalidation on object/attribute schema changes
  - Use Redis with 1-hour TTL
  - Memoize function per workspace

**Hydration Logic Complexity:**
- Problem: `hydrateRecords()` has nested map operations and batch name resolution that scales poorly with multiselect attributes
- Files: `apps/web/src/services/records.ts` (lines 128-267)
- Cause: Manual map construction instead of database-side aggregation
- Improvement path:
  - Consider computed columns or materialized views for common attributes
  - Move record_values grouping to database query using array_agg
  - Profile with large record sets (1000+)

**Large Records Table Scan Without Workspace Filter:**
- Problem: `listRecords()` builds count query without workspace validation; could scan entire table if object belongs to different workspace
- Files: `apps/web/src/services/records.ts` (lines 308-312): no workspace check on count query
- Cause: Assumes object already filtered to workspace
- Improvement path:
  - Add explicit workspace_id to records table
  - Filter records.workspace_id in all queries
  - Add composite index (workspace_id, object_id)

## Fragile Areas

**AI Chat Tool Execution Pipeline:**
- Files: `apps/web/src/app/api/v1/chat/completions/route.ts`, `apps/web/src/services/ai-chat.ts`
- Why fragile:
  - Deeply nested streaming logic with 10-round depth recursion
  - Multiple state machines (pending/approved/executed tool calls)
  - Metadata stored as JSONB with no schema validation
  - Tool arguments are raw strings, not validated against tool definitions
- Safe modification:
  - Add comprehensive logging at each tool execution step
  - Write integration tests for multi-round tool calling
  - Define TypeScript interfaces for message metadata structure
  - Consider extracting streaming logic to separate service
- Test coverage: Only 3 E2E tests, all skipped; no unit tests for tool execution

**Record Value Type System:**
- Files: `apps/web/src/services/records.ts`, `apps/web/src/lib/query-builder.ts`
- Why fragile:
  - Attribute types determine which value column is used via `ATTRIBUTE_TYPE_COLUMN_MAP`
  - No runtime validation that correct column contains data
  - Type narrowing relies on attribute.type enum matching map keys
  - Query builder constructs SQL with raw column names via `sql.raw()`
- Safe modification:
  - Add unit tests for extractValue/buildValueRow with all attribute types
  - Validate attribute type exists in map before use
  - Consider database constraint to prevent wrong-column values
- Test coverage: No unit tests for record value serialization

**Middleware Auth Flow:**
- Files: `apps/web/src/middleware.ts`, `apps/web/src/lib/api-utils.ts`
- Why fragile:
  - Multiple fallback paths: Bearer token → cookie session → first workspace
  - Cookie-based workspace selection is user-controlled, could be stale
  - No validation that workspace cookie is actually user's workspace
- Safe modification:
  - Always verify workspace membership in getAuthContext, not just in fallback
  - Add request logging for auth failures
  - Consider moving to centralized session service
- Test coverage: Auth E2E test exists but workspace switching not tested

## Scaling Limits

**Single Conversation Streaming:**
- Current capacity: 10 tool call rounds per chat message; each round makes OpenRouter API call
- Limit: Recursive depth limit of 10 prevents runaway loops; exceeding requires user interaction
- Scaling path:
  - Implement tool execution queue to limit concurrent API calls
  - Add rate limiting per conversation
  - Consider batch tool execution instead of sequential

**Record Values Table Growth:**
- Current capacity: No limit on record_values.id generation; numeric value stored as text
- Limit: Full table scan on large workspaces (100k+ records) for filtered queries
- Scaling path:
  - Add workspace_id to records and record_values for partition pruning
  - Create composite indexes on (workspace_id, object_id, attribute_id)
  - Implement data archival for deleted records/values
  - Monitor table size; consider sharding by workspace_id

**Attribute Loading Unbounded:**
- Current capacity: `loadAttributes()` loads ALL attributes for object without pagination
- Limit: Objects with 1000+ attributes would cause memory and query issues
- Scaling path:
  - Limit returned attributes to used fields only
  - Cache attribute schema per workspace
  - Add soft limits and warnings for high attribute count

**API Key Hashing on Every Request:**
- Current capacity: One crypto.createHash call per API key auth, no caching
- Limit: High-volume API key usage would add CPU overhead
- Scaling path:
  - Cache API key hash validation with short TTL
  - Pre-hash API keys in database for faster comparison
  - Consider using faster hash algorithm (e.g., blake3)

## Dependencies at Risk

**remark-html with sanitize: false:**
- Risk: Dependency on remark-html without sanitization; if markdown library has XSS, it propagates
- Impact: Blog/comparison pages vulnerable to XSS
- Migration plan: Switch to rehype-sanitize or use sanitize-html package; audit markdown processing pipeline

**Next.js 15.1.0 - Turbopack stability:**
- Risk: Using experimental Turbopack in dev (`--turbopack` flag); could have bugs or instability
- Impact: Development builds could fail or produce incorrect bundles; harder to debug
- Migration plan: Option to disable Turbopack; use SWC as fallback; monitor Next.js releases for stable Turbopack

**Better Auth 1.2.0 - Session management:**
- Risk: Single-version pinned; any security fixes require manual upgrade
- Impact: If session handling has exploits, they're not auto-patched
- Migration plan: Use caret range `^1.2.0` to accept patch/minor updates; review releases monthly

**OpenRouter API Dependency:**
- Risk: External API dependency with no failover; model deprecation breaks application
- Impact: If OpenRouter goes down or changes API, chat feature stops working
- Migration plan:
  - Add fallback to Claude API directly
  - Implement model availability check with graceful error messages
  - Add timeout/retry logic with exponential backoff

## Missing Critical Features

**Audit Logging:**
- Problem: No audit trail for record modifications, deletions, or API access
- Blocks: Compliance requirements, forensic investigation of data changes
- Priority: High - needed for any regulated use case

**Backup/Export Functionality:**
- Problem: No bulk data export beyond CSV import; no disaster recovery mechanism
- Blocks: Data portability, compliance with right-to-data requirements
- Priority: High - critical for user data safety

**Rate Limiting:**
- Problem: No rate limiting on API endpoints or chat completions
- Blocks: Protection against DoS attacks, cost control for OpenRouter usage
- Priority: Medium - important for production stability

**Search Result Pagination:**
- Problem: `globalSearch()` returns all results up to limit; no offset/pagination
- Blocks: Efficient browsing of large result sets
- Priority: Medium - impacts UX for large workspaces

**Soft Delete for Records:**
- Problem: Records are hard-deleted; no way to restore deleted data
- Blocks: Accidental deletion recovery, audit trails
- Priority: Medium - data safety improvement

## Test Coverage Gaps

**API Error Scenarios:**
- What's not tested: Invalid filter syntax, missing required fields, expired API keys, workspace mismatch
- Files: `apps/web/src/app/api/v1/` (all route handlers)
- Risk: Error handling bugs discovered in production
- Priority: High

**Multi-Tool Conversation Flows:**
- What's not tested: Sequential tool calls, tool failures mid-stream, user rejecting tool execution
- Files: `apps/web/src/services/ai-chat.ts`, chat routes
- Risk: AI assistant becomes unreliable with complex workflows
- Priority: High

**Concurrent Record Updates:**
- What's not tested: Two simultaneous updates to same record, race condition behavior
- Files: `apps/web/src/services/records.ts`
- Risk: Data corruption or lost updates in high-concurrency scenarios
- Priority: Medium

**Complex Filters and Sorts:**
- What's not tested: Deeply nested AND/OR filters, multiple sort columns, edge cases (empty values, nulls)
- Files: `apps/web/src/lib/query-builder.ts`, `apps/web/src/app/api/v1/lists/[listId]/entries/route.ts`
- Risk: Filter logic bugs produce incorrect results silently
- Priority: Medium

**CSV Import Edge Cases:**
- What's not tested: Very large files, special characters, duplicate detection, circular references
- Files: `apps/web/src/components/records/csv-import-modal.tsx`
- Risk: Data corruption on problematic imports
- Priority: Medium

**Authentication State Transitions:**
- What's not tested: Workspace switching, session expiration, API key rotation, multi-workspace users
- Files: `apps/web/src/lib/api-utils.ts`, auth routes
- Risk: Auth bypass or privilege escalation bugs
- Priority: High

---

*Concerns audit: 2026-03-10*
