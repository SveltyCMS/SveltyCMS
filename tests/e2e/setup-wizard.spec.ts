/**
 * @file tests\e2e\setup-wizard.spec.ts
 * @description Tests the setup wizard for the SveltyCMS application.
 */

import { expect, test } from "@playwright/test";
import { seedWizardState, clickNext, clickFinish, handleDialog } from "./helpers/setup-wizard";

test("Setup Wizard: Full Provisioning Flow", async ({ page }) => {
  test.setTimeout(180_000);

  // 1. Pre-seed state to stabilize flakiness
  await seedWizardState(page);

  // 2. Visit setup page
  console.log("🚀 Starting Setup Wizard...");
  await page.goto("/setup");
  await page.waitForLoadState("networkidle");

  // 3. Handle Welcome Popup
  const welcomePopup = page.locator("#welcome-heading").first();
  if (await welcomePopup.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log("   → Welcome popup detected. Clicking Get Started...");
    await page
      .getByRole("button", { name: /get started/i })
      .first()
      .click({ force: true });
    await expect(welcomePopup).toBeHidden();
  }

  // 4. Handle Cookie Consent
  const cookieBtn = page.getByRole("button", { name: /accept all/i }).first();
  if (await cookieBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log("   → Dismissing cookie banner...");
    await cookieBtn.click();
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
  await handleDialog(page, /database does not exist/i, "yes");

  // Move to next step
  await clickNext(page);

  // --- STEP 2: Admin User ---
  console.log("   → Step 2: Admin User Configuration...");
  await expect(page.locator("h2", { hasText: /admin/i }).first()).toBeVisible();

  await page.locator("#admin-username").fill("admin");
  await page.locator("#admin-email").fill("admin@e2e.test");
  await page.locator("#admin-password").fill("Password123!");
  await page.locator("#admin-confirm-password").fill("Password123!");

  await clickNext(page);

  // --- STEP 3: System Settings ---
  console.log("   → Step 3: System Settings...");
  await expect(page.locator("h2", { hasText: /system/i }).first()).toBeVisible();

  await page.locator("#site-name").fill("E2E Test Site");
  await page.locator("#host-prod").fill(new URL(page.url()).origin);
  await page.locator("#media-folder").fill("./mediaFolder_e2e");

  await clickNext(page);

  // --- STEP 4: Mail/SMTP (Skip) ---
  console.log("   → Step 4: Mail Configuration (Skipping)...");
  await clickNext(page);

  // --- STEP 5: Review ---
  console.log("   → Step 5: Review...");
  await clickFinish(page);

  // Final Redirection
  console.log("   → Finalizing setup...");
  await page.waitForURL((url) => !url.pathname.startsWith("/setup"), { timeout: 60000 });

  console.log("✅ Setup Wizard E2E Passed!");
});
