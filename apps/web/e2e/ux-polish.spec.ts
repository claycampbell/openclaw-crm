import { test, expect } from "@playwright/test";

test.describe("UX Polish — Form Validation", () => {
  test("validation errors shown when submitting empty required fields", async ({ page }) => {
    await page.goto("/objects/people");
    await page.waitForLoadState("networkidle");

    // Open create dialog
    await page.click('button:has-text("New Person")');
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Submit empty
    await dialog.locator('button[type="submit"]').click();

    // Should see destructive error text (Zod validation)
    const errors = dialog.locator(".text-destructive");
    await expect(errors.first()).toBeVisible({ timeout: 5000 });

    // Dialog should still be open
    await expect(dialog).toBeVisible();

    // Toast should appear
    const toast = page.locator("[data-sonner-toast]");
    await expect(toast.first()).toBeVisible({ timeout: 5000 });
  });

  test("email validation shows error for invalid email", async ({ page }) => {
    await page.goto("/objects/people");
    await page.waitForLoadState("networkidle");

    await page.click('button:has-text("New Person")');
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Fill name to pass required validation
    await dialog.locator('input[placeholder="First name"]').fill("Test");

    // Enter invalid email
    await dialog.locator('input[type="email"]').fill("not-an-email");

    // Submit
    await dialog.locator('button[type="submit"]').click();

    // Should show "Invalid email address" error
    await expect(dialog.locator('text="Invalid email address"')).toBeVisible({ timeout: 3000 });
  });

  test("valid record creation closes dialog", async ({ page }) => {
    await page.goto("/objects/people");
    await page.waitForLoadState("networkidle");

    await page.click('button:has-text("New Person")');
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Fill required name
    await dialog.locator('input[placeholder="First name"]').fill("E2E Person");

    // Submit
    await dialog.locator('button[type="submit"]').click();

    // Dialog should close on success
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    // Record should appear in table
    await expect(page.locator('text="E2E Person"')).toBeVisible({ timeout: 5000 });
  });
});

test.describe("UX Polish — Cursor Pagination", () => {
  test("table loads with record count header", async ({ page }) => {
    await page.goto("/objects/people");
    await page.waitForLoadState("networkidle");

    // Table should be visible
    await expect(page.locator("table")).toBeVisible();

    // Header should show record count
    await expect(page.locator("h1")).toContainText("People");
  });
});

test.describe("UX Polish — Skeleton Loading", () => {
  test("dashboard renders content", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Should eventually show dashboard content
    const heading = page.locator("h1, h2");
    await expect(heading.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe("UX Polish — Empty States", () => {
  test("empty object page shows EmptyState or records", async ({ page }) => {
    await page.goto("/objects/companies");
    await page.waitForLoadState("networkidle");

    // Should show either empty state or table rows
    const emptyState = page.locator('text="No records yet"');
    const tableRows = page.locator("table tbody tr");

    const hasEmpty = await emptyState.isVisible().catch(() => false);
    const rowCount = await tableRows.count();

    expect(hasEmpty || rowCount > 0).toBe(true);
  });
});

test.describe("UX Polish — Automations Page", () => {
  test("automations page loads", async ({ page }) => {
    await page.goto("/automations");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toContainText("Automations");
  });

  test("can open create automation dialog", async ({ page }) => {
    await page.goto("/automations");
    await page.waitForLoadState("networkidle");

    await page.click('button:has-text("New automation")');
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Dialog should have name input and trigger/action selectors
    await expect(dialog.locator("input#rule-name")).toBeVisible();
    await expect(dialog.locator('text="When this happens"')).toBeVisible();
    await expect(dialog.locator('text="Do this"')).toBeVisible();
  });
});

test.describe("UX Polish — Settings Pages", () => {
  test("webhooks settings page loads", async ({ page }) => {
    await page.goto("/settings/webhooks");
    await page.waitForLoadState("networkidle");

    await expect(page.locator('text="Outbound webhooks"')).toBeVisible();
  });

  test("settings navigation shows all sections", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Check settings sidebar nav items
    const nav = page.locator("nav");
    await expect(nav.locator('text="General"')).toBeVisible();
    await expect(nav.locator('text="Members"')).toBeVisible();
    await expect(nav.locator('text="Objects"')).toBeVisible();
    await expect(nav.locator('text="API Keys"')).toBeVisible();
    await expect(nav.locator('text="Webhooks"')).toBeVisible();
  });
});

test.describe("UX Polish — Hot Leads", () => {
  test("hot leads page loads with title", async ({ page }) => {
    await page.goto("/hot-leads");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toContainText("Hot leads");
  });
});

test.describe("UX Polish — Error Boundaries", () => {
  test("main pages load without 500 errors", async ({ page }) => {
    const pages = ["/home", "/dashboard", "/tasks", "/notes", "/automations", "/hot-leads"];

    for (const path of pages) {
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(500);
      await page.waitForLoadState("networkidle");
    }
  });
});

test.describe("UX Polish — Keyboard Shortcuts", () => {
  test("? key opens shortcuts modal", async ({ page }) => {
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    // Press ? to open keyboard shortcuts
    await page.keyboard.press("?");

    // Modal should appear with shortcut categories
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text="Keyboard shortcuts"')).toBeVisible();
  });
});

test.describe("UX Polish — Sidebar Navigation", () => {
  test("sidebar has expected nav items", async ({ page }) => {
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    // Check key sidebar items exist
    await expect(page.locator('a[href="/home"]')).toBeVisible();
    await expect(page.locator('a[href="/dashboard"]')).toBeVisible();
    await expect(page.locator('a[href="/automations"]')).toBeVisible();
    await expect(page.locator('a[href="/hot-leads"]')).toBeVisible();
    await expect(page.locator('a[href="/settings"]')).toBeVisible();
  });
});
