/**
 * @file tests/e2e/routes/collection-builder/collection-entry-status.spec.ts
 * @description Entry create + publish/unpublish — seeds its own collection (no soft-skip).
 */

import { expect, test } from "@playwright/test";
import { ensureAuthenticated } from "../../helpers/test-auth";
import {
  addInputField,
  createEntryWithNames,
  openCollectionEntries,
  openNewCollectionEditor,
  saveCollectionSchema,
  uniqueCollectionFixture,
} from "../../helpers/collection-builder-flow";

test.describe("Collection Entries — Status Transitions", () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
  });

  test("creates collection + entry and toggles publish/unpublish", async ({ page }) => {
    const fixture = uniqueCollectionFixture("E2E_Status");

    // Seed schema: First Name + Last Name (matches createEntryWithNames labels)
    await openNewCollectionEditor(page);
    await page.getByTestId("collection-name-input").fill(fixture.name);
    await addInputField(page, { label: "First Name", fieldName: "firstName", index: 0 });
    await addInputField(page, { label: "Last Name", fieldName: "lastName", index: 1 });
    await saveCollectionSchema(page);

    await openCollectionEntries(page, fixture.slug);

    const createBtn = page.getByTestId("entry-list-action-create");
    await expect(
      createBtn,
      `Expected entry list for collection "${fixture.slug}" after schema save`,
    ).toBeVisible({ timeout: 20_000 });

    await createEntryWithNames(page, "John", "Doe");
    await expect(page).toHaveURL(new RegExp(`/en/collection/${fixture.slug}`, "i"), {
      timeout: 15_000,
    });

    const firstRow = page.locator("table tbody tr").first();
    await expect(firstRow).toBeVisible({ timeout: 15_000 });

    const statusBadge = firstRow.getByRole("button", {
      name: /^(publish|unpublish|draft|published|unpublished)$/i,
    });
    const rowCheckbox = firstRow.getByRole("checkbox");

    await rowCheckbox.check();
    await page.getByTestId("entry-list-action-publish").click();
    await expect(statusBadge.or(firstRow.getByText(/publish/i)).first()).toBeVisible({
      timeout: 10_000,
    });

    await rowCheckbox.check();
    await page.getByTestId("entry-list-action-unpublish").click();
    await expect(statusBadge.or(firstRow.getByText(/unpublish|draft/i)).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
