/**
 * @file tests/e2e/setup-wizard.spec.ts
 * @description Tests the setup wizard for the SveltyCMS application.
 */

import { expect, test, type Page } from "@playwright/test";
import { clickNext, clickFinish, handleDialog } from "./helpers/setup-wizard";

async function dismissWelcomeModal(page: Page) {
  const welcomePopup = page.locator("#welcome-heading").first();

  if (!(await welcomePopup.isVisible({ timeout: 5000 }).catch(() => false))) {
    return;
  }

  console.log("   → Welcome popup detected. Dismissing...");

  const candidates = [
    page.getByRole("button", { name: /get started/i }).first(),
    page.getByRole("button", { name: /start/i }).first(),
    page.getByRole("button", { name: /continue/i }).first(),
    page.locator("button, [role='button'], a").filter({ hasText: /get started|start|continue/i }).first(),
    page.locator("[aria-label*='Get Started' i], [aria-label*='Start' i], [aria-label*='Continue' i]").first(),
  ];

  for (const candidate of candidates) {
    if (await candidate.isVisible({ timeout: 1500 }).catch(() => false)) {
      await candidate.click({ force: true });
      await expect(welcomePopup).toBeHidden({ timeout: 10000 }).catch(() => { });
      return;
    }
  }

  // Last-resort DOM click for CI where Skeleton/Dialog buttons may not expose role/name correctly.
  const clicked = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll("button, [role='button'], a"));
    const target = elements.find((el) => /get started|start|continue/i.test(el.textContent || ""));
    if (target instanceof HTMLElement) {
      target.click();
      return true;
    }
    return false;
  });

  if (!clicked) {
    await page.keyboard.press("Escape").catch(() => { });
  }

  await expect(welcomePopup).toBeHidden({ timeout: 10000 }).catch(() => { });
}

async function dismissCookies(page: Page) {
  const cookieBtn = page.getByRole("button", { name: /accept all/i }).first();

  if (await cookieBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log("   → Dismissing cookie banner...");
    await cookieBtn.click({ force: true });
  }
}

async function handleAnyDbDialog(page: Page) {
  await handleDialog(page, /database does not exist/i, "yes").catch(() => { });
  await handleDialog(page, /database is not empty/i, "yes").catch(() => { });
  await handleDialog(page, /not empty/i, "yes").catch(() => { });
  await handleDialog(page, /overwrite/i, "yes").catch(() => { });
  await handleDialog(page, /create/i, "yes").catch(() => { });

  const yesButton = page
    .locator("button, [role='button']")
    .filter({ hasText: /^(yes|create|continue|overwrite|confirm)$/i })
    .first();

  if (await yesButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await yesButton.click({ force: true });
  }
}

test("Setup Wizard: Full Provisioning Flow", async ({ page }) => {
  test.setTimeout(240_000);

  console.log("🚀 Starting Setup Wizard...");

  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  await page.goto("/setup");
  await page.waitForLoadState("domcontentloaded");

  await dismissWelcomeModal(page);
  await dismissCookies(page);

  // --- STEP 1: Database ---
  console.log("   → Step 1: Database Configuration...");

  await expect(page.locator("h2", { hasText: /database/i }).first()).toBeVisible({
    timeout: 30000,
  });

  const uniqueDbName = `e2e_setup_${Date.now()}.db.sqlite`;

  await page.locator("#db-type").selectOption("sqlite");
  await page.locator("#db-host").fill("config/database");
  await page.locator("#db-name").fill(uniqueDbName);

  const testConnBtn = page.getByRole("button", { name: /test database connection/i }).first();

  await expect(testConnBtn).toBeVisible({ timeout: 30000 });
  await expect(testConnBtn).toBeEnabled({ timeout: 30000 });

  await testConnBtn.click({ force: true });
  await handleAnyDbDialog(page);

  const nextBtn = page.getByLabel("Next", { exact: true }).first();

  await expect(nextBtn).toBeVisible({ timeout: 30000 });
  await expect(nextBtn).toBeEnabled({ timeout: 120000 });

  await nextBtn.click({ force: true });
  await page.waitForLoadState("networkidle").catch(() => { });

  // --- STEP 2: Admin User ---
  console.log("   → Step 2: Admin User Configuration...");

  await expect(page.locator("h2", { hasText: /admin/i }).first()).toBeVisible({
    timeout: 30000,
  });

  await page.locator("#admin-username").fill("admin");
  await page.locator("#admin-email").fill("admin@e2e.test");
  await page.locator("#admin-password").fill("Password123!");
  await page.locator("#admin-confirm-password").fill("Password123!");

  await clickNext(page);

  // --- STEP 3: System Settings ---
  console.log("   → Step 3: System Settings...");

  await expect(page.locator("h2", { hasText: /system/i }).first()).toBeVisible({
    timeout: 30000,
  });

  await page.locator("#site-name").fill("E2E Test Site");
  await page.locator("#host-prod").fill(new URL(page.url()).origin);
  await page.locator("#media-folder").fill("./mediaFolder_e2e");

  await clickNext(page);

  // --- STEP 4: Mail/SMTP ---
  console.log("   → Step 4: Mail Configuration...");
  await clickNext(page);

  // --- STEP 5: Review ---
  console.log("   → Step 5: Review...");
  await clickFinish(page);

  console.log("   → Finalizing setup...");

  await page.waitForURL((url) => !url.pathname.startsWith("/setup"), {
    timeout: 90000,
  });

  console.log("✅ Setup Wizard E2E Passed!");
});