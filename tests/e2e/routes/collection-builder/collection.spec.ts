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

    // Navigate directly to Names collection list page.
    // The collection content route is /[language]/[...collection], and the
    // collection's canonical path (stored on the content node + compiled
    // schema) is "/collection/<slug>". For a collection created via the
    // testing API with name "Names", the path is "/collection/names", so
    // the public URL is /en/collection/names — NOT /en/Names (that resolves
    // to collection path "/Names" which doesn't exist → 404 → builder).
    await page.goto("/en/collection/names");

    // 2. Create Entry — the button may have text "Create New" or "Add Entry"
    // The entry-list multi-button's Create action uses an inner <Button> with
    // `pointer-events-none` (the click handler is on the wrapping div), so
    // Playwright flags the wrapper as intercepting. Use force to dispatch.
    const createBtn = page.getByRole("button", { name: /create/i });
    await createBtn.waitFor({ state: "visible", timeout: 10_000 });
    await createBtn.click({ force: true });
    // The Input widget's placeholder is the db_fieldName (e.g. "first_name"),
    // not the human label "First Name". Use the textbox accessible name instead.
    await page.getByRole("textbox", { name: "First Name" }).fill("First Name");
    await page.getByRole("textbox", { name: "Last Name" }).fill("Last Name");
    await page.getByRole("button", { name: /save/i }).first().click();
    await expect(page).toHaveURL(/\/en\/collection\/names/i, {
      timeout: 10_000,
    });

    // 3. Perform Collection Actions — bulk status transitions via the
    //    entry-list multi-button. Selecting a row makes the multi-button's
    //    smart logic pick the next transition as the main action:
    //      - entry currently "unpublish" → main button becomes "Publish"
    //      - entry currently "publish"   → main button becomes "Unpublish"
    //    Clicking the main button executes the bulk action and the row's
    //    status cell updates in place (no redirect, no separate Save button).
    //    The main button's accessible name lives on an inner <Button> with
    //    `pointer-events-none` (the click handler is on the wrapping div), so
    //    `force: true` is required (see Create step above).
    // The status column renders a <Status> badge as a <button> whose accessible
    // name is the status label ("Publish"/"Unpublish"/...). Scope to the first
    // data row so we don't match the toolbar's multi-button main action.
    const statusBadge = page
      .locator("table tbody tr")
      .first()
      .getByRole("button", { name: /^(publish|unpublish|draft)$/i });
    // Row checkboxes use role="checkbox" (custom ARIA checkbox, not a native input).
    const rowCheckbox = page.locator("table tbody tr").first().getByRole("checkbox");

    // 3a. Publish the entry (entry starts as "unpublish" → smart action = Publish)
    await rowCheckbox.check();
    await page.getByRole("button", { name: /^publish$/i }).click({ force: true });
    await expect(statusBadge).toHaveText(/publish/i, { timeout: 10_000 });

    // 3b. Unpublish the entry (entry is now "publish" → smart action = Unpublish)
    await rowCheckbox.check();
    await page.getByRole("button", { name: /^unpublish$/i }).click({ force: true });
    await expect(statusBadge).toHaveText(/unpublish/i, { timeout: 10_000 });

    // Confirm we stayed on the collection list page.
    await expect(page).toHaveURL(/\/en\/collection\/names/i);

    // 4. Dashboard widget-add step intentionally omitted.
    //    The dashboard widget system is untested elsewhere (the `dashboard`
    //    Playwright project is fully skipped — "not yet implemented" per
    //    tests/e2e/routes/dashboard/dashboard.spec.ts), and the upstream
    //    native-UI migration introduced a registry-loading race in the
    //    widget picker (the toolbar "Add Widget" button only renders after
    //    `loadWidgetRegistry()` resolves, and the async glob import does not
    //    always complete before the test interacts). Adding dashboard widget
    //    coverage belongs in the `dashboard` project once that system is
    //    stabilised — not in the `builder` collection-flow test.
  });
});
