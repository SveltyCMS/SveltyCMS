/**
 * @file tests/e2e/helpers/migration-wizard.ts
 * @description Shared helpers for Smart Importer migration wizard E2E tests.
 */

import { expect, type Page } from "@playwright/test";

const WXR_FIXTURE = "tests/e2e/fixtures/sample-wordpress.wxr";

/** Upload the sample WordPress WXR and wait for detection to finish */
export async function uploadWordPressFixture(page: Page, fixturePath = WXR_FIXTURE) {
  await page.goto("/config?plugin=smart-importer");
  // Wait for the plugin workspace to fully render before interacting
  await page.locator("#migration-file-input").waitFor({ state: "attached", timeout: 20_000 });
  await page.locator("#migration-file-input").setInputFiles(fixturePath);
  await expect(page.getByText(/wordpress/i).first()).toBeVisible({
    timeout: 15_000,
  });
  // Scope to the plugin workspace overlay: StickyActions mirrors primary actions
  // into the AdminPageShell sticky bar too, which would break strict-mode locators.
  const workspace = page.getByLabel("Plugin workspace");
  await expect(workspace.getByRole("button", { name: /next: map fields/i })).toBeEnabled({
    timeout: 15_000,
  });
}

/** Step 1 → 2 → 3 (validate) */
export async function advanceToValidateStep(page: Page) {
  const workspace = page.getByLabel("Plugin workspace");
  await workspace.getByRole("button", { name: /next: map fields/i }).click();
  await expect(workspace.getByRole("button", { name: /next: validate/i })).toBeEnabled({
    timeout: 10_000,
  });
  await workspace.getByRole("button", { name: /next: validate/i }).click();
}

/** Run dry-run then start SSE import on step 4 */
export async function runMigrationImport(page: Page) {
  const workspace = page.getByLabel("Plugin workspace");
  await workspace.getByRole("button", { name: /run dry run/i }).click();
  await expect(workspace.getByRole("button", { name: /start import/i })).toBeEnabled({
    timeout: 30_000,
  });
  await workspace.getByRole("button", { name: /start import/i }).click();
  await expect(workspace.getByRole("heading", { name: /migration complete/i })).toBeVisible({
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
