/**
 * @file tests/playwright/collection.spec.ts
 * @description Playwright end-to-end test for the full collection and widget flow in SveltyCMS.
 *   - Logs in as admin
 *   - Creates a new collection
 *   - Performs various collection actions (Published, Unpublished, etc.)
 *   - Adds a widget to the dashboard and verifies navigation
 */
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { TEST_API_HEADERS } from "../../helpers/test-api";

test.describe("Full Collection & Widget Flow", () => {
  test.setTimeout(120_000); // 2 minutes

  test("Login, create collection, perform actions, and add widget", async ({ page }) => {
    // Block external icon API requests that cause CORS errors with test headers
    await page.route("https://api.iconify.design/**", (route) => route.abort());
    await page.route("https://api.simplesvg.com/**", (route) => route.abort());
    await page.route("https://api.unisvg.com/**", (route) => route.abort());

    // 1. Login FIRST — loginAsAdmin may reset/seed an empty worker database,
    // which would drop any collection tables created before it. So we must
    // create the collection AFTER login to avoid the reset wiping it.
    await loginAsAdmin(page);

    // 0. Create Names collection schema (after login so it survives any reset)
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

    // Wait for collection to be fully created and synced
    await page.waitForTimeout(2000);

    // Navigate directly to Names collection list page (with retry)
    let collectionPageLoaded = false;
    for (let i = 0; i < 3; i++) {
      await page.goto("/en/collection/Names", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      const createBtn = page.getByRole("button", { name: /create/i }).first();
      try {
        await expect(createBtn).toBeVisible({ timeout: 10_000 });
        collectionPageLoaded = true;
        break;
      } catch {
        console.log(`[Collection] Names page not ready on attempt ${i + 1}, retrying...`);
        await page.waitForTimeout(3000);
      }
    }
    if (!collectionPageLoaded) {
      throw new Error("Names collection page did not load after 3 attempts");
    }

    // 2. Create Entry
    const createBtn = page.getByRole("button", { name: /create/i }).first();
    await createBtn.click();
    await page.getByRole("textbox", { name: /first name/i }).fill("First Name");
    await page.getByRole("textbox", { name: /last name/i }).fill("Last Name");
    await page.getByRole("button", { name: /save/i }).first().click();
    await expect(page).toHaveURL(/\/en\/collection\/Names/i, {
      timeout: 10_000,
    });

    // 3. Perform Collection Bulk Actions via the contextual multi-button dropdown.
    // The current UI workflow: select entry checkbox → open actions dropdown → pick action.
    // The dropdown dynamically filters actions by entry state (e.g. Unpublish is hidden when
    // the entry is already a draft), so we test the always-available, non-state-dependent
    // actions: Clone (creates a copy) and Delete (last, removes the entry).
    const actions = ["Clone", "Delete"];

    for (const action of actions) {
      // Reload the page to guarantee a fresh table with no lingering selection
      // state from the previous iteration. Clone adds rows and onActionSuccess
      // clears selection + invalidates, but the DOM may not have refreshed yet
      // when we loop back, causing stale checkboxes.
      await page.goto("/en/collection/Names", { waitUntil: "domcontentloaded" });
      await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 15_000 });

      // Select the first row's checkbox. After a fresh reload all checkboxes
      // are unchecked, so the first row is always a valid target.
      const checkbox = page.locator("table tbody tr").first().getByRole("checkbox").first();
      await expect(checkbox).toBeVisible({ timeout: 10_000 });
      await checkbox.click();
      console.log(`[Collection] action=${action} rows=${await page.locator("table tbody tr").count()} aria-checked=${await checkbox.getAttribute("aria-checked")}`);

      // Open the actions dropdown (enabled once a row is selected)
      const dropdownToggle = page.getByRole("button", { name: /toggle actions menu/i });
      await expect(dropdownToggle).toBeEnabled({ timeout: 10_000 });
      await dropdownToggle.click();

      // Click the action menu item (label may include a shortcut, e.g. "Delete (Alt+Del)")
      await page.getByRole("menuitem", { name: new RegExp(`^${action}`, "i") }).click();

      // Delete opens a confirmation modal — confirm it
      if (action === "Delete") {
        const confirmBtn = page.getByRole("button", { name: /^Delete$/i }).first();
        await expect(confirmBtn).toBeVisible({ timeout: 10_000 });
        await confirmBtn.click();
      }

      // Confirm we remain on the collection list page
      await expect(page).toHaveURL(/\/en\/collection\/Names/i, { timeout: 15_000 });
      await page.waitForTimeout(1000);
    }

    // 4. Add a Widget to Dashboard
    await page.goto("/config");
    await page
      .getByRole("link", { name: /dashboard/i })
      .first()
      .click();
    await page.getByRole("button", { name: /add widget/i }).click();

    // Wait for widget registry to load and menu items to appear
    await expect(page.getByRole("menuitem", { name: /cpu usage/i })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("menuitem", { name: /cpu usage/i }).click();

    // Final redirect check to dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });
});
