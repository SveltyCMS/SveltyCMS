import { expect, test } from "@playwright/test";
import { clickNext, clickFinish, handleDialog } from "./helpers/setup-wizard";

async function dismissWelcomeAndCookies(page: any) {
  const welcomePopup = page.locator("#welcome-heading").first();

  if (await welcomePopup.isVisible({ timeout: 5000 }).catch(() => false)) {
    const getStartedButton = page
      .locator("button, [role='button'], a")
      .filter({ hasText: /get started/i })
      .first();

    await expect(getStartedButton).toBeVisible({ timeout: 10000 });
    await getStartedButton.click({ force: true });
    await expect(welcomePopup).toBeHidden({ timeout: 10000 }).catch(() => {});
  }

  const cookieBtn = page.getByRole("button", { name: /accept all/i }).first();

  if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log("   → Dismissing cookie banner...");
    await cookieBtn.click({ force: true });
  }
}

async function handleAnyDbDialog(page: any) {
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

test("Setup Wizard: Full Provisioning Flow", async ({ page }) => {
  test.setTimeout(240_000);

  console.log("🚀 Starting Setup Wizard...");

  await page.goto("/setup");
  await page.waitForLoadState("domcontentloaded");
  await dismissWelcomeAndCookies(page);

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

  await page
    .waitForFunction(
      () => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const next = buttons.find(
          (btn) =>
            btn.getAttribute("aria-label") === "Next" ||
            btn.textContent?.trim().toLowerCase() === "next",
        );

        return !!next && !next.hasAttribute("disabled") && next.getAttribute("aria-disabled") !== "true";
      },
      undefined,
      { timeout: 120000 },
    )
    .catch(async () => {
      await handleAnyDbDialog(page);
    });

  const nextBtn = page.getByLabel("Next", { exact: true }).first();

  await expect(nextBtn).toBeVisible({ timeout: 30000 });
  await expect(nextBtn).toBeEnabled({ timeout: 120000 });

  await nextBtn.click({ force: true });
  await page.waitForLoadState("networkidle").catch(() => {});

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