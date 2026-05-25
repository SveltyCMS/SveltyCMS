/**
 * @file tests/e2e/setup-wizard.spec.ts
 * @description Comprehensive E2E test suite for the SveltyCMS Setup Wizard.
 * Combines full provisioning flow (all DB types), error handling, and navigation tests.
 */
import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { handleDialog } from "./helpers/setup-wizard";

// --- PAGE OBJECT MODEL ---

class SetupWizardPage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto("/setup");
    // Wait for the body element to ensure general DOM content load, improving race condition robustness.
    await this.page.waitForSelector("body", { timeout: 60000 });
  }

  async hardReset() {
    await this.goto();
    const resetBtn = this.page.getByRole("button", { name: /reset data/i }).first();
    if (await resetBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await resetBtn.click();
      const confirmBtn = this.page.locator("button").filter({ hasText: /yes/i }).first();
      if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmBtn.click();
        await this.page.waitForLoadState("networkidle").catch(() => {});
      }
    }
  }

  async dismissModals() {
    // 1. Welcome Modal
    const welcomePopup = this.page.locator("#welcome-heading").first();
    if (await welcomePopup.isVisible({ timeout: 3000 }).catch(() => false)) {
      const button = await this.firstVisible([
        this.page.getByRole("button", { name: /get started/i }).first(),
        this.page.getByRole("button", { name: /start/i }).first(),
        this.page.getByRole("button", { name: /continue/i }).first(),
      ]);
      if (button) {
        await button.click();
        await expect(welcomePopup).toBeHidden({ timeout: 10000 });
      }
    }

    // 2. Cookie Banner
    const cookieBtn = this.page.getByRole("button", { name: /accept all/i }).first();
    if (await cookieBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cookieBtn.click();
    }
  }

  async next() {
    const nextBtn = this.page.getByLabel("Next", { exact: true }).first();
    await expect(nextBtn).toBeEnabled({ timeout: 60000 });
    await nextBtn.click();
    await this.page.waitForLoadState("networkidle").catch(() => {});
  }

  async complete() {
    const finishBtn = await this.firstVisible([
      this.page.getByLabel("Complete", { exact: true }).first(),
      this.page.getByRole("button", { name: /complete/i }).first(),
      this.page.getByRole("button", { name: /finish/i }).first(),
    ]);
    if (!finishBtn) throw new Error("Could not find Complete/Finish button.");
    await expect(finishBtn).toBeEnabled({ timeout: 30000 });
    await finishBtn.click();
  }

  async handleAnyDbDialog() {
    await handleDialog(
      this.page,
      /database (does not exist|is not empty|not empty|overwrite|create)/i,
      "yes",
    ).catch(() => {});

    const yesButton = this.page
      .locator("button, [role='button']")
      .filter({ hasText: /^(yes|create|continue|overwrite|confirm)$/i })
      .first();

    if (await yesButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await yesButton.click();
    }
  }

  async testConnection() {
    const testButton = await this.firstVisible([
      this.page.getByRole("button", { name: /test database connection/i }).first(),
      this.page.getByRole("button", { name: /test connection/i }).first(),
    ]);

    if (testButton) {
      await expect(testButton).toBeEnabled({ timeout: 30000 });
      await testButton.click();
    }
    await this.handleAnyDbDialog();
  }

  private async firstVisible(candidates: Locator[], timeout = 1500): Promise<Locator | null> {
    for (const candidate of candidates) {
      if (await candidate.isVisible({ timeout }).catch(() => false)) {
        return candidate;
      }
    }
    return null;
  }
}

// --- FIXTURE DEFINITION ---

type Fixtures = {
  wizard: SetupWizardPage;
};

const test = base.extend<Fixtures>({
  wizard: async ({ page }, use) => {
    const wizard = new SetupWizardPage(page);
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.sessionStorage.setItem("sveltycms_welcome_modal_shown", "true");
    });
    await use(wizard);
  },
});

// --- TEST SUITES ---

test.describe("Setup Wizard: Error Handling", () => {
  test("should show error on bad database connection", async ({ wizard, page }) => {
    await wizard.hardReset();
    await wizard.dismissModals();

    await expect(page).toHaveURL(/\/setup/);
    await page.locator("#db-type").selectOption("mariadb");
    await page.locator("#db-host").fill("non-existent-host");
    await page.locator("#db-name").fill("svelty_test");
    await page.locator("#db-user").fill("wrong_user");
    await page.locator("#db-password").fill("wrong_password");

    const testDbButton = page.locator("button", { hasText: /test database/i }).first();
    await testDbButton.click();

    await expect(page.getByText(/connection failed|getaddrinfo ENOTFOUND/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByLabel("Next", { exact: true }).first()).toBeDisabled();
  });

  test("should show error on admin user password mismatch", async ({ wizard, page }) => {
    await wizard.hardReset();
    await wizard.dismissModals();

    await page.locator("#db-type").selectOption("sqlite");
    await page.locator("#db-name").fill(`e2e_err_admin_${Date.now()}.db.sqlite`);
    await wizard.testConnection();
    await wizard.next();

    await expect(page.locator("h2", { hasText: /admin/i }).first()).toBeVisible();

    await page.locator("#admin-username").fill("admin");
    await page.locator("#admin-email").fill("admin@example.com");
    await page.locator("#admin-password").fill("Password123!");
    await page.locator("#admin-confirm-password").fill("Mismatch123!");
    await page.locator("#admin-username").focus();

    await expect(page.getByText(/passwords do not match/i).first()).toBeVisible();
    await expect(page.getByLabel("Next", { exact: true }).first()).toBeDisabled();
  });

  test("should show error on invalid SMTP configuration", async ({ wizard, page }) => {
    await wizard.hardReset();
    await wizard.dismissModals();

    await page.locator("#db-type").selectOption("sqlite");
    await page.locator("#db-name").fill(`e2e_err_smtp_${Date.now()}.db.sqlite`);
    await wizard.testConnection();
    await wizard.next();

    await page.locator("#admin-username").fill("admin");
    await page.locator("#admin-email").fill("admin@example.com");
    await page.locator("#admin-password").fill("Password123!");
    await page.locator("#admin-confirm-password").fill("Password123!");
    await wizard.next();

    await page.locator("#site-name").fill("Test Site");
    await page.locator("#media-folder").fill("./mediaFolder");
    await wizard.next();

    await expect(page.locator("h2", { hasText: /email/i }).first()).toBeVisible();

    await page.locator('input[type="text"]').first().fill("smtp.invalid.invalid");
    await page.locator('input[autocomplete="username"]').fill("admin");
    await page.locator('input[autocomplete="current-password"]').fill("Password123!");

    const testEmailButton = page.locator("button[type='submit']").first();
    await testEmailButton.click();

    await expect(page.getByText(/invalid smtp|enotfound/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});

test.describe("Setup Wizard: Navigation & State", () => {
  test("Wizard Navigation: Stepper & Breadcrumbs", async ({ wizard, page }) => {
    await wizard.hardReset();
    await wizard.dismissModals();

    await expect(page.getByText("Step 1")).toBeVisible();
    await expect(page.getByText("Database Configuration")).toBeVisible();

    await page.locator("#db-type").selectOption("sqlite");
    await page.locator("#db-name").fill(`e2e_err_nav_${Date.now()}.db.sqlite`);
    await wizard.testConnection();
    await wizard.next();

    await expect(page.getByText("Step 2")).toBeVisible();
    await expect(page.getByText("Administrator Account")).toBeVisible();

    await page.getByText("Database", { exact: true }).first().click();
    await expect(page.getByText("Step 1")).toBeVisible();
  });

  test("Wizard: Reset Data Logic", async ({ wizard, page }) => {
    await wizard.hardReset();
    await wizard.dismissModals();

    await page.locator("#db-host").fill("DIRTY_STATE");

    const resetBtn = page.getByRole("button", { name: /reset data/i }).first();
    await resetBtn.click();
    await page.locator("button").filter({ hasText: /yes/i }).first().click();

    await expect(page.locator("#db-host")).not.toHaveValue("DIRTY_STATE", {
      timeout: 10000,
    });
  });
});

test.describe("Setup Wizard: Full Provisioning Flow", () => {
  const DB_TYPES = ["sqlite", "mongodb", "postgresql", "mariadb"] as const;

  for (const dbType of DB_TYPES) {
    test(`Wizard Flow: ${dbType.toUpperCase()}`, async ({ wizard, page }) => {
      test.setTimeout(240_000);

      await test.step("Step 0: Clean Reset", async () => {
        await wizard.hardReset();
        await wizard.dismissModals();
      });

      await test.step("Step 1: Database Configuration", async () => {
        console.log(`[${dbType}] Configuring database...`);
        await page.locator("#db-type").selectOption(dbType);

        if (dbType === "sqlite") {
          await page.locator("#db-name").fill(`e2e_wizard_${dbType}_${Date.now()}.db.sqlite`);
        } else {
          const ports = {
            mongodb: "27017",
            postgresql: "5432",
            mariadb: "3306",
          };
          await page.locator("#db-host").fill("localhost");
          await page.locator("#db-port").fill(ports[dbType as keyof typeof ports]);
          await page.locator("#db-name").fill(`sveltycms_e2e_${dbType}`);
          await page.locator("#db-user").fill("test");
          await page.locator("#db-password").fill("test");
        }

        await wizard.testConnection();
        await wizard.next();
      });

      await test.step("Step 2: Administrator Account", async () => {
        console.log(`[${dbType}] Creating admin user...`);
        await page.locator("#admin-username").fill("admin");
        await page.locator("#admin-email").fill("admin@test.com");
        await page.locator("#admin-password").fill("Password123!");
        await page.locator("#admin-confirm-password").fill("Wrong123!");
        await expect(page.getByText(/passwords do not match/i).first()).toBeVisible();
        await expect(page.getByLabel("Next", { exact: true }).first()).toBeDisabled();

        await page.locator("#admin-confirm-password").fill("Password123!");
        await wizard.next();
      });

      await test.step("Step 3: System Settings", async () => {
        console.log(`[${dbType}] Configuring system...`);
        await page.locator("#site-name").fill(`SveltyCMS ${dbType.toUpperCase()}`);
        await page.locator("#media-folder").fill(`./mediaFolder_${dbType}`);
        await wizard.next();
      });

      await test.step("Step 4: Email Configuration (Skip)", async () => {
        console.log(`[${dbType}] Skipping email...`);
        await wizard.next();
      });

      await test.step("Step 5: Review & Finalize", async () => {
        console.log(`[${dbType}] Finalizing...`);
        await wizard.complete();
        await page.waitForURL((url) => !url.pathname.startsWith("/setup"), {
          timeout: 90000,
        });
        await expect(page).not.toHaveURL(/\/setup/);
      });

      console.log(`✅ ${dbType.toUpperCase()} Wizard flow completed.`);
    });
  }
});
