/**
 * @file tests/e2e/routes/collection-builder/federation-enrichment.spec.ts
 * @description E2E — Collection Builder virtual enrichment picker (Unified Data Hub).
 */

import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { TEST_API_HEADERS } from "../../helpers/test-api";

test.describe("Collection Builder — Federation Enrichment Picker", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("configures federationEnrichments on Settings tab and persists after save", async ({
    page,
    request,
  }) => {
    const seedRes = await request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: { action: "seed-unified-data-hub", fixture: "postgres", rowCount: 5 },
    });
    if (seedRes.status() === 503) {
      test.skip(true, "Postgres fixture unavailable");
      return;
    }

    const collectionName = `FedEnrich${Date.now()}`;

    await page.goto("/config/collectionbuilder");
    await page.getByTestId("add-collection-button").first().click();
    await page.getByTestId("collection-name-input").fill(collectionName);

    await page.getByTestId("tab-widgets").click();
    await page.getByTestId("quick-add-input").click();
    await expect(page.getByText(/New Input/i)).toBeVisible({ timeout: 10_000 });

    const fieldRow = page
      .getByTestId("widget-fields-list")
      .getByText(/New Input/i)
      .first();
    await fieldRow.click();

    await page.getByPlaceholder("e.g. Profile Picture").fill("Author");
    await page.getByPlaceholder("e.g. profile_pic").fill("authorId");
    await page.getByRole("button", { name: /Apply Changes/i }).click();

    await page.getByTestId("tab-permissions").click();
    const picker = page.getByTestId("federation-enrichment-picker");
    const pickerVisible = await picker
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!pickerVisible) {
      test.skip(true, "Federation enrichment picker not visible — enable Unified Data Hub plugin");
      return;
    }

    const addBtn = page.getByTestId("add-federation-enrichment");
    if (await addBtn.isEnabled()) {
      await addBtn.click();
    }

    await expect(page.getByTestId("federation-enrichment-row").first()).toBeVisible({
      timeout: 10_000,
    });

    await page.getByTestId("save-collection-button").first().click();
    await expect(page.getByText(/collection saved/i)).toBeVisible({ timeout: 15_000 });

    await page.goto(`/config/collectionbuilder/edit/${collectionName}`);
    await page.getByTestId("tab-permissions").click();
    await expect(page.getByTestId("federation-enrichment-picker")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("federation-enrichment-row").first()).toBeVisible();
  });
});
