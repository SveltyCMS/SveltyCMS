import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

/**
 * @file tests/e2e/master-behavioral-journey.spec.ts
 * @description TQA Pillar 1: Comprehensive behavioral journey test.
 * Simulates the full lifecycle: Builder -> Schema -> Entry -> API.
 */

test.describe("Master Behavioral Journey", () => {
  test("Full Lifecycle: Builder -> Schema -> Entry -> API", async ({ page, request }) => {
    // 1. Authentication
    await loginAsAdmin(page);
    await expect(page.getByText("Dashboard")).toBeVisible();

    // 2. Navigate to Collection Builder
    await page.goto("/config/collectionbuilder");
    await expect(page.getByText("Add Category")).toBeVisible();

    // 3. Create a New Collection
    // We'll use a unique name to avoid conflicts with other tests
    const collectionName = `JourneyProj_${Date.now()}`;
    await page
      .getByRole("button", { name: /add collection/i })
      .first()
      .click();
    await page.locator('input[placeholder="Collection Name"]').fill(collectionName);
    await page.keyboard.press("Enter");

    // 4. Configure Collection Fields (GUI)
    await expect(page.getByText("Define your Collection")).toBeVisible();

    // Add a simple text field
    await page.getByRole("button", { name: /add field/i }).click();
    await page.getByText("Input").click();
    await page.getByRole("button", { name: /submit/i }).click();

    await page.locator('input[name="label"]').fill("Project Name");
    await page.locator('input[name="db_fieldName"]').fill("project_name");
    await page.getByRole("button", { name: /save/i }).click();

    // 5. Save & Compile Schema
    // This triggers the TypeScript compilation and DB DDL
    await page.getByRole("button", { name: /save collection/i }).click();

    // Wait for the compiler and refresh (Toast or Redirect)
    await expect(page.getByText(/collection saved/i)).toBeVisible();

    // 6. Create an Entry in the New Collection
    // Navigate to the newly created collection page
    await page.goto(`/en/Collections/${collectionName}`);
    await page.getByRole("button", { name: /create new/i }).click();

    // Fill the dynamically generated field
    await page.locator('input[placeholder="Project Name"]').fill("The TQA Project");
    await page.getByRole("button", { name: /save/i }).click();
    await expect(page.getByText("The TQA Project")).toBeVisible();

    // 7. Verify API Output (Public Interface)
    // We fetch the data from the API to ensure the DB and Dispatcher are in sync
    const apiRes = await request.get(`/api/collections/${collectionName}`);
    expect(apiRes.ok()).toBeTruthy();

    const body = await apiRes.json();
    const entry = body.data.find((e: any) => e.project_name === "The TQA Project");

    expect(entry).toBeDefined();
    expect(entry.status).toBe("unpublish"); // Default status

    console.log("✅ Master Behavioral Journey Completed Successfully.");
  });
});
