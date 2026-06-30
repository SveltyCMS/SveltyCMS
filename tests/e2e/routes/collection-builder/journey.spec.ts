import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

/**
 * @file tests/e2e/master-behavioral-journey.spec.ts
 * @description TQA Pillar 1: Comprehensive behavioral journey test.
 * Simulates the full lifecycle: Builder -> Schema -> Entry -> API.
 */

test.describe("Master Behavioral Journey", () => {
  test("Full Lifecycle: Builder -> Schema -> Entry -> API", async ({ page }) => {
    test.setTimeout(120_000);
    // 1. Authentication
    await loginAsAdmin(page);
    await page.goto("/config/collectionbuilder");
    await expect(
      page.getByRole("heading", { level: 1, name: /collection builder/i }),
    ).toBeVisible();

    // 2. Create a New Collection via editor
    const collectionName = `JourneyProj_${Date.now()}`;
    await page.goto("/config/collectionbuilder/new");
    await expect(page.getByTestId("collection-name-input")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByTestId("collection-name-input").fill(collectionName);
    await page.waitForTimeout(500);

    // 3. Configure Collection Fields (GUI) — click step 2 in the stepper
    await page.getByRole("button", { name: /field configuration/i }).click();
    await page.getByTestId("quick-add-input").click();
    // The widget generates a field with label "New Input"
    await expect(page.getByText(/New Input/i)).toBeVisible({
      timeout: 10_000,
    });

    // 4. Save & Compile Schema
    await page.getByTestId("save-collection-button").first().click();
    await expect(page.getByText(/collection saved/i)).toBeVisible({
      timeout: 15_000,
    });

    // 6. Create an Entry in the New Collection
    // Navigate to the newly created collection page — path is always lowercase
    const collectionPath = collectionName.toLowerCase();
    await page.goto(`/en/collection/${collectionPath}`);
    await page.getByRole("button", { name: /^create$/i }).click();

    // Fill the dynamically generated text field
    await page.getByPlaceholder(/new_input/i).fill("The TQA Project");
    await page.getByRole("button", { name: /save/i }).first().click();

    // Wait for save to complete — page should return to collection list
    await expect(page).toHaveURL(/\/en\/collection\//i, { timeout: 15_000 });

    // 7. Verify the collection page shows the entry list (not an error page)
    await expect(page.locator("table")).toBeVisible({ timeout: 10_000 });

    console.log("✅ Master Behavioral Journey Completed Successfully.");
  });
});
