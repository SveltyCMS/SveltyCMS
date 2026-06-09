import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Content Smoke", () => {
  test("admin can reach collection builder and open a new collection draft", async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto("/config/collectionbuilder", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/\/config\/collectionbuilder/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: /collection builder/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: /add category/i })).toBeVisible({
      timeout: 10_000,
    });

    const addCollectionButton = page.getByRole("button", { name: /add collection/i });
    await expect(addCollectionButton).toBeVisible({ timeout: 10_000 });
    await addCollectionButton.click();

    await expect(page).toHaveURL(/\/config\/collectionbuilder\/new/, { timeout: 10_000 });
    await expect(page.getByRole("button", { name: /save collection/i })).toBeVisible({
      timeout: 10_000,
    });
  });
});
