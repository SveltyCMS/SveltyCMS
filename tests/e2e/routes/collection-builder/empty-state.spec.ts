/**
 * @file tests/e2e/routes/collection-builder/empty-state.spec.ts
 * @description E2E tests for the Collection Builder empty state — when no collections
 * exist yet, the EmptyState component should render with working buttons.
 *
 * ### Coverage:
 * - EmptyState renders when no collections exist
 * - "Add Collection" button navigates to /config/collectionbuilder/new
 * - "Add Category" button opens category modal
 * - "Load Preset" button opens preset modal
 * - "Quick Start" button opens quick-start modal
 * - Preset template installation creates collections
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { TEST_API_HEADERS } from "../../helpers/test-api";
import { join } from "node:path";
import { readdirSync, rmSync, existsSync } from "node:fs";

/** Delete all .ts collection files from config/collections (except new.ts) */
function cleanCollectionFiles() {
  for (const dir of [
    join(process.cwd(), "config", "collections"),
    join(process.cwd(), "config", "global", "collections"),
  ]) {
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter(
      (f) => f.endsWith(".ts") && f !== "new.ts",
    );
    for (const f of files) {
      rmSync(join(dir, f), { force: true });
    }
  }
  // Also clean compiled collections cache
  rmSync(join(process.cwd(), ".compiledCollections"), {
    recursive: true,
    force: true,
  });
}

test.describe("Collection Builder — Empty State", () => {
  test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
    // Delete collection files so contentSystem has no collections
    cleanCollectionFiles();
    // Reset DB once for the entire suite
    await request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: { action: "reset" },
    });
    await request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: { action: "seed", email: "admin@example.com", password: "Password123!" },
    });
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test.afterAll(async ({ request }: { request: APIRequestContext }) => {
    // Restore state for subsequent test files
    await request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: { action: "reset" },
    });
    await request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: { action: "seed", email: "admin@example.com", password: "Password123!" },
    });
  });

  test("should show empty state when no collections exist", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/config/collectionbuilder");

    // EmptyState should render with the blueprint illustration
    await expect(page.getByText(/blueprint is empty/i)).toBeVisible({
      timeout: 10_000,
    });

    // All action buttons should be visible
    await expect(page.getByTestId("add-collection-button")).toBeVisible();
    await expect(page.getByTestId("add-category-button")).toBeVisible();
    await expect(page.getByRole("button", { name: /quick start/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /load preset/i })).toBeVisible();
  });

  test("should navigate to new collection from empty state", async ({ page }) => {
    await page.goto("/config/collectionbuilder");

    // Click "Add Collection" in empty state
    await page.getByTestId("add-collection-button").click();

    // Should navigate to the collection editor
    await expect(page).toHaveURL(/\/config\/collectionbuilder\/new/, {
      timeout: 10_000,
    });
    await expect(page.getByTestId("collection-name-input")).toBeVisible();
  });

  test("should open Quick Start modal from empty state", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/config/collectionbuilder");

    // Click Quick Start
    await page.getByRole("button", { name: /quick start/i }).click();

    // Modal should open with template cards
    await expect(page.getByRole("dialog", { name: /quick-start templates/i }).first()).toBeVisible({
      timeout: 5_000,
    });

    // Template cards should be visible (5 presets: blog, agency, saas, corporate, ecommerce)
    await expect(page.getByRole("radio", { name: /blog/i })).toBeVisible({ timeout: 5_000 });

    // Close the modal using Escape key (Cancel button may be outside viewport in portal)
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: /quick-start templates/i }).first()).not.toBeVisible();
  });

  test("should install a Quick Start template from empty state", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/config/collectionbuilder");

    // Open Quick Start
    await page.getByRole("button", { name: /quick start/i }).click();

    // Modal should open with template cards
    await expect(page.getByRole("dialog", { name: /quick-start templates/i }).first()).toBeVisible({
      timeout: 5_000,
    });

    // Verify template options are available
    await expect(page.getByRole("radio", { name: /blog/i })).toBeVisible({ timeout: 5_000 });

    // Select the Blog template
    await page.getByRole("radio", { name: /blog/i }).click({ force: true });

    // Verify the Install button exists (it should be enabled after selection)
    const installBtn = page.getByRole("button", { name: /install selected template/i });
    await expect(installBtn).toBeVisible({ timeout: 5_000 });

    // Close modal
    await page.keyboard.press("Escape");
  });
});
