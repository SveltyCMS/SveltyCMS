/**
 * @file tests/e2e/setup-wizard.spec.ts
 * @description Comprehensive Setup Wizard E2E test for SveltyCMS.
 * Covers all 5 steps of the installation process including DB, Admin, System, and Review.
 */

import { expect, test, type Page } from "@playwright/test";

// Helper to handle transitions
async function stepSettled(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
}

test("Setup Wizard: Full Provisioning Flow", async ({ page }) => {
  test.setTimeout(180_000);

  // 1. Visit setup page
  console.log("🚀 Starting Setup Wizard...");
  await page.goto("/setup");
  await stepSettled(page);

  // 2. Handle Welcome Popup
  const welcomePopup = page.locator("#welcome-heading").first();
  if (await welcomePopup.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log("   → Welcome popup detected. Clicking Get Started...");
    await page.getByRole("button", { name: /get started/i }).first().click({ force: true });
    await expect(welcomePopup).toBeHidden();
  }

  // 3. Handle Cookie Consent
  const cookieBtn = page.getByRole("button", { name: /accept all/i }).first();
  if (await cookieBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log("   → Dismissing cookie banner...");
    await cookieBtn.click();
  }

  // 4. Handle "Reset Data" if present (prevents dirty state failure)
  const resetBtn = page.getByRole("button", { name: /reset data/i }).first();
  if (await resetBtn.isVisible()) {
    console.log("   → Existing data detected. Resetting...");
    await resetBtn.click();
    // Confirm Reset
    const confirmBtn = page.locator("button").filter({ hasText: /yes/i }).first();
    await confirmBtn.click({ force: true });
    await stepSettled(page);
  }

  // --- STEP 1: Database ---
  console.log("   → Step 1: Database Configuration...");
  await expect(page.locator("h2", { hasText: /database/i }).first()).toBeVisible();

  // Standard SQLite for E2E
  await page.locator("#db-type").selectOption("sqlite");
  await page.locator("#db-host").fill("config/database");
  await page.locator("#db-name").fill("e2e_setup_test.db");

  // Click Test Connection
  const testConnBtn = page.getByRole("button", { name: /test database connection/i }).first();
  await testConnBtn.click({ force: true });

  // Handle "Database does not exist" modal
  const createDbBtn = page.locator("button").filter({ hasText: /yes/i }).first();
  if (await createDbBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
    await createDbBtn.click({ force: true });
  }

  // Wait for success indicator (Next button enabled)
  const nextBtn = page.getByLabel("Next", { exact: true }).first();
  await expect(nextBtn).toBeEnabled({ timeout: 30000 });
  await nextBtn.click({ force: true });
  await stepSettled(page);

  // --- STEP 2: Admin User ---
  console.log("   → Step 2: Admin User Configuration...");
  await expect(page.locator("h2", { hasText: /admin/i }).first()).toBeVisible();

  await page.locator("#admin-username").fill("admin");
  await page.locator("#admin-email").fill("admin@e2e.test");
  await page.locator("#admin-password").fill("Password123!");
  await page.locator("#admin-confirm-password").fill("Password123!");

  await page.getByLabel("Next", { exact: true }).first().click({ force: true });
  await stepSettled(page);

  // --- STEP 3: System Settings ---
  console.log("   → Step 3: System Settings...");
  await expect(page.locator("h2", { hasText: /system/i }).first()).toBeVisible();

  await page.locator("#site-name").fill("E2E Test Site");
  await page.locator("#host-prod").fill(new URL(page.url()).origin);
  await page.locator("#media-folder").fill("./mediaFolder_e2e");

  await page.getByLabel("Next", { exact: true }).first().click({ force: true });
  await stepSettled(page);

  // --- STEP 4: Mail/SMTP (Skip) ---
  console.log("   → Step 4: Mail Configuration (Skipping)...");
  await page.getByLabel("Next", { exact: true }).first().click({ force: true });
  await stepSettled(page);

  // --- STEP 5: Review ---
  console.log("   → Step 5: Review...");
  const finishBtn = page.getByLabel("Complete", { exact: true }).first();
  await expect(finishBtn).toBeVisible();
  await finishBtn.click();

  // Final Redirection
  console.log("   → Finalizing setup...");
  await page.waitForURL((url) => !url.pathname.startsWith("/setup"), { timeout: 60000 });
  
  console.log("✅ Setup Wizard E2E Passed!");
});
