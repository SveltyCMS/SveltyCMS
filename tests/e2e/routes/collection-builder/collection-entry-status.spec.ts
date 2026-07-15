/**
 * @file tests/e2e/routes/collection-builder/collection-entry-status.spec.ts
 * @description Isolated E2E: entry create + publish/unpublish on an existing Names collection.
 */

import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { createEntryWithNames, openCollectionEntries } from "../../helpers/collection-builder-flow";

const COLLECTION_SLUG = "names";

test.describe("Collection Entries — Status Transitions", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("creates an entry and toggles publish/unpublish", async ({ page }) => {
    await openCollectionEntries(page, COLLECTION_SLUG);

    const createBtn = page.getByTestId("entry-list-action-create");
    if (!(await createBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(
        true,
        `Collection "${COLLECTION_SLUG}" not present — run collection-create or seed first`,
      );
      return;
    }

    await createEntryWithNames(page, "John", "Doe");
    await expect(page).toHaveURL(new RegExp(`/en/collection/${COLLECTION_SLUG}`, "i"), {
      timeout: 15_000,
    });

    const statusBadge = page
      .locator("table tbody tr")
      .first()
      .getByRole("button", { name: /^(publish|unpublish|draft)$/i });
    const rowCheckbox = page.locator("table tbody tr").first().getByRole("checkbox");

    await rowCheckbox.check();
    await page.getByTestId("entry-list-action-publish").click();
    await expect(statusBadge).toHaveText(/publish/i, { timeout: 10_000 });

    await rowCheckbox.check();
    await page.getByTestId("entry-list-action-unpublish").click();
    await expect(statusBadge).toHaveText(/unpublish/i, { timeout: 10_000 });
  });
});
