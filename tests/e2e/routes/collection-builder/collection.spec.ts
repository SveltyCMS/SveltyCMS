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

    // Navigate directly to Names collection list page
    await page.goto("/en/collection/Names");

    // 2. Create Entry
    await page.getByRole("button", { name: /create/i }).click();
    await page.getByPlaceholder(/first name/i).fill("First Name");
    await page.getByPlaceholder(/last name/i).fill("Last Name");
    await page.getByRole("button", { name: /save/i }).first().click();
    await expect(page).toHaveURL(/\/en\/collection\/Names/i);

    // 3. Perform Collection Actions
    const actions = ["Published", "Unpublished", "Scheduled", "Cloned", "Delete", "Testing"];

    for (const action of actions) {
      // Click action button (e.g., Published)
      await page.getByRole("button", { name: new RegExp(`^${action}$`, "i") }).click();

      // Select first collection checkbox
      const checkbox = page.locator('input[type="checkbox"]').first();
      await expect(checkbox).toBeVisible({ timeout: 5000 });
      await checkbox.check();

      // Click Save
      await page.getByRole("button", { name: /save/i }).first().click();

      // Confirm redirect to collection list
      await expect(page).toHaveURL(/\/en\/collection\/Names/i);
    }

    // 4. Add a Widget to Dashboard
    await page.getByRole("button", { name: /system configuration/i }).click();
    await page.getByRole("link", { name: /dashboard/i }).click();
    await page.getByRole("button", { name: /add widget/i }).click();

    await page.getByPlaceholder(/search widgets/i).fill("CPU Usage");
    const cpuWidget = page.getByText(/cpu usage/i);
    await expect(cpuWidget).toBeVisible({ timeout: 10_000 });
    await cpuWidget.click();

    // Final redirect check to dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });
});
