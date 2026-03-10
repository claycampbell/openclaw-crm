# Testing Patterns

**Analysis Date:** 2026-03-10

## Test Framework

**Runner:**
- Playwright v1.58.2
- Config: `apps/web/playwright.config.ts`

**Run Commands:**
```bash
cd apps/web && pnpm test:e2e              # Run all E2E tests
cd apps/web && pnpm test:e2e:ui           # Run in UI mode (interactive)
```

**Test Infrastructure:**
- Only Playwright E2E tests — no unit tests or integration tests
- Tests run in Chromium browser
- Parallel execution enabled (`fullyParallel: true`)
- Retries: 0 in dev, 2 in CI
- Screenshots on failure only
- HTML report generation

## Test File Organization

**Location:**
- All tests in `apps/web/e2e/` directory
- Currently 3 test files: `auth.spec.ts`, `dashboard.spec.ts`, `navigation.spec.ts`

**Naming:**
- Pattern: `[feature].spec.ts`
- Example: `auth.spec.ts`, `dashboard.spec.ts`

**File Structure:**
```
apps/web/e2e/
├── auth.spec.ts
├── dashboard.spec.ts
└── navigation.spec.ts
```

## Test Structure

**Suite Organization:**

```typescript
import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("should show login page", async ({ page }) => {
    // Test code
  });

  test("should navigate from login to register", async ({ page }) => {
    // Test code
  });
});
```

**Patterns:**
- `test.describe()` groups related tests by feature/area
- Each test is a single async function with `page` fixture
- Test names are descriptive, starting with "should" (behavioral description)
- No setup/teardown hooks observed (tests are isolated)
- Tests are stateless — each navigates to URL explicitly

## Playwright Configuration

**Key Settings** (`apps/web/playwright.config.ts`):

```typescript
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: "pnpm dev",
        port: 3000,
        reuseExistingServer: true,
      },
});
```

**Browser:** Chromium only (no Safari, Firefox)

**Base URL:** `http://localhost:3000` (or `http://localhost:3001` in local dev via `pnpm dev`)

**Tracing:** Captured on first retry only

**Screenshots:** Only on test failure

**Web Server:** Auto-starts `pnpm dev` in dev mode, reuses if already running

## Test Examples

### Authentication Tests

**File:** `apps/web/e2e/auth.spec.ts`

```typescript
test.describe("Authentication", () => {
  test("should show login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("text=Sign in")).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("should show register page", async ({ page }) => {
    await page.goto("/register");
    await expect(page.locator("text=Create account")).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[name="name"]')).toBeVisible();
  });

  test("should navigate from login to register", async ({ page }) => {
    await page.goto("/login");
    await page.click("text=Create account");
    await expect(page).toHaveURL(/register/);
  });

  test("should show validation on empty submit", async ({ page }) => {
    await page.goto("/login");
    await page.click('button[type="submit"]');
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();
  });
});
```

**Patterns:**
- Page navigation with `page.goto()`
- Element selection via text, input types, or attributes
- `expect()` assertions for visibility and URL matching
- No user authentication setup (public routes)

### Dashboard Tests

**File:** `apps/web/e2e/dashboard.spec.ts`

Tests verify dashboard structure and navigation. Most are skipped with note:

```typescript
test.skip(true, "Requires authenticated session - run with seeded test user");

test("home page shows tasks and notes widgets", async ({ page }) => {
  await page.goto("/home");
  await expect(page.locator("text=My Tasks")).toBeVisible();
  await expect(page.locator("text=Recent Notes")).toBeVisible();
});

test("deals page shows table and board toggle", async ({ page }) => {
  await page.goto("/objects/deals");
  await expect(page.locator("text=Deals")).toBeVisible();
  await expect(page.locator("text=Table")).toBeVisible();
  await expect(page.locator("text=Board")).toBeVisible();
});

test("command palette opens with Ctrl+K", async ({ page }) => {
  await page.goto("/home");
  await page.keyboard.press("Control+k");
  await expect(page.locator('[cmdk-input]')).toBeVisible();
});
```

**Status:** Skipped because they require authenticated session (user login)

**Approach:** Structure verification only — checks for page load and presence of expected UI elements

## What's Tested

**Currently Passing:**
- Login page renders
- Register page renders
- Navigation between auth pages
- HTML5 validation on forms
- Public routes accessibility

**Currently Skipped:**
- Dashboard pages (require auth + seeded test user)
- Table views (require data)
- Filters and sorting (require authentication)
- Settings pages (require authentication)

## Testing Gaps

**No Unit Tests:**
- No tests for services (`ai-chat.ts`, `records.ts`, `objects.ts`, etc.)
- No tests for utilities and helpers
- No component unit tests

**Limited E2E Coverage:**
- Only public/auth routes tested
- No authenticated user flows
- No data mutation testing (create, update, delete)
- No API integration testing
- No error state testing

**Missing Test Infrastructure:**
- No test database seeding (CLAUDE.md mentions `pnpm db:seed` but tests don't use it)
- No test user fixtures or factories
- No authentication state persistence for E2E tests
- No test data cleanup/isolation strategy

## Recommendations for Testing

**To Run Dashboard Tests:**
1. Seed test database: `pnpm db:seed`
2. Set `BASE_URL=http://localhost:3001` if dev server uses port 3001
3. Create test user credentials in test or use fixed credentials
4. Store auth state to reuse across tests (avoid login in every test)

**For Service Testing:**
- Create Jest or Vitest unit test suite for services
- Mock database with test fixtures
- Test business logic in isolation

**For API Testing:**
- Add Playwright API tests alongside page tests
- Test error responses and edge cases
- Verify API contract before UI testing

---

*Testing analysis: 2026-03-10*
