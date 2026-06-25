/**
 * @file tests/e2e/routes/mediagallery/mediagallery.spec.ts
 * @description E2E smoke tests for /mediagallery — toolbar, views, upload.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_IMAGE = path.join(__dirname, "..", "..", "testthumb.png");

test.describe("Media Gallery", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("page loads with toolbar and grid", async ({ page }) => {
    await page.goto("/mediagallery");
    await expect(page.getByRole("heading", { level: 1, name: /media gallery/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("media-gallery-toolbar")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("media-gallery-content")).toBeVisible();
    await expect(page.getByTestId("media-grid").or(page.getByRole("table"))).toBeVisible({
      timeout: 10_000,
    });
  });

  test("search and filter controls are interactive", async ({ page }) => {
    await page.goto("/mediagallery");
    const search = page.getByRole("searchbox", {
      name: /search media assets/i,
    });
    await expect(search).toBeVisible({ timeout: 10_000 });
    await search.fill("e2e-no-match-xyz");
    await expect(page.getByTestId("media-grid-empty")).toBeVisible({
      timeout: 10_000,
    });

    await page.getByLabel(/filter by type/i).selectOption("IMAGE");
    await page.getByRole("button", { name: /table view/i }).click();
    await expect(page.getByRole("table")).toBeVisible({ timeout: 10_000 });
  });

  test("can upload a test image", async ({ page }) => {
    await page.goto("/mediagallery");
    const uploadInput = page.getByTestId("media-upload-input");
    await expect(uploadInput).toBeAttached({ timeout: 10_000 });

    await uploadInput.setInputFiles(TEST_IMAGE);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("media-grid-empty")).toHaveCount(0, {
      timeout: 20_000,
    });
    await expect(page.getByRole("gridcell").first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
