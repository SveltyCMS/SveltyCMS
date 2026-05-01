/**
 * @file tests/e2e/setup-wizard.spec.ts
 * @description Stable smoke test for the SveltyCMS setup wizard.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";
import { handleDialog } from "./helpers/setup-wizard";

async function firstVisible(candidates: Locator[], timeout = 1500): Promise<Locator | null> {
  for (const candidate of candidates) {
    if (await candidate.isVisible({ timeout }).catch(() => false)) {
      return candidate;
    }
  }

  return null;
}

async function dismissWelcomeModal(page: Page) {
  const welcomePopup = page.locator("#welcome-heading").first();

  if (!(await welcomePopup.isVisible({ timeout: 3000 }).catch(() => false))) {
    return;
  }

  console.log("   → Welcome popup detected. Dismissing...");

  const button = await firstVisible([
    page.getByRole("button", { name: /get started/i }).first(),
    page.getByRole("button", { name: /start/i }).first(),
    page.getByRole("button", { name: /continue/i }).first(),
    page.locator("button, [role='button'], a").filter({ hasText: /get started|start|continue/i }).first(),
    page.locator("[aria-label*='Get Started' i], [aria-label*='Start' i], [aria-label*='Continue' i]").first(),
  ]);

  if (button) {
    await button.click({ force: true });
    await expect(welcomePopup).toBeHidden({ timeout: 10000 }).catch(() => {});
    return;
  }

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
    await page.keyboard.press("Escape").catch(() => {});
  }

  await expect(welcomePopup).toBeHidden({ timeout: 10000 }).catch(() => {});
}

async function dismissCookies(page: Page) {
  const cookieBtn = page.getByRole("button", { name: /accept all/i }).first();

  if (await cookieBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log("   → Dismissing cookie banner...");
    await cookieBtn.click({ force: true });
  }
}

async function handleAnyDbDialog(page: Page) {
  await handleDialog(page, /database does not exist/i, "yes").catch(() => {});
  await handleDialog(page, /database is not empty/i, "yes").catch(() => {});
  await handleDialog(page, /not empty/i, "yes").catch(() => {});
  await handleDialog(page, /overwrite/i, "yes").catch(() => {});
  await handleDialog(page, /create/i, "yes").catch(() => {});

  const yesButton = page
    .locator("button, [role='button']")
    .filter({ hasText: /^(yes|create|continue|overwrite|confirm)$/i })
    .first();

  if (await yesButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await yesButton.click({ force: true });
  }
}

async function submitDatabaseTest(page: Page) {
  const dbForm = page.locator("form").filter({ has: page.locator("#db-type") }).first();

  const testButton = await firstVisible([
    page.getByRole("button", { name: /test database connection/i }).first(),
    page.getByRole("button", { name: /test connection/i }).first(),
    page.locator("button[type='submit']").filter({ hasText: /test|connection/i }).first(),
    dbForm.locator("button").filter({ hasText: /test|connection/i }).first(),
  ]);

  if (testButton) {
    await expect(testButton).toBeEnabled({ timeout: 30000 });
    await testButton.click({ force: true });
  } else {
    // Fallback: submit the DB form directly if the button label/role changes in CI.
    await dbForm.evaluate((form) => {
      if (form instanceof HTMLFormElement) {
        form.requestSubmit();
      }
    });
  }

  await handleAnyDbDialog(page);
}

async function nextButton(page: Page) {
  return page.getByLabel("Next", { exact: true }).first();
}

async function clickNext(page: Page) {
  const nextBtn = await nextButton(page);

  await expect(nextBtn).toBeVisible({ timeout: 30000 });
  await expect(nextBtn).toBeEnabled({ timeout: 120000 });

  await nextBtn.click({ force: true });
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function clickNextAndWaitFor(page: Page, selector: string, label: string) {
  const target = page.locator(selector).first();

  for (let attempt = 1; attempt <= 2; attempt++) {
    await clickNext(page);
    await handleAnyDbDialog(page);

    if (await target.isVisible({ timeout: 30000 }).catch(() => false)) {
      return;
    }

    console.log(`   → ${label} not visible after next click, retrying once...`);
    await page.waitForTimeout(1000);
  }

  await expect(target, `${label} should be visible`).toBeVisible({ timeout: 30000 });
}

async function clickFinish(page: Page) {
  const finishButton = await firstVisible([
    page.getByLabel("Complete", { exact: true }).first(),
    page.getByRole("button", { name: /complete/i }).first(),
    page.getByRole("button", { name: /finish/i }).first(),
    page.locator("button").filter({ hasText: /complete|finish/i }).first(),
  ]);

  if (!finishButton) {
    throw new Error("Could not find Complete/Finish button.");
  }

  await expect(finishButton).toBeEnabled({ timeout: 30000 });
  await finishButton.click({ force: true });
}

test("Setup Wizard: Full Provisioning Flow", async ({ page }) => {
  test.setTimeout(240_000);

  console.log("🚀 Starting Setup Wizard...");

  await page.addInitScript(() => {
    window.localStorage.clear();

    // Avoid the welcome modal in CI. The modal itself is not the focus of this smoke test.
    window.sessionStorage.clear();
    window.sessionStorage.setItem("sveltycms_welcome_modal_shown", "true");
  });

  await page.goto("/setup");
  await page.waitForLoadState("domcontentloaded");

  await dismissWelcomeModal(page);
  await dismissCookies(page);

  // --- STEP 1: Database ---
  console.log("   → Step 1: Database Configuration...");

  await expect(page.locator("#db-type").first()).toBeVisible({ timeout: 30000 });

  const uniqueDbName = `e2e_setup_${Date.now()}.db.sqlite`;

  await page.locator("#db-type").selectOption("sqlite");
  await page.locator("#db-host").fill("config/database");
  await page.locator("#db-name").fill(uniqueDbName);

  await submitDatabaseTest(page);

  await clickNextAndWaitFor(page, "#admin-username", "Admin user step");

  // --- STEP 2: Admin User ---
  console.log("   → Step 2: Admin User Configuration...");

  await page.locator("#admin-username").fill("admin");
  await page.locator("#admin-email").fill("admin@e2e.test");
  await page.locator("#admin-password").fill("Password123!");
  await page.locator("#admin-confirm-password").fill("Password123!");

  await clickNextAndWaitFor(page, "#site-name", "System settings step");

  // --- STEP 3: System Settings ---
  console.log("   → Step 3: System Settings...");

  await page.locator("#site-name").fill("E2E Test Site");
  await page.locator("#host-prod").fill(new URL(page.url()).origin);
  await page.locator("#media-folder").fill("./mediaFolder_e2e");

  // --- STEP 4: Mail/SMTP ---
  console.log("   → Step 4: Mail Configuration...");
  await clickNext(page);

  // --- STEP 5: Review ---
  console.log("   → Step 5: Review...");
  await clickNext(page);

  console.log("   → Finalizing setup...");
  await clickFinish(page);

  await page.waitForURL((url) => !url.pathname.startsWith("/setup"), {
    timeout: 90000,
  });

  console.log("✅ Setup Wizard E2E Passed!");
});