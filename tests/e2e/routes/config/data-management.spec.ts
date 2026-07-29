/**
 * @file tests/e2e/routes/config/data-management.spec.ts
 * @description E2E for data management — Smart Importer wizard, sync/trash/redirects smoke.
 * Migration tests use enable-plugin + hard fail (no soft-skip) when wizard is control-mapped.
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import {
  advanceToValidateStep,
  ensureSmartImporterReady,
  expectCollectionEntry,
  runMigrationImport,
  uploadWordPressFixture,
  workspace,
} from "../../helpers/migration-wizard";

test.describe("Data Management Pages", () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("migration page loads with wizard file input", async ({ page }) => {
    await ensureSmartImporterReady(page);
    await expect(workspace(page).locator("#migration-file-input")).toBeAttached();
    await expect(
      workspace(page)
        .getByText(/upload|select file|drag|choose|source|browse|wordpress/i)
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("migration wizard detects WordPress WXR upload", async ({ page }) => {
    await uploadWordPressFixture(page);
    await expect(workspace(page).getByText("sample-wordpress.wxr")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      workspace(page)
        .getByText(/wordpress/i)
        .first(),
    ).toBeVisible({
      timeout: 15_000,
    });
    await expect(workspace(page).getByRole("button", { name: /next: map fields/i })).toBeEnabled({
      timeout: 15_000,
    });
  });

  test("migration wizard dry-run validates WordPress WXR before import", async ({ page }) => {
    await uploadWordPressFixture(page);
    await expect(workspace(page).getByLabel(/target collection/i)).toHaveValue("post", {
      timeout: 15_000,
    });
    await advanceToValidateStep(page);

    await workspace(page)
      .getByRole("button", { name: /run dry run/i })
      .click();

    await expect(workspace(page).getByRole("button", { name: /start import/i })).toBeEnabled({
      timeout: 30_000,
    });
  });

  test("migration wizard imports WordPress WXR into auto-detected post collection", async ({
    page,
  }) => {
    await uploadWordPressFixture(page);
    await expect(workspace(page).getByLabel(/target collection/i)).toHaveValue("post", {
      timeout: 15_000,
    });
    await advanceToValidateStep(page);
    await runMigrationImport(page);

    const entry = await expectCollectionEntry(page, "post", (row) => row.title === "E2E Test Post");
    expect(entry.slug).toBe("e2e-test-post");
  });

  test("sync page loads", async ({ page }) => {
    // Deep coverage: config/data-ops.spec.ts
    await page.goto("/config/sync");
    await expect(page.getByTestId("sync-page")).toBeVisible({ timeout: 10_000 });
  });

  test("trash page loads", async ({ page }) => {
    // Deep coverage: config/data-ops.spec.ts
    await page.goto("/config/trash");
    await expect(page.getByTestId("trash-page")).toBeVisible({ timeout: 10_000 });
  });

  test("redirects page loads with add control", async ({ page }) => {
    // Deep CRUD coverage: config/redirects.spec.ts
    await page.goto("/config/redirects");
    await expect(page.getByTestId("page-title")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("redirects-add")).toBeVisible({ timeout: 10_000 });
  });
});
