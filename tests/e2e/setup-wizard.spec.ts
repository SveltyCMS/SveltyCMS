/**
 * @file tests/e2e/setup-wizard.spec.ts
 * @description Comprehensive E2E test suite for the SveltyCMS Setup Wizard.
 * Combines full provisioning flow (all DB types), error handling, and navigation tests.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";
import { handleDialog } from "./helpers/setup-wizard";

// --- ROBUST UI HELPERS ---

async function firstVisible(candidates: Locator[], timeout = 1500): Promise<Locator | null> {
  for (const candidate of candidates) {
    if (await candidate.isVisible({ timeout }).catch(() => false)) {
      return candidate;
    }
  }
  return null;
}

async function hardReset(page: Page) {
  await page.goto("/setup");
  const resetBtn = page.getByRole("button", { name: /reset data/i }).first();
  if (await resetBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await resetBtn.click({ force: true });
    const confirmBtn = page.locator("button").filter({ hasText: /yes/i }).first();
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click({ force: true });
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(1000);
    }
  }
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
    page
      .locator("button, [role='button'], a")
      .filter({ hasText: /get started|start|continue/i })
      .first(),
    page
      .locator("[aria-label*='Get Started' i], [aria-label*='Start' i], [aria-label*='Continue' i]")
      .first(),
  ]);

  if (button) {
    await button.click({ force: true });
    await expect(welcomePopup)
      .toBeHidden({ timeout: 10000 })
      .catch(() => {});
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

  await expect(welcomePopup)
    .toBeHidden({ timeout: 10000 })
    .catch(() => {});
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

  if (await yesButton.isVisible({ timeout: 10000 }).catch(() => false)) {
    await yesButton.click({ force: true });
  }
}

async function submitDatabaseTest(page: Page) {
  const dbForm = page
    .locator("form")
    .filter({ has: page.locator("#db-type") })
    .first();

  const testButton = await firstVisible([
    page.getByRole("button", { name: /test database connection/i }).first(),
    page.getByRole("button", { name: /test connection/i }).first(),
    page
      .locator("button[type='submit']")
      .filter({ hasText: /test|connection/i })
      .first(),
    dbForm
      .locator("button")
      .filter({ hasText: /test|connection/i })
      .first(),
  ]);

  if (testButton) {
    await expect(testButton).toBeEnabled({ timeout: 30000 });
    await testButton.click({ force: true });
  } else {
    // Fallback
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
    page
      .locator("button")
      .filter({ hasText: /complete|finish/i })
      .first(),
  ]);

  if (!finishButton) throw new Error("Could not find Complete/Finish button.");
  await expect(finishButton).toBeEnabled({ timeout: 30000 });
  await finishButton.click({ force: true });
}

// --- TEST SUITES ---

test.describe("Setup Wizard: Error Handling", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.sessionStorage.setItem("sveltycms_welcome_modal_shown", "true");
    });
  });

  test("should show error on bad database connection", async ({ page }) => {
    await hardReset(page);
    await page.goto("/setup");
    await dismissWelcomeModal(page);
    await dismissCookies(page);

    await expect(page).toHaveURL(/\/setup/);
    await page.locator("#db-type").selectOption("mariadb");
    await page.locator("#db-host").fill("non-existent-host");
    await page.locator("#db-name").fill("svelty_test");
    await page.locator("#db-user").fill("wrong_user");
    await page.locator("#db-password").fill("wrong_password");

    const testDbButton = page.locator("button", { hasText: /test database/i }).first();
    await testDbButton.click({ force: true });

    await expect(page.getByText(/connection failed|getaddrinfo ENOTFOUND/i).first()).toBeVisible({
      timeout: 15_000,
    });
    const nextBtn = await nextButton(page);
    await expect(nextBtn).toBeDisabled();
  });

  test.skip("should show error on non-empty database", async ({ page }) => {
    await hardReset(page);
    await page.goto("/setup");
    await dismissWelcomeModal(page);
    await dismissCookies(page);

    await page.locator("#db-type").selectOption("sqlite");
    // SQLite adapter uses config/database/populated_db.sqlite
    await page.locator("#db-name").fill("populated_db");

    const testDbButton = page.locator("button", { hasText: /test database connection/i }).first();
    await testDbButton.click({ force: true });

    const confirmBtn = page.locator("button").filter({ hasText: /yes/i }).first();
    await expect(confirmBtn).toBeVisible({ timeout: 10000 });
    await confirmBtn.click({ force: true });

    await expect(page.getByText(/database is not empty/i).first()).toBeVisible();
  });

  test("should show error on admin user password mismatch", async ({ page }) => {
    await hardReset(page);
    await page.goto("/setup");
    await dismissWelcomeModal(page);
    await dismissCookies(page);

    await page.locator("#db-type").selectOption("sqlite");
    await page.locator("#db-name").fill(`e2e_err_admin_${Date.now()}.db.sqlite`);
    await submitDatabaseTest(page);
    await clickNextAndWaitFor(page, "#admin-username", "Admin step");

    await expect(page.locator("h2", { hasText: /admin/i }).first()).toBeVisible();

    await page.locator("#admin-username").fill("admin");
    await page.locator("#admin-email").fill("admin@example.com");
    await page.locator("#admin-password").fill("Password123!");
    await page.locator("#admin-confirm-password").fill("Mismatch123!");
    await page.locator("#admin-username").focus();

    await expect(await nextButton(page)).toBeDisabled();
  });

  test("should show error on invalid SMTP configuration", async ({ page }) => {
    await hardReset(page);
    await page.goto("/setup");
    await dismissWelcomeModal(page);
    await dismissCookies(page);

    await page.locator("#db-type").selectOption("sqlite");
    await page.locator("#db-name").fill(`e2e_err_smtp_${Date.now()}.db.sqlite`);
    await submitDatabaseTest(page);
    await clickNextAndWaitFor(page, "#admin-username", "Admin step");

    await page.locator("#admin-username").fill("admin");
    await page.locator("#admin-email").fill("admin@example.com");
    await page.locator("#admin-password").fill("Password123!");
    await page.locator("#admin-confirm-password").fill("Password123!");

    await clickNextAndWaitFor(page, "#site-name", "System Settings step");
    await page.locator("#site-name").fill("Test Site");
    await page.locator("#media-folder").fill("./mediaFolder");
    await clickNextAndWaitFor(page, "h2:has-text('Email')", "Email step");

    await expect(page.locator("h2", { hasText: /email/i }).first()).toBeVisible();

    await page.locator('input[type="text"]').first().fill("smtp.invalid.invalid");
    await page.locator('input[autocomplete="username"]').fill("admin");
    await page.locator('input[autocomplete="current-password"]').fill("Password123!");

    const testEmailButton = page.locator("button[type='submit']").first();
    await testEmailButton.click({ force: true });

    await expect(page.getByText(/invalid smtp|enotfound/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});

test.describe("Setup Wizard: Navigation & State", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.sessionStorage.setItem("sveltycms_welcome_modal_shown", "true");
    });
  });

  test("Wizard Navigation: Stepper & Breadcrumbs", async ({ page }) => {
    await hardReset(page);
    await page.goto("/setup");
    await dismissWelcomeModal(page);
    await dismissCookies(page);

    await expect(page.getByText("Step 1")).toBeVisible();
    await expect(page.getByText("Database Configuration")).toBeVisible();

    await page.locator("#db-type").selectOption("sqlite");
    await page.locator("#db-name").fill(`e2e_err_nav_${Date.now()}.db.sqlite`);
    await submitDatabaseTest(page);
    await clickNextAndWaitFor(page, "#admin-username", "Admin step");

    await expect(page.getByText("Step 2")).toBeVisible();
    await expect(page.getByText("Administrator Account")).toBeVisible();

    await page.getByText("Database", { exact: true }).first().click();
    await expect(page.getByText("Step 1")).toBeVisible();
  });

  test("Wizard: Reset Data Logic", async ({ page }) => {
    await hardReset(page);
    await page.goto("/setup");
    await dismissWelcomeModal(page);
    await dismissCookies(page);

    await page.locator("#db-host").fill("DIRTY_STATE");

    const resetBtn = page.getByRole("button", { name: /reset data/i }).first();
    await resetBtn.click();
    await page.locator("button").filter({ hasText: /yes/i }).first().click({ force: true });

    await page.waitForTimeout(2000);
    const hostVal = await page.locator("#db-host").inputValue();
    expect(hostVal).not.toBe("DIRTY_STATE");
  });
});

test.describe("Setup Wizard: Full Provisioning Flow", () => {
  const DB_TYPES = ["sqlite", "mongodb", "postgresql", "mariadb"] as const;

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.sessionStorage.setItem("sveltycms_welcome_modal_shown", "true");
    });
  });

  for (const dbType of DB_TYPES) {
    test(`Wizard Flow: ${dbType.toUpperCase()}`, async ({ page }) => {
      test.setTimeout(240_000);

      await hardReset(page);
      await page.goto("/setup");
      await dismissWelcomeModal(page);
      await dismissCookies(page);

      console.log(`[${dbType}] Configuring database...`);
      await page.locator("#db-type").selectOption(dbType);

      if (dbType === "sqlite") {
        await page.locator("#db-name").fill(`e2e_wizard_${dbType}_${Date.now()}.db.sqlite`);
      } else {
        const ports = { mongodb: "27017", postgresql: "5432", mariadb: "3306" };
        await page.locator("#db-host").fill("localhost");
        await page.locator("#db-port").fill(ports[dbType as keyof typeof ports]);
        await page.locator("#db-name").fill(`sveltycms_e2e_${dbType}`);
        await page.locator("#db-user").fill("test");
        await page.locator("#db-password").fill("test");
      }

      await submitDatabaseTest(page);
      await clickNextAndWaitFor(page, "#admin-username", "Admin step");

      console.log(`[${dbType}] Creating admin user...`);
      await page.locator("#admin-username").fill("admin");
      await page.locator("#admin-email").fill("admin@test.com");
      await page.locator("#admin-password").fill("Password123!");
      await page.locator("#admin-confirm-password").fill("Wrong123!");
      await expect(await nextButton(page)).toBeDisabled();

      await page.locator("#admin-confirm-password").fill("Password123!");
      await clickNextAndWaitFor(page, "#site-name", "System Settings step");

      console.log(`[${dbType}] Configuring system...`);
      await page.locator("#site-name").fill(`SveltyCMS ${dbType.toUpperCase()}`);
      await page.locator("#media-folder").fill(`./mediaFolder_${dbType}`);
      await clickNextAndWaitFor(page, "h2:has-text('Email')", "Email step");

      console.log(`[${dbType}] Skipping email...`);
      await clickNextAndWaitFor(page, "h2:has-text('Review')", "Review step");

      console.log(`[${dbType}] Finalizing...`);
      await clickFinish(page);

      await page.waitForURL((url) => !url.pathname.startsWith("/setup"), { timeout: 90000 });
      await expect(page).not.toHaveURL(/\/setup/);

      console.log(`✅ ${dbType.toUpperCase()} Wizard flow completed.`);
    });
  }
});
