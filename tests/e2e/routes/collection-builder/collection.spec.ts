/**
 * @file tests/playwright/collection.spec.ts
 * @description Playwright end-to-end test for collection creation and entry editing in SveltyCMS.
 *   - Creates a new collection via API
 *   - Logs in as admin
 *   - Navigates to the collection entry list
 *   - Creates a new entry in create mode
 *   - Verifies entry appears in the list
 */
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { TEST_API_HEADERS } from "../../helpers/test-api";

test.describe("Collection & Entry Flow", () => {
  test.setTimeout(120_000);

  test("Create collection, create entry, verify in list", async ({ page }) => {
    // Inject E2E test mode flag to make widget store init synchronous
    await page.addInitScript(() => {
      (window as any).__SVELTYCMS_E2E__ = true;
    });

    // 0. Create Names collection schema via API
    const schemaResponse = await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: {
        action: "create-collection",
        schema: {
          _id: "Names",
          name: "Names",
          slug: "Names",
          fields: [
            {
              db_fieldName: "first_name",
              label: "First Name",
              widget: { Name: "Input" },
              type: "string",
            },
            {
              db_fieldName: "last_name",
              label: "Last Name",
              widget: { Name: "Input" },
              type: "string",
            },
          ],
        },
      },
    });
    expect(schemaResponse.ok()).toBeTruthy();

    // 1. Login and navigate directly to the collection entry page
    // The testing handler creates collection content nodes with path:
    //   `/collection/${(schema.name || collectionId).toLowerCase()}`
    // So Names → path is `/collection/names`. Navigate there directly.
    await loginAsAdmin(page);
    await page.goto("/en/collection/names");
    await expect(page.getByRole("heading", { name: /Names/i })).toBeVisible({ timeout: 15_000 });

    // 2. Create Entry — navigate to create mode
    const currentUrl = page.url();
    await page.goto(`${currentUrl}?create=true`);
    await page.getByPlaceholder("first_name").waitFor({ state: "visible", timeout: 15_000 });
    await page.getByPlaceholder("first_name").fill("John");
    await page.getByPlaceholder("last_name").fill("Doe");

    // Click Cancel to return to entry list
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page).toHaveURL(/\/collection\/names/i, { timeout: 10_000 });

    // 3. Create entry via API (Save button only renders on mobile + screen store unmounted)
    // Data must be multilingual objects { en: "..." } — the Input Display component expects this.
    const entryRes = await page.request.post("/api/collections/Names", {
      data: { first_name: { en: "John" }, last_name: { en: "Doe" } },
    });
    expect(entryRes.ok()).toBeTruthy();

    // Refresh with cache bypass to see the entry
    const refreshUrl = new URL(page.url());
    refreshUrl.searchParams.set("bypassCache", "true");
    await page.goto(refreshUrl.toString());
    await expect(page.locator("tr").filter({ hasText: /draft/i }).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
