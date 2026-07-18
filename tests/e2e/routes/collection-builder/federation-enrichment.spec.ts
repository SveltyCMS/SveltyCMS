/**
 * @file tests/e2e/routes/collection-builder/federation-enrichment.spec.ts
 * @description E2E — Collection Builder virtual enrichment picker (Unified Data Hub).
 */

import { expect, test } from "@playwright/test";
import { ensureAuthenticated } from "../../helpers/test-auth";
import { TEST_API_HEADERS } from "../../helpers/test-api";
import {
  openNewCollectionEditor,
  quickAddInputWidget,
} from "../../helpers/collection-builder-flow";
import { enablePlugin, handleOptionalInfraUnavailable } from "../../helpers/seed";

test.describe("Collection Builder — Federation Enrichment Picker", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
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
      const body = await seedRes.json().catch(() => ({}));
      handleOptionalInfraUnavailable(
        "POSTGRES",
        body.message || "Postgres UDH fixture unavailable",
        (c, d) => test.skip(c, d),
      );
      return;
    }
    expect(seedRes.ok()).toBeTruthy();

    try {
      await enablePlugin(page, "unified-data-hub", true);
    } catch {
      /* plugin may already be enabled */
    }

    const collectionName = `FedEnrich${Date.now()}`;

    await openNewCollectionEditor(page);
    await page.getByTestId("collection-name-input").fill(collectionName);

    await quickAddInputWidget(page);

    const fieldRow = page.getByTestId("widget-fields-list").getByTestId("widget-field-row").first();
    await expect(fieldRow.getByText(/New Input/i)).toBeVisible({ timeout: 15_000 });
    await fieldRow.getByTestId("widget-field-open").click();

    await expect(page.getByTestId("widget-field-label")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("widget-field-label").fill("Author");
    await page.getByTestId("widget-field-name").fill("authorId");
    await page.getByTestId("widget-field-apply").click();

    await page.getByTestId("tab-permissions").click();
    const picker = page.getByTestId("federation-enrichment-picker");
    await expect(
      picker,
      "Federation enrichment picker must render after UDH enable + seed",
    ).toBeVisible({ timeout: 20_000 });

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
