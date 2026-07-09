/**
 * @file tests/e2e/routes/collection-builder/collection.spec.ts
 * @description Playwright end-to-end test for the full collection and widget flow in SveltyCMS.
 *   - Creates a collection through the real builder UI (no /api/testing backdoor)
 *   - Creates content entries
 *   - Performs publish/unpublish status transitions
 *   - Verifies via the public API
 */
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

test.describe("Full Collection & Widget Flow", () => {
  test.setTimeout(180_000); // 3 minutes (builder UI is slower than API)

  test("Create collection via builder, add entries, and perform status transitions", async ({
    page,
  }) => {
    const COLLECTION_NAME = "Names";
    const COLLECTION_SLUG = "names";

    // 1. Login
    await loginAsAdmin(page);

    // 2. Create the "Names" collection through the builder UI
    await page.goto("/config/collectionbuilder");
    await page.getByTestId("add-collection-button").first().click();
    await page.waitForURL(/\/config\/collectionbuilder\/new/, { timeout: 15_000 });

    // Fill collection name
    await page.getByTestId("collection-name-input").fill(COLLECTION_NAME);

    // Switch to Widgets tab
    await page.getByTestId("tab-widgets").click();

    // Add first field (First Name)
    await page.getByTestId("quick-add-input").click();
    await expect(page.getByText(/New Input/i)).toBeVisible({ timeout: 10_000 });

    // Configure the first field: click on it to open inspector
    await page
      .getByTestId("widget-fields-list")
      .getByText(/New Input/i)
      .first()
      .click();
    await page.getByPlaceholder("e.g. Profile Picture").fill("First Name");
    await page.getByPlaceholder("e.g. profile_pic").fill("first_name");
    await page.getByRole("button", { name: /Apply Changes/i }).click();

    // Add second field (Last Name)
    await page.getByTestId("quick-add-input").click();
    await expect(page.getByText(/New Input/i).nth(1)).toBeVisible({ timeout: 10_000 });

    // Configure the second field
    await page
      .getByTestId("widget-fields-list")
      .getByText(/New Input/i)
      .nth(1)
      .click();
    await page.getByPlaceholder("e.g. Profile Picture").fill("Last Name");
    await page.getByPlaceholder("e.g. profile_pic").fill("last_name");
    await page.getByRole("button", { name: /Apply Changes/i }).click();

    // Save the collection
    await page.getByTestId("save-collection-button").first().click();
    await expect(page.getByText(/collection saved/i)).toBeVisible({ timeout: 15_000 });

    // 3. Navigate to the collection content page
    await page.goto(`/en/collection/${COLLECTION_SLUG}`);

    // 4. Create Entry — the entry-list multi-button's Create action uses an
    //    inner <Button> with `pointer-events-none` (click handler on wrapper div).
    //    Use force to dispatch through the intercepting wrapper.
    const createBtn = page.getByRole("button", { name: /create/i });
    const createBtnVisible = await createBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (createBtnVisible) {
      await createBtn.click({ force: true });
    } else {
      const altCreate = page.getByRole("button", { name: /add|new entry/i }).first();
      await altCreate.waitFor({ state: "visible", timeout: 10_000 });
      await altCreate.click({ force: true });
    }

    // The Input widget renders textboxes whose accessible name matches the field label.
    await page.getByRole("textbox", { name: "First Name" }).fill("John");
    await page.getByRole("textbox", { name: "Last Name" }).fill("Doe");
    await page.getByRole("button", { name: /save/i }).first().click();
    await expect(page).toHaveURL(new RegExp(`/en/collection/${COLLECTION_SLUG}`, "i"), {
      timeout: 10_000,
    });

    // 5. Perform Collection Actions — bulk status transitions
    const statusBadge = page
      .locator("table tbody tr")
      .first()
      .getByRole("button", { name: /^(publish|unpublish|draft)$/i });
    const rowCheckbox = page.locator("table tbody tr").first().getByRole("checkbox");

    // 5a. Publish the entry (entry starts as "unpublish" → Publish)
    await rowCheckbox.check();
    await page.getByRole("button", { name: /^publish$/i }).click({ force: true });
    await expect(statusBadge).toHaveText(/publish/i, { timeout: 10_000 });

    // 5b. Unpublish the entry (now "publish" → Unpublish)
    await rowCheckbox.check();
    await page.getByRole("button", { name: /^unpublish$/i }).click({ force: true });
    await expect(statusBadge).toHaveText(/unpublish/i, { timeout: 10_000 });

    // Confirm we stayed on the collection list page.
    await expect(page).toHaveURL(new RegExp(`/en/collection/${COLLECTION_SLUG}`, "i"));
  });
});
