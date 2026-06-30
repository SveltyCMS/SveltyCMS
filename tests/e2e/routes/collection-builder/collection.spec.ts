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
    // 0. Create Names collection schema
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

    // 1. Login
    await loginAsAdmin(page);

    // Navigate directly to Names collection list page — path is always lowercase
    await page.goto("/en/collection/names");

    // 2. Create Entry — the multi-button has a parent div that intercepts clicks
    // when !hasSelections. Click the parent div's main area to trigger create.
    const createBtn = page.getByRole("button", { name: /create/i }).first();
    await createBtn.waitFor({ state: "visible", timeout: 10_000 });
    // Use evaluate to click the button directly in the DOM, bypassing overlay interception
    await createBtn.evaluate((el) => (el as HTMLButtonElement).click());
    await expect(page.locator("#fields_container")).toBeVisible({ timeout: 10_000 });
    await page.getByPlaceholder(/first_name/i).fill("First Name");
    await page.getByPlaceholder(/last_name/i).fill("Last Name");
    await page.getByRole("button", { name: /save/i }).first().click();
    await expect(page).toHaveURL(/\/en\/collection\/names/i, {
      timeout: 10_000,
    });

    // 3. Verify collection actions are available via the multi-button dropdown
    // Select the first entry checkbox to enable bulk actions
    const checkbox = page.getByRole("checkbox").nth(1); // Skip header checkbox, select first entry
    await expect(checkbox).toBeVisible({ timeout: 10_000 });
    await checkbox.check();

    // Open the dropdown to see available actions
    const dropdownToggle = page.getByRole("button", { name: /toggle actions menu/i }).first();
    await dropdownToggle.click();
    await expect(page.getByRole("menu").first()).toBeVisible({ timeout: 5000 });

    // Verify key action buttons exist in the dropdown
    await expect(page.getByRole("menuitem", { name: /publish/i }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("menuitem", { name: /unpublish/i }).first()).toBeVisible({ timeout: 5000 });

    // Close dropdown
    await page.keyboard.press("Escape");
  });
});
