/**
 * @file tests/e2e/routes/collection-builder/collection-create.spec.ts
 * @description Isolated E2E: create a collection with two Input fields via the builder UI.
 */

import { expect, test } from "@playwright/test";
import { ensureAuthenticated } from "../../helpers/test-auth";
import {
  addInputField,
  openNewCollectionEditor,
  saveCollectionSchema,
  uniqueCollectionFixture,
} from "../../helpers/collection-builder-flow";

test.describe("Collection Builder — Create Schema", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
  });

  test("creates a collection with first and last name fields", async ({ page }) => {
    const fixture = uniqueCollectionFixture("Names");

    await openNewCollectionEditor(page);
    await page.getByTestId("collection-name-input").fill(fixture.name);

    await addInputField(page, { label: "First Name", fieldName: "first_name", index: 0 });
    await addInputField(page, { label: "Last Name", fieldName: "last_name", index: 1 });

    await saveCollectionSchema(page);

    await page.goto(`/en/collection/${fixture.slug}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("entry-list-action-create")).toBeVisible({ timeout: 15_000 });
  });
});
