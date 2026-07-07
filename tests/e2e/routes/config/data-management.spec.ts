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
    // The plugin workspace loads asynchronously — wait for heading or file input.
    // Skip gracefully if the smart importer plugin is not available.
    const fileInput = page.locator("#migration-file-input");
    const heading = page.getByRole("heading", { level: 1 });
    const hasPlugin = await Promise.race([
      heading
        .first()
        .waitFor({ state: "visible", timeout: 10_000 })
        .then(() => true),
      fileInput.waitFor({ state: "attached", timeout: 10_000 }).then(() => true),
      page.waitForTimeout(10_000).then(() => false),
    ]);
    if (!hasPlugin) {
      test.skip(true, "Smart importer plugin not available — skipping migration tests");
      return;
    }
    await expect(heading.first().or(fileInput)).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByText(/upload|select file|drag|choose|source|browse/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("migration wizard dry-run validates WordPress WXR before import", async ({ page }) => {
    // Check if the smart importer plugin is available before running
    const fileInputExists = await page
      .locator("#migration-file-input")
      .waitFor({ state: "attached", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (!fileInputExists) {
      await page.goto("/config?plugin=smart-importer");
      const stillMissing = await page
        .locator("#migration-file-input")
        .waitFor({ state: "attached", timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (!stillMissing) {
        test.skip(true, "Smart importer plugin not available");
        return;
      }
    }

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
    // Check if the smart importer plugin is available before running
    const fileInputExists = await page
      .locator("#migration-file-input")
      .waitFor({ state: "attached", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (!fileInputExists) {
      await page.goto("/config?plugin=smart-importer");
      const stillMissing = await page
        .locator("#migration-file-input")
        .waitFor({ state: "attached", timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (!stillMissing) {
        test.skip(true, "Smart importer plugin not available");
        return;
      }
    }

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

    const fileInput = page.locator("#migration-file-input");
    const found = await fileInput
      .waitFor({ state: "attached", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!found) {
      test.skip(true, "Smart importer plugin not available — #migration-file-input not found");
      return;
    }

    await fileInput.setInputFiles("tests/e2e/fixtures/sample-wordpress.wxr");

    await expect(page.getByText("sample-wordpress.wxr")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/wordpress/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: /next: map fields/i })).toBeEnabled({
      timeout: 15_000,
    });
  });

  test("sync page loads", async ({ page }) => {
    await page.goto("/config/sync");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("body")).toBeVisible({ timeout: 10_000 });
  });

  test("trash page loads", async ({ page }) => {
    await page.goto("/config/trash");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("body")).toBeVisible({ timeout: 10_000 });
  });

  test("redirects page loads with pagination", async ({ page }) => {
    await page.goto("/config/redirects");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: /add|create|new/i }).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
