import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Content Management Smoke", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("should open the collection builder and start a new draft", async ({ page }) => {
    await page.goto("/config/collectionbuilder");

    await expect(page).toHaveURL(/\/config\/collectionbuilder/);

    const newCollectionLink = page.locator('a[href="/config/collectionbuilder/new"]').first();
    const addCollectionButton = page.getByRole("button", { name: /add collection/i }).first();

    if (await newCollectionLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newCollectionLink.click();
    } else {
      await addCollectionButton.click();
    }

    await expect(page).toHaveURL(/\/config\/collectionbuilder\/new/);
    await expect(page.getByLabel(/^name$/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /save collection/i })).toBeVisible();

    await page.getByLabel(/^name$/i).first().fill(`ci_smoke_${Date.now()}`);
    await expect(page.getByText(/database id:/i)).toBeVisible();
  });

  test("should render the widgets dashboard inside extensions", async ({ page }) => {
    await page.goto("/config/extensions");

    await expect(page).toHaveURL(/\/config\/extensions/);
    await page.getByRole("button", { name: /^widgets$/i }).click();

    await expect(page.getByTestId("widget-stats")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder(/search widgets/i)).toBeVisible();
    await expect(page.getByTestId("widget-grid")).toBeVisible();
  });
});
