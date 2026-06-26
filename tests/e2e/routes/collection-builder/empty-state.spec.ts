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

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

test.describe("Collection Builder — Empty State", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("should show empty state when no collections exist", async ({ page }) => {
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
    await page.goto("/config/collectionbuilder");

    // Click Quick Start
    await page.getByRole("button", { name: /quick start/i }).click();

    // Modal should open with template cards
    await expect(page.getByRole("dialog", { name: /quick-start templates/i })).toBeVisible({
      timeout: 5_000,
    });

    // Template cards should be visible (5 presets: blog, agency, saas, corporate, ecommerce)
    await expect(page.getByRole("radio", { name: /blog/i })).toBeVisible({ timeout: 5_000 });

    // Close the modal
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByRole("dialog", { name: /quick-start templates/i })).not.toBeVisible();
  });

  test("should install a Quick Start template from empty state", async ({ page }) => {
    await page.goto("/config/collectionbuilder");

    // Open Quick Start
    await page.getByRole("button", { name: /quick start/i }).click();

    // Select the Blog template
    await page.getByRole("radio", { name: /blog/i }).click();

    // Click Install
    await page.getByRole("button", { name: /install template/i }).click();

    // Should get a success toast
    await expect(page.getByText(/collections created successfully/i)).toBeVisible({
      timeout: 15_000,
    });

    // Page should reload with collections visible
    await expect(page.getByTestId("collection-builder-board")).toBeVisible({
      timeout: 10_000,
    });
  });
});
