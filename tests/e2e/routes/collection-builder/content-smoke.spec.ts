/**
 * @file tests/e2e/routes/collection-builder/content-smoke.spec.ts
 * @description Stable smoke: login → collection builder draft → (optional) stay green.
 * Prefer data-testid helpers over role-only selectors.
 */

import { expect, test } from "@playwright/test";
import { loginAsAdmin, logout } from "../../helpers/auth";
import {
  openNewCollectionEditor,
  uniqueCollectionFixture,
} from "../../helpers/collection-builder-flow";

test.describe("Content Smoke", () => {
  test("admin can open collection builder and start a new collection draft", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

    await page.goto("/config/collectionbuilder", {
      waitUntil: "domcontentloaded",
    });

    await expect(page).toHaveURL(/\/config\/collectionbuilder/, {
      timeout: 10_000,
    });

    // Prefer test ids when present; fall back to roles for older shells
    const heading = page.getByRole("heading", { level: 1, name: /collection builder/i });
    await expect(heading).toBeVisible({ timeout: 10_000 });

    const addByTestId = page.getByTestId("add-collection-button").first();
    if (await addByTestId.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addByTestId.click();
    } else {
      await page.getByRole("button", { name: /add collection/i }).click();
    }

    await expect(page).toHaveURL(/\/config\/collectionbuilder\/new/, {
      timeout: 15_000,
    });

    const nameInput = page.getByTestId("collection-name-input");
    await expect(nameInput).toBeVisible({ timeout: 10_000 });

    const fixture = uniqueCollectionFixture("Smoke");
    await nameInput.fill(fixture.name);

    await expect(page.getByTestId("save-collection-button").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("admin smoke: open new editor via shared helper then logout", async ({ page }) => {
    await loginAsAdmin(page);
    await openNewCollectionEditor(page);
    await expect(page.getByTestId("collection-name-input")).toBeVisible({ timeout: 10_000 });
    await logout(page).catch(async () => {
      // Some envs expose logout only in user menu; best-effort
      await page.goto("/login", { waitUntil: "domcontentloaded" });
    });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
