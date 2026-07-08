/**
 * @file tests/e2e/helpers/migration-wizard.ts
 * @description Shared helpers for Smart Importer migration wizard E2E tests.
 */

import { expect, type Page } from "@playwright/test";

const WXR_FIXTURE = "tests/e2e/fixtures/sample-wordpress.wxr";

function pluginWorkspace(page: Page) {
  return page.getByLabel("Plugin workspace");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractCollectionEntries(body: unknown): Record<string, unknown>[] {
  const root = asRecord(body);
  const data = root?.data;
  const result = asRecord(data);
  const candidates = [
    data,
    result?.data,
    result?.items,
    asRecord(result?.data)?.items,
    asRecord(result?.data)?.data,
  ];

  const entries = candidates.find(Array.isArray) as unknown[] | undefined;
  return (entries ?? []).map((entry) => {
    const doc = asRecord(entry);
    const payload = asRecord(doc?.data);
    return payload ? { ...payload, ...doc } : (doc ?? {});
  });
}

/** Upload the sample WordPress WXR and wait for detection to finish */
export async function uploadWordPressFixture(page: Page, fixturePath = WXR_FIXTURE) {
  await page.goto("/config?plugin=smart-importer");
  const workspace = pluginWorkspace(page);
  // Wait for the plugin workspace to fully render before interacting
  await page.locator("#migration-file-input").waitFor({ state: "attached", timeout: 20_000 });
  await page.locator("#migration-file-input").setInputFiles(fixturePath);
  await expect(page.getByText(/wordpress/i).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(workspace.getByRole("button", { name: /next: map fields/i })).toBeEnabled({
    timeout: 15_000,
  });
}

/** Step 1 → 2 → 3 (validate) */
export async function advanceToValidateStep(page: Page) {
  const workspace = pluginWorkspace(page);
  await workspace.getByRole("button", { name: /next: map fields/i }).click();
  await expect(workspace.getByRole("button", { name: /next: validate/i })).toBeEnabled({
    timeout: 10_000,
  });
  await workspace.getByRole("button", { name: /next: validate/i }).click();
}

/** Run dry-run then start SSE import on step 4 */
export async function runMigrationImport(page: Page) {
  const workspace = pluginWorkspace(page);
  await workspace.getByRole("button", { name: /run dry run/i }).click();
  await expect(workspace.getByRole("button", { name: /start import/i })).toBeEnabled({
    timeout: 30_000,
  });
  await workspace.getByRole("button", { name: /start import/i }).click();
  await expect(page.getByRole("heading", { name: /migration complete/i })).toBeVisible({
    timeout: 60_000,
  });
}

/** Assert imported entry exists via authenticated collections API */
export async function expectCollectionEntry(
  page: Page,
  collectionId: string,
  matcher: (entry: Record<string, unknown>) => boolean,
) {
  const deadline = Date.now() + 20_000;
  let lastEntries: Record<string, unknown>[] = [];
  let lastStatus = 0;

  while (Date.now() < deadline) {
    const apiRes = await page.request.get(
      `/api/collections/${collectionId}?publicationFilter=all&bypassCache=true&limit=100`,
    );
    lastStatus = apiRes.status();
    expect(
      apiRes.ok(),
      `GET /api/collections/${collectionId} failed: ${apiRes.status()}`,
    ).toBeTruthy();

    const body = await apiRes.json();
    lastEntries = extractCollectionEntries(body);
    const match = lastEntries.find(matcher);
    if (match) return match;

    await page.waitForTimeout(500);
  }

  expect(
    undefined,
    `Expected entry in "${collectionId}" collection after polling. Last status: ${lastStatus}. Last entries: ${JSON.stringify(lastEntries).slice(0, 1_000)}`,
  ).toBeDefined();
  throw new Error(`Expected entry in "${collectionId}" collection`);
}
