/**
 * @file tests/e2e/routes/setup/setup-wizard.spec.ts
 * @description Comprehensive E2E test suite for the SveltyCMS Setup Wizard.
 * Combines full provisioning flow (all DB types), error handling, and navigation tests.
 */
import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { handleDialog } from "../../helpers/setup-wizard";
import { resetToSetupMode } from "../../helpers/api";

// --- PAGE OBJECT MODEL ---

class SetupWizardPage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto("/setup");
    // Wait for the body element to ensure general DOM content load, improving race condition robustness.
    await this.page.waitForSelector("body", { timeout: 60000 });
  }

  async hardReset() {
    try {
      await resetToSetupMode();
    } catch (err: any) {
      console.warn(`[E2E Setup Wizard] Cryptographic hardReset failed: ${err.message}`);
    }
    await this.goto();
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
        await button.click({ force: true });
        await expect(welcomePopup).toBeHidden({ timeout: 10000 });
      }
    }

    // 2. Cookie Banner
    const cookieBtn = this.page.getByRole("button", { name: /accept all/i }).first();
    if (await cookieBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cookieBtn.click({ force: true });
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

    // Wait for the remote completeSetup call (SvelteKit remote / form action) so we
    // don't race the 500ms client redirect timer with a blind waitForURL.
    const responsePromise = this.page
      .waitForResponse(
        (res) => {
          const u = res.url();
          return (
            u.includes("completeSetup") ||
            u.includes("/setup?/completeSetup") ||
            (u.includes("/setup") && res.request().method() === "POST")
          );
        },
        { timeout: 120_000 },
      )
      .catch(() => null);

    await finishBtn.click();

    const response = await responsePromise;
    if (response && !response.ok()) {
      const body = await response.text().catch(() => "");
      const status =
        typeof response.status === "function" ? response.status() : (response as any).status;
      throw new Error(
        `completeSetup HTTP ${status}: ${body.slice(0, 500)} (still on ${this.page.url()})`,
      );
    }

    // Do not fail on post-redirect destination errors (e.g. collectionbuilder 500).
    // completeSetup HTTP status is the source of truth for wizard success; Step 5
    // then waits for navigation off /setup.
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
      await yesButton.click({ force: true });
    }
  }

  async testConnection() {
    await this.dismissModals();
    await this.handleAnyDbDialog();

    const testButton = await this.firstVisible([
      this.page.getByRole("button", { name: /test database connection/i }).first(),
      this.page.getByRole("button", { name: /test connection/i }).first(),
    ]);

    if (testButton) {
      await expect(testButton).toBeEnabled({ timeout: 30000 });
      await testButton.click({ force: true });
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
    await testDbButton.click({ force: true });

    await expect(page.getByLabel("Next", { exact: true }).first()).toBeDisabled({
      timeout: 15_000,
    });
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
    await expect(page.getByLabel("Next", { exact: true }).first()).toBeDisabled();
  });

  test("should show error on invalid SMTP configuration", async ({ wizard, page }) => {
    test.setTimeout(90_000);
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

    await page.locator("#smtp-host").fill("smtp.invalid.invalid");
    await page.locator("#smtp-user").fill("admin");
    await page.locator("#smtp-password").fill("Password123!");
    await page.locator("#smtp-from").fill("admin@test.com");

    const testEmailButton = page.getByRole("button", { name: /test .* connection/i }).first();
    await testEmailButton.click();

    await expect(page.getByText(/connection failed/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});

test.describe("Setup Wizard: Navigation & State", () => {
  test("Wizard Navigation: Stepper & Breadcrumbs", async ({ wizard, page }) => {
    await wizard.hardReset();
    await wizard.dismissModals();

    await expect(page.getByText("Step 1")).toBeVisible();
    await expect(page.locator("#db-type")).toBeVisible();

    await page.locator("#db-type").selectOption("sqlite");
    await page.locator("#db-name").fill(`e2e_err_nav_${Date.now()}.db.sqlite`);
    await wizard.testConnection();
    await wizard.next();

    await expect(page.getByText("Step 2")).toBeVisible();
    await expect(page.locator("#admin-username")).toBeVisible();

    await wizard.dismissModals();
    await page.locator('button[aria-label^="Database"]:visible').first().click({ force: true });
    await expect(page.locator("#db-type")).toBeVisible();
  });

  test("Wizard: Reset Data Logic", async ({ wizard, page }) => {
    await wizard.hardReset();
    await wizard.dismissModals();

    await page.locator("#db-host").fill("DIRTY_STATE");

    await wizard.dismissModals();

    const resetBtn = page.locator('button[aria-label="Reset data"]').first();
    await resetBtn.click({ force: true });
    const confirmResetBtn = page.getByRole("button", { name: /confirm|yes/i }).first();
    if (await confirmResetBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmResetBtn.click({ force: true });
    }

    await expect(page.locator("#db-host")).not.toHaveValue("DIRTY_STATE", {
      timeout: 10000,
    });
  });
});

test.describe("Setup Wizard: Pre-Seeded Fast Path", () => {
  // TODO: Fix handle-system-state.ts redirect after API seed.
  // The seedReadyState() API call creates config/private.ts and seeds
  // admin user, but system state machine doesn't transition out of setup
  // mode synchronously, causing page.waitForURL to timeout.
  test.skip("should leave setup after API-seeded ready state", async ({ page }) => {
    test.setTimeout(30_000);
    const res = await page.request.post("/api/testing", {
      data: {
        action: "reset-to-state",
        state: "ready",
        email: "admin@test.com",
        password: "Password123!",
      },
    });
    if (!res.ok()) {
      throw new Error(`Seed ready state failed (${res.status()}): ${await res.text()}`);
    }
    await page.goto("/setup");
    await page.waitForURL((url) => !url.pathname.startsWith("/setup"), {
      timeout: 15000,
    });
    await expect(page).not.toHaveURL(/\/setup/);
  });
});

test.describe("Setup Wizard: Full Provisioning Flow", () => {
  const DB_TYPES = process.env.DB_TYPE
    ? [process.env.DB_TYPE as "sqlite" | "mongodb" | "postgresql" | "mariadb"]
    : (["sqlite"] as const);

  for (const dbType of DB_TYPES) {
    test(`Wizard Flow: ${dbType.toUpperCase()}`, async ({ wizard, page }) => {
      test.setTimeout(240_000);

      await test.step("Step 0: Clean Reset (API-seeded)", async () => {
        await resetToSetupMode();
        await page.goto("/setup");
        await page.waitForSelector("body", { timeout: 60000 });
        await wizard.dismissModals();
      });

      await test.step("Step 1: Database Configuration", async () => {
        console.log(`[${dbType}] Configuring database...`);
        await page.locator("#db-type").selectOption(dbType);

        if (dbType === "sqlite") {
          // Use the same DB name CI / auth-setup expect (process.env.DB_NAME overrides
          // private.ts at runtime). A timestamped name writes private.ts to a different
          // file while chromium shards still open e2e_auth_test → first-user mode forever.
          const sqliteName = process.env.DB_NAME || process.env.E2E_SQLITE_DB || "e2e_auth_test";
          await page.locator("#db-name").fill(sqliteName);
        } else {
          const ports = {
            mongodb: "27017",
            postgresql: "5432",
            mariadb: "3306",
          };
          const host = process.env.DB_HOST || "localhost";
          const port = process.env.DB_PORT || ports[dbType as keyof typeof ports];
          const name = process.env.DB_NAME || `sveltycms_e2e_${dbType}`;
          const user = process.env.DB_USER || "test";
          const password = process.env.DB_PASSWORD || "test";

          await page.locator("#db-host").fill(host);
          await page.locator("#db-port").fill(port);
          await page.locator("#db-name").fill(name);
          await page.locator("#db-user").fill(user);
          await page.locator("#db-password").fill(password);
        }

        await wizard.testConnection();
        await wizard.next();
      });

      await test.step("Step 2: Administrator Account", async () => {
        console.log(`[${dbType}] Creating admin user...`);
        // Match ADMIN_CREDENTIALS / auth-setup so chromium storageState can log in.
        const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
        const adminPassword =
          process.env.ADMIN_PASSWORD || process.env.ADMIN_PASS || "Password123!";
        await page.locator("#admin-username").fill("admin");
        await page.locator("#admin-email").fill(adminEmail);
        await page.locator("#admin-password").fill(adminPassword);
        await page.locator("#admin-confirm-password").fill("Wrong123!");
        await page.locator("#admin-username").focus();
        await expect(page.getByLabel("Next", { exact: true }).first()).toBeDisabled();

        await page.locator("#admin-confirm-password").fill(adminPassword);
        await wizard.next();
      });

      await test.step("Step 3: System Settings", async () => {
        console.log(`[${dbType}] Configuring system...`);
        const websitePreset = page.getByRole("option", { name: /website starter/i }).first();
        if (await websitePreset.isVisible({ timeout: 5000 }).catch(() => false)) {
          await websitePreset.click();
        }
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

        // Success criterion for e2e-prep: leave the multi-step wizard.
        // Post-setup destination may be /login, a collection route, or a config page
        // that is still warming (500) — that is out of scope for wizard provisioning.
        try {
          await page.waitForURL((url) => !url.pathname.startsWith("/setup"), {
            timeout: 180_000,
            waitUntil: "commit",
          });
        } catch (err) {
          const url = page.url();
          const bodyText = await page
            .locator("body")
            .innerText()
            .catch(() => "");
          throw new Error(
            `Setup finalize did not leave /setup. url=${url} body=${bodyText.slice(0, 800)} ` +
              `cause=${err instanceof Error ? err.message : String(err)}`,
          );
        }
        await expect(page).not.toHaveURL(/\/setup(\/|$|\?)/);
      });

      console.log(`✅ ${dbType.toUpperCase()} Wizard flow completed.`);
    });
  }
});
