/**
 * @file tests/e2e/setup-wizard-full.spec.ts
 * @description Comprehensive E2E test suite for the SveltyCMS Setup Wizard.
 * Tests all 4 database engines, all steps, validation rules, and state management.
 */

import { expect, test, type Page } from "@playwright/test";

// --- HELPERS ---

/**
 * Ensures the system starts in a clean setup mode by resetting via the testing API.
 */
async function hardReset(page: Page) {
  await page.goto("/setup");
  const resetBtn = page.getByRole("button", { name: /reset data/i }).first();
  if (await resetBtn.isVisible()) {
    await resetBtn.click();
    const confirmBtn = page.locator("button").filter({ hasText: /yes/i }).first();
    await confirmBtn.click({ force: true });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
  }
}

/**
 * Standardizes step transitions.
 */
async function next(page: Page) {
  const nextBtn = page.getByLabel("Next", { exact: true }).first();
  await expect(nextBtn).toBeEnabled({ timeout: 10000 });
  await nextBtn.click({ force: true });
  await page.waitForTimeout(1000);
}

// --- TEST SUITE ---

const DB_TYPES = ["sqlite", "mongodb", "postgresql", "mariadb"] as const;

test.describe("Setup Wizard Full Performance Audit", () => {
  
  for (const dbType of DB_TYPES) {
    test(`Wizard Flow: ${dbType.toUpperCase()}`, async ({ page }) => {
      test.setTimeout(240_000); // DB seeding can be slow
      
      await hardReset(page);
      await page.goto("/setup");

      // 1. Welcome Modal handling
      const welcome = page.locator("#welcome-heading").first();
      if (await welcome.isVisible({ timeout: 5000 }).catch(() => false)) {
        await page.getByRole("button", { name: /get started/i }).first().click({ force: true });
      }

      // 2. Cookie Consent
      const cookie = page.getByRole("button", { name: /accept all/i }).first();
      if (await cookie.isVisible({ timeout: 2000 }).catch(() => false)) {
        await cookie.click();
      }

      // --- STEP 1: DATABASE ---
      console.log(`[${dbType}] Configuring database...`);
      await page.locator("#db-type").selectOption(dbType);
      
      if (dbType === "sqlite") {
        await page.locator("#db-name").fill(`e2e_wizard_${dbType}.db`);
      } else {
        // Assume standard dev ports and localhost
        const ports = { mongodb: "27017", postgresql: "5432", mariadb: "3306" };
        await page.locator("#db-host").fill("localhost");
        await page.locator("#db-port").fill(ports[dbType as keyof typeof ports]);
        await page.locator("#db-name").fill(`sveltycms_e2e_${dbType}`);
        await page.locator("#db-user").fill("test");
        await page.locator("#db-password").fill("test");
      }

      // Test Connection
      await page.getByRole("button", { name: /test database connection/i }).first().click({ force: true });
      
      // Handle "Create DB" or "Overwrite" modals
      const modalConfirm = page.locator("button").filter({ hasText: /yes|overwrite/i }).first();
      if (await modalConfirm.isVisible({ timeout: 10000 }).catch(() => false)) {
        await modalConfirm.click({ force: true });
      }

      await next(page);

      // --- STEP 2: ADMIN ---
      console.log(`[${dbType}] Creating admin user...`);
      
      // Test Validation: Password Mismatch
      await page.locator("#admin-username").fill("admin");
      await page.locator("#admin-email").fill("admin@test.com");
      await page.locator("#admin-password").fill("Password123!");
      await page.locator("#admin-confirm-password").fill("Wrong123!");
      await expect(page.getByText(/passwords do not match/i)).toBeVisible();
      await expect(page.getByLabel("Next", { exact: true }).first()).toBeDisabled();

      // Fix password
      await page.locator("#admin-confirm-password").fill("Password123!");
      await next(page);

      // --- STEP 3: SYSTEM ---
      console.log(`[${dbType}] Configuring system...`);
      await page.locator("#site-name").fill(`SveltyCMS ${dbType.toUpperCase()}`);
      await page.locator("#media-folder").fill(`./mediaFolder_${dbType}`);
      await next(page);

      // --- STEP 4: EMAIL (Skip) ---
      console.log(`[${dbType}] Skipping email...`);
      await next(page);

      // --- STEP 5: COMPLETE ---
      console.log(`[${dbType}] Finalizing...`);
      const completeBtn = page.getByLabel("Complete", { exact: true }).first();
      await completeBtn.click();

      // Verify redirection to dashboard or collection builder
      await page.waitForURL((url) => !url.pathname.startsWith("/setup"), { timeout: 60000 });
      await expect(page).not.toHaveURL(/\/setup/);
      
      console.log(`✅ ${dbType.toUpperCase()} Wizard flow completed.`);
    });
  }

  test("Wizard Navigation: Stepper & Breadcrumbs", async ({ page }) => {
    await hardReset(page);
    await page.goto("/setup");

    // Click "Get Started"
    await page.getByRole("button", { name: /get started/i }).first().click({ force: true });

    // Verify Stepper labels
    await expect(page.getByText("Step 1")).toBeVisible();
    await expect(page.getByText("Database Configuration")).toBeVisible();

    // Fill Step 1 to move to Step 2
    await page.locator("#db-type").selectOption("sqlite");
    await page.getByRole("button", { name: /test database connection/i }).first().click({ force: true });
    const modalConfirm = page.locator("button").filter({ hasText: /yes/i }).first();
    if (await modalConfirm.isVisible({ timeout: 5000 }).catch(() => false)) await modalConfirm.click({ force: true });
    await next(page);

    // Verify we are on Step 2
    await expect(page.getByText("Step 2")).toBeVisible();
    await expect(page.getByText("Administrator Account")).toBeVisible();

    // Use Stepper to go BACK to Step 1
    // Assuming labels in the sidebar are clickable link items
    await page.getByText("Database", { exact: true }).first().click();
    await expect(page.getByText("Step 1")).toBeVisible();
  });

  test("Wizard: Reset Data Logic", async ({ page }) => {
    await page.goto("/setup");
    
    // Fill something
    await page.locator("#db-host").fill("DIRTY_STATE");
    
    // Click Reset
    const resetBtn = page.getByRole("button", { name: /reset data/i }).first();
    await resetBtn.click();
    await page.locator("button").filter({ hasText: /yes/i }).first().click({ force: true });
    
    await page.waitForTimeout(2000);
    // Verify field is cleared
    const hostVal = await page.locator("#db-host").inputValue();
    expect(hostVal).not.toBe("DIRTY_STATE");
  });

});
