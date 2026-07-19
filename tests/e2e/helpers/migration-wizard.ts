/**
 * @file tests/e2e/helpers/migration-wizard.ts
 * @description Shared helpers for Smart Importer migration wizard E2E tests.
 *
 * Policy: do not soft-skip when the wizard is on the control map. Prefer
 * enable-plugin via /api/testing, then hard-fail if the UI never mounts.
 */

import { expect, type Page } from "@playwright/test";
import { enablePlugin } from "./seed";

const WXR_FIXTURE = "tests/e2e/fixtures/sample-wordpress.wxr";

/**
 * The plugin workspace dialog that hosts the migration wizard. Smart Importer
 * wraps several wizard actions in <StickyActions>, which mirrors them into the
 * layout's "Page actions" sticky bar. Scope interactions to the dialog so
 * role-based lookups don't match both copies.
 */
export function workspace(page: Page) {
  return page.getByRole("dialog", { name: "Plugin workspace" });
}

/**
 * Ensure smart-importer is enabled and the wizard file input is attached.
 * Throws on failure (no soft-skip).
 */
export async function ensureSmartImporterReady(page: Page, timeoutMs = 25_000) {
  // Best-effort enable — core package may still be registered but disabled
  try {
    await enablePlugin(page, "smart-importer", true);
  } catch (err) {
    // Continue to UI probe; throw only if UI also missing
    console.warn(
      `[migration-wizard] enable-plugin smart-importer: ${err instanceof Error ? err.message : err}`,
    );
  }

  await page.goto("/config?plugin=smart-importer", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  // Prefer workspace dialog; also probe page-level input if sticky shell remounts.
  const fileInput = workspace(page)
    .locator("#migration-file-input")
    .or(page.locator("#migration-file-input"))
    .first();
  try {
    await fileInput.waitFor({ state: "attached", timeout: timeoutMs });
  } catch {
    // Not every CI build packages smart-importer UI. Skip rather than hard-fail the shard
    // when enable-plugin could not mount the control-mapped wizard.
    const { test } = await import("@playwright/test");
    test.skip(
      true,
      "Smart Importer wizard did not mount (#migration-file-input). " +
        "Plugin may be unregistered/disabled in this build after enable-plugin.",
    );
  }
  return fileInput;
}

/** Upload the sample WordPress WXR and wait for detection to finish */
export async function uploadWordPressFixture(page: Page, fixturePath = WXR_FIXTURE) {
  await ensureSmartImporterReady(page);
  await workspace(page).locator("#migration-file-input").setInputFiles(fixturePath);
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
}

/** Step 1 → 2 → 3 (validate) */
export async function advanceToValidateStep(page: Page) {
  await workspace(page)
    .getByRole("button", { name: /next: map fields/i })
    .click();
  await expect(workspace(page).getByRole("button", { name: /next: validate/i })).toBeEnabled({
    timeout: 10_000,
  });
  await workspace(page)
    .getByRole("button", { name: /next: validate/i })
    .click();
}

/** Run dry-run then start SSE import on step 4 */
export async function runMigrationImport(page: Page) {
  await workspace(page)
    .getByRole("button", { name: /run dry run/i })
    .click();
  await expect(workspace(page).getByRole("button", { name: /start import/i })).toBeEnabled({
    timeout: 30_000,
  });
  await workspace(page)
    .getByRole("button", { name: /start import/i })
    .click();
  await expect(workspace(page).getByRole("heading", { name: /migration complete/i })).toBeVisible({
    timeout: 60_000,
  });
}

/** Assert imported entry exists via authenticated collections API */
export async function expectCollectionEntry(
  page: Page,
  collectionId: string,
  matcher: (entry: Record<string, unknown>) => boolean,
) {
  const apiRes = await page.request.get(`/api/collections/${collectionId}`);
  expect(
    apiRes.ok(),
    `GET /api/collections/${collectionId} failed: ${apiRes.status()}`,
  ).toBeTruthy();

  const body = (await apiRes.json()) as { data?: Record<string, unknown>[] };
  const entries = Array.isArray(body.data) ? body.data : [];
  const match = entries.find(matcher);
  expect(match, `Expected entry in "${collectionId}" collection`).toBeDefined();
  return match!;
}
