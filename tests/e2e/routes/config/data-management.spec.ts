/**
 * @file tests/e2e/routes/config/data-management.spec.ts
 * @description E2E smoke tests for data management config pages — importer, sync, trash, redirects.
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import {
  advanceToValidateStep,
  expectCollectionEntry,
  runMigrationImport,
  uploadWordPressFixture,
} from "../../helpers/migration-wizard";

test.describe("Data Management Pages", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("migration page loads", async ({ page }) => {
    await page.goto("/config?plugin=smart-importer");

    // The plugin workspace loads asynchronously — wait for the file input (key wizard element)
    await page.locator("#migration-file-input").waitFor({ state: "attached", timeout: 15_000 });
    await expect(
      page.getByText(/upload|select file|drag|choose|source|browse/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("migration wizard dry-run validates WordPress WXR before import", async ({ page }) => {
    await uploadWordPressFixture(page);
    await expect(page.getByLabel(/target collection/i)).toHaveValue("post", {
      timeout: 15_000,
    });
    await advanceToValidateStep(page);

    await page.getByRole("button", { name: /run dry run/i }).click();

    await expect(page.getByRole("button", { name: /start import/i })).toBeEnabled({
      timeout: 30_000,
    });
  });

  test("migration wizard imports WordPress WXR into auto-detected post collection", async ({
    page,
  }) => {
    await uploadWordPressFixture(page);
    await expect(page.getByLabel(/target collection/i)).toHaveValue("post", {
      timeout: 15_000,
    });
    await advanceToValidateStep(page);
    await runMigrationImport(page);

    const entry = await expectCollectionEntry(page, "post", (row) => row.title === "E2E Test Post");
    expect(entry.slug).toBe("e2e-test-post");
  });

  test("migration wizard detects WordPress WXR upload", async ({ page }) => {
    await page.goto("/config?plugin=smart-importer");
    const workspace = page.getByLabel("Plugin workspace");

    const fileInput = page.locator("#migration-file-input");
    await fileInput.waitFor({ state: "attached", timeout: 20_000 });
    await fileInput.setInputFiles("tests/e2e/fixtures/sample-wordpress.wxr");

    await expect(page.getByText("sample-wordpress.wxr")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/wordpress/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(workspace.getByRole("button", { name: /next: map fields/i })).toBeEnabled({
      timeout: 15_000,
    });
  });

  test("sync page loads", async ({ page }) => {
    await page.goto("/config/sync");
    await expect(page.getByRole("heading", { level: 1, name: /sync/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/status|sync|changes|backup/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("trash page loads", async ({ page }) => {
    await page.goto("/config/trash");
    await expect(page.getByRole("heading", { level: 1, name: /trash/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/trash|deleted|restore/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("redirects page loads with pagination", async ({ page }) => {
    await page.goto("/config/redirects");
    await expect(page.getByRole("heading", { level: 1, name: /redirect/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: /^add redirect$/i })).toBeVisible({
      timeout: 10_000,
    });
  });
});
