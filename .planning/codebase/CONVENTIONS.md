# Coding Conventions

**Analysis Date:** 2026-03-10

## Naming Patterns

**Files:**
- **Components:** kebab-case (e.g., `chat-input.tsx`, `filter-bar.tsx`, `topbar.tsx`)
- **Services:** camelCase (e.g., `records.ts`, `ai-chat.ts`, `objects.ts`)
- **Pages/Routes:** kebab-case matching URL slugs (e.g., `page.tsx` in route directories)
- **Database/Schema:** camelCase (e.g., `query-builder.ts`, `display-names.ts`)
- **Utilities/Helpers:** camelCase with `lib/` prefix (e.g., `lib/api-utils.ts`, `lib/auth-client.ts`)

**Functions:**
- **Exported functions:** camelCase (e.g., `getAuthContext`, `buildFilterSQL`, `createRecord`)
- **Private/Helper functions:** camelCase with leading function prefix or underscore for pseudo-private (e.g., `extractValue`, `buildValueRow`)
- **React components:** PascalCase exported as named exports (e.g., `export function ChatInput(...)`)
- **Event handlers:** `handle` prefix in camelCase (e.g., `handleKeyDown`, `handleSignOut`, `handleNavigation`)
- **Async operations:** names reflect what they do, often including "fetch" or "get" (e.g., `fetchCount`)

**Variables:**
- **Constants:** UPPER_SNAKE_CASE for global constants (not extensively used, preference for typed exports)
- **Regular variables:** camelCase (e.g., `activeWorkspaceId`, `conversationId`, `userRole`)
- **Booleans:** typically prefixed with `is`, `has`, `should`, `can` (e.g., `isMultiselect`, `disabled`)
- **References to DB rows:** singular names match table names (e.g., `conversation`, `record`, `attribute`)

**Types/Interfaces:**
- **Exported interfaces:** PascalCase (e.g., `AuthContext`, `FlatRecord`, `SearchResult`, `ToolHandler`)
- **Type aliases:** PascalCase (e.g., `AttributeType`, `FilterGroup`)
- **Props interfaces:** `[ComponentName]Props` pattern (e.g., `ChatInputProps`, `TopbarProps`)

## Code Style

**Formatting:**
- **No explicit linter config** — next lint runs but no .eslintrc file checked into repo
- **No Prettier config** — rely on Next.js defaults
- **Indentation:** 2 spaces (inferred from all source files)
- **Line length:** no strict limit enforced, practical max ~120 chars observed
- **Semicolons:** always present (TypeScript style)

**Import Organization:**
1. **External packages** (e.g., `import { NextRequest } from "next/server"`)
2. **Internal modules** with `@/` alias (e.g., `import { db } from "@/db"`)
3. **Specific imports from shared packages** (e.g., `import { ATTRIBUTE_TYPE_COLUMN_MAP } from "@openclaw-crm/shared"`)
4. **Type imports:** `import type { ... }` for TypeScript types

**Order within groups:**
- React/Next.js first
- Then database/ORM
- Then schema imports
- Then utilities and helpers
- Then types last

**Path Aliases:**
- `@/*` maps to `src/` in `apps/web/tsconfig.json`
- Used throughout: `@/lib`, `@/services`, `@/components`, `@/db`, etc.

**No barrel files:** Direct imports from specific modules preferred (e.g., `import { ChatInput } from "@/components/chat/chat-input"` not from index files)

## Error Handling

**Pattern:** Explicit null/undefined checks and early returns

**API Layer (route handlers):**
- Call `getAuthContext()` first, return `unauthorized()` if null
- Parse request body with try/catch, return `badRequest()` on parse error
- Return typed responses: `success(data)`, `notFound()`, `badRequest(msg)`, `forbidden(msg)` from `@/lib/api-utils.ts`
- Unhandled errors: log with `console.error()` with context prefix, return generic 500 error
  ```typescript
  try {
    const result = await createApiKey(...);
    return success(result, 201);
  } catch (err) {
    console.error("Failed to create API key:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create API key" } },
      { status: 500 }
    );
  }
  ```

**Service Layer (business logic):**
- Return objects with `{ error: "message" }` structure for tool handlers
  ```typescript
  if (!objectId) return { error: `Object "${args.object_slug}" not found` };
  ```
- Functions throw errors or return null on not found (varies by service)
- Database queries use Drizzle's `.limit(1)` and check array length > 0

**Silent Failures:** Fire-and-forget operations use `.catch(() => {})` pattern:
  ```typescript
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, key.id))
    .execute()
    .catch(() => {});
  ```

**Server/Client Components:**
- Client-side: use try/catch in async functions, fallback with generic error states
  ```typescript
  try {
    const res = await fetch("/api/v1/...");
    if (res.ok) {
      // process
    }
  } catch {
    // ignore or set error state
  }
  ```

## Logging

**Framework:** Native `console` methods (no logging library)

**Patterns:**
- **Errors:** `console.error("[context] message", err)` with bracket-prefixed context
  - Example: `console.error("[getAuthContext] auth.api.getSession threw:", err)`
- **Informational:** minimal — only used for debugging specific flows
- **No debug logs:** debug/verbose logging not present in codebase

**When to log:**
- Exceptions in error handlers
- Auth/security-related issues
- Failed external API calls
- Not used for normal flow tracing (no verbose logging culture)

## Comments

**When to Comment:**
- **JSDoc/TSDoc** used for exported functions and complex signatures:
  ```typescript
  /**
   * Get authenticated user and their workspace context.
   * Checks Bearer token first, then falls back to cookie auth.
   * Active workspace is determined by the `active-workspace-id` cookie.
   */
  export async function getAuthContext(req: NextRequest): Promise<AuthContext | null> { ... }
  ```

- **Inline comments** used for non-obvious logic:
  ```typescript
  // For is_empty / is_not_empty, check existence
  if (cond.operator === "is_empty") { ... }
  ```

- **Section dividers** using Unicode line comments (observed in services):
  ```typescript
  // ─── Types ───────────────────────────────────────────────────────────
  // ─── Helpers ──────────────────────────────────────────────────────────
  // ─── Config ───────────────────────────────────────────────────────────
  ```

**JSDoc conventions:**
- Parameter descriptions included
- Return type descriptions included
- Used on exported interfaces and functions
- Not used on internal/private functions

## Function Design

**Size:**
- Typical: 20-100 lines
- Longer functions split into helper functions with clear responsibility
- Helper functions often prefixed with underscore or placed below main function

**Parameters:**
- **Positional:** 1-3 parameters typical
- **Options objects:** Used for functions with many optional parameters
  ```typescript
  export async function globalSearch(
    workspaceId: string,
    query: string,
    options: { limit?: number } = {}
  ): Promise<SearchResult[]>
  ```

**Return Values:**
- **Typed returns:** Always include explicit return type in function signature
- **Nullable returns:** Use `Promise<Type | null>` pattern extensively
- **Multiple values:** Return objects with named fields, not tuples
  ```typescript
  return { bySlug, byId }; // not [bySlug, byId]
  ```

**Async/Await:**
- Preferred over `.then()` chains
- Try/catch for error handling
- Fire-and-forget patterns with `.catch(() => {})` for non-critical operations

## Module Design

**Exports:**
- Named exports preferred (not default exports)
- Each service file exports multiple related functions
- Interfaces exported from same module as using functions

**Service Structure (`apps/web/src/services/`):**
- One service per domain (records.ts, objects.ts, ai-chat.ts, etc.)
- All database queries encapsulated in services
- Services call each other for cross-domain operations
- Example: `ai-chat.ts` imports and calls functions from `records.ts`, `objects.ts`, `search.ts`

**Barrel Files:**
- Not used in this codebase
- Direct imports from specific files preferred for clarity

**Type Organization:**
- Interfaces defined at top of file, often in section marked by divider
- Local types not exported (kept in file scope)
- Shared types in `@openclaw-crm/shared` package

## Frontend Conventions

**Component Structure:**
- **Use client:** Declared when component uses hooks or browser APIs
- **Props interface:** Always defined, even if empty
  ```typescript
  interface ChatInputProps {
    value: string;
    onChange: (value: string) => void;
    onSend: () => void;
    disabled?: boolean;
  }
  ```
- **Ref forwarding:** Used with `useRef()` for textarea/input references
- **Responsive design:** Tailwind utility classes, `md:` breakpoint prefix common

**State Management:**
- `useState` for local component state
- `useEffect` for side effects with proper cleanup
- No Redux or complex state library
- Cookie-based workspace selection (`active-workspace-id`)

**Styling:**
- **Tailwind CSS v4** with Tailwind Merge for conditional classes
- **shadcn/ui** components for common UI elements (Button, Dialog, etc.)
- **Lucide icons** for iconography
- Class composition example:
  ```typescript
  className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ${
    sidebarOpen ? "translate-x-0" : "-translate-x-full"
  }`}
  ```

---

*Convention analysis: 2026-03-10*
