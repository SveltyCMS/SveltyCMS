/**
 * @file tests/e2e/setup-wizard.spec.ts
 * @description Setup wizard test for SveltyCMS
 *
 * This test completes the initial setup wizard by:
 * 1. Configuring database connection
 * 2. Creating the admin user account
 * 3. Initializing system defaults
 */

import { expect, test, type Page } from "@playwright/test";

// Helper to click "Next" button and wait for transition
async function clickNext(page: Page) {
  // aria-label is set to button_next() i18n value = "Next" in English
  const nextButton = page.getByLabel("Next", { exact: true });
  await expect(nextButton).toBeEnabled();

  // Use force: true to bypass any ghost overlays from stepper transitions
  await nextButton.click({ force: true });
  await page.waitForTimeout(1000); // Wait for stepper animation and hydration
}

test.beforeEach(async ({ page }) => {
  // Strip test-specific headers (x-test-worker-index, x-test-secret) from cross-origin
  // requests to avoid CORS preflight failures on external CDNs like Iconify.
  await page.route(
    (url) => url.hostname !== "localhost" && url.hostname !== "127.0.0.1",
    (route) => {
      const headers = { ...route.request().headers() };
      delete headers["x-test-worker-index"];
      delete headers["x-test-secret"];
      route.continue({ headers });
    },
  );

  // Ensure we start with a clean state by calling the Hard Reset API
  // This deletes private.test.ts and clears the DB for this worker
  // try {
  //   const response = await page.request.post("/api/testing", {
  //     data: { action: "reset" },
  //   });
  //   if (response.ok()) {
  //     console.log("[SetupWizard] Hard Reset successful.");
  //   } else {
  //     console.warn("[SetupWizard] Hard Reset returned non-OK status:", response.status());
  //   }
  // } catch (err) {
  //   console.warn("[SetupWizard] Hard Reset failed (non-fatal):", err);
  // }

  // // Poll the testing API until the system confirms it is in setup mode.
  // // This guards against race conditions where background tasks or concurrent
  // // processes (e.g. setup-system.ts) recreate private.test.ts after the reset.
  // const maxWaitMs = 10_000;
  // const pollIntervalMs = 500;
  // const deadline = Date.now() + maxWaitMs;
  // let confirmed = false;

  // while (Date.now() < deadline) {
  //   try {
  //     const state = await page.request.post("/api/testing", {
  //       data: { action: "check-state" },
  //     });
  //     if (state.ok()) {
  //       const data = await state.json().catch(() => null);
  //       if (data?.setupMode === true) {
  //         console.log("[SetupWizard] System confirmed in setup mode.");
  //         confirmed = true;
  //         break;
  //       }
  //       console.log(`[SetupWizard] Waiting for setup mode, configExists: ${data?.configExists}`);
  //     }
  //   } catch {
  //     // Server briefly unavailable during reset — keep polling
  //   }
  //   await page.waitForTimeout(pollIntervalMs);
  // }

  // if (!confirmed) {
  //   console.warn("[SetupWizard] System did not reach setup mode within timeout — proceeding anyway.");
  // }
});

test("Setup Wizard: Configure DB and Create Admin", async ({ page }) => {
  // Setup wizard can take time due to DB initialization/seeding
  test.setTimeout(180_000);

  // 1. Start at root, expect redirect to /setup
  await page.goto("/setup", { waitUntil: "networkidle" });
  await page.waitForLoadState("networkidle");

  const currentUrl = page.url();
  console.log(`Current URL: ${currentUrl}`);

  // If redirected elsewhere (e.g. root without setup), force go to /setup
  if (!currentUrl.includes("/setup")) {
    console.log("Redirected to non-setup page. Forcing navigate to /setup...");
    await page.goto("/setup", { waitUntil: "networkidle" });
  }

  // Wait for setup to load and hydrate
  await expect(page).toHaveURL(/\/setup/);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(5000); // Hard wait for page to fully render and modals to appear

  // Helper: dismiss cookie consent banner if visible
  async function dismissCookieBanner() {
    const btn = page.getByRole("button", { name: /accept all/i });
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log("Cookie consent banner detected. Clicking Accept All...");
      await btn.click();
      await page.waitForTimeout(300);
    }
  }

  // Dismiss cookie banner before handling modals
  await dismissCookieBanner();

  console.log("Starting setup wizard...");

  // Check for "Welcome to SveltyCMS" popup and click "Get Started" if present
  // NOTE: Skeleton v4 renders the modal twice (component tree + portal), so #welcome-heading
  // resolves to 2 elements. Use .first() to avoid strict mode violation.
  // Both positioners carry aria-hidden="true"; the ghost copy (c2) is fixed inset-0 and
  // physically intercepts pointer events over the real button (c1). Use { force: true }.
  const welcomeModal = page.locator("#welcome-heading").first();
  if (await welcomeModal.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log("Welcome to SveltyCMS popup detected. Clicking Get Started...");
    const getStartedBtn = page
      .locator("button")
      .filter({ hasText: /get started/i })
      .first();
    await expect(getStartedBtn).toBeVisible({ timeout: 3000 });
    await getStartedBtn.click({ force: true }); // force: bypass ghost overlay interception
    await page
      .locator("#welcome-heading")
      .first()
      .waitFor({ state: "hidden", timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(300);
  }

  // Dismiss cookie banner again — it may appear after the welcome modal closes
  await dismissCookieBanner();

  console.log("Proceeding with setup steps...");

  // Dismiss any remaining generic overlays (dismiss/close)
  const dismissBtn = page.getByRole("button", { name: /^(dismiss|close)$/i });
  if (await dismissBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await dismissBtn.click();
  }

  console.log("Starting Step 1: Database Configuration...");

  // --- STEP 1: Database ---
  await expect(page.locator("h2", { hasText: /database/i }).first()).toBeVisible({
    timeout: 30_000,
  });

  // --- STEP 1: Database Configuration ---
  console.log("Step 1: Database Configuration...");

  // Force clean state by clicking Reset Data if present (helps in CI reuse)
  const resetBtn = page.getByRole("button", { name: /reset data/i });
  if (await resetBtn.isVisible()) {
    console.log("[SetupWizard] Existing data detected. Clicking Reset Data for fresh test...");
    await resetBtn.click();
    await page.waitForTimeout(1000);
  }

  // Select SQLite (default for E2E tests)
  const dbType = process.env.DB_TYPE || "sqlite";

  const dbHost = process.env.DB_HOST || (dbType === "sqlite" ? "config/database" : "localhost");
  const dbName =
    process.env.DB_NAME || (dbType === "sqlite" ? "sveltycms_test.db" : "sveltycms_test");

  // Default ports for different database types
  const defaultPorts: Record<string, string> = {
    mariadb: "3306",
    mysql: "3306",
    postgresql: "5432",
    postgres: "5432",
    mongodb: "27017",
    mongo: "27017",
  };
  const dbPort = process.env.DB_PORT || defaultPorts[dbType] || "";

  const dbUser =
    process.env.DB_USER !== undefined ? process.env.DB_USER : dbType === "sqlite" ? "" : "test";
  const dbPass =
    process.env.DB_PASSWORD !== undefined
      ? process.env.DB_PASSWORD
      : dbType === "sqlite"
        ? ""
        : "test";

  const dbAuthSource = process.env.DB_AUTH_SOURCE || "";

  const dbTypeSelect = page.locator("#db-type");
  await dbTypeSelect.selectOption(dbType);

  await page.locator("#db-host").fill(dbHost);
  await page.locator("#db-name").fill(dbName);

  // Fill User/Pass/Port if not SQLite
  if (dbType !== "sqlite") {
    if (dbPort) await page.locator("#db-port").fill(dbPort);
    await page.locator("#db-user").fill(dbUser);
    await page.locator("#db-password").fill(dbPass);
    if (dbAuthSource) await page.locator("#db-auth-source").fill(dbAuthSource);
  }

  // Click Test Database and handle SQLite "create missing" modal or non-empty DB modal
  const testDbButton = page.getByRole("button", { name: /test database connection/i });
  await testDbButton.click({ force: true });
  await page.waitForTimeout(2000); // Wait for connection test to initiate

  // Handle "Database does not exist" or "Database not empty" confirmation
  // NOTE: Skeleton v4 renders modals with aria-hidden="true" on positioners, so
  // getByRole() won't find the button. Use locator().filter().first() + force:true
  const confirmBtn = page.locator("button").filter({ hasText: /yes/i }).first();
  try {
    // Wait up to 15s for the modal to appear
    await expect(confirmBtn).toBeVisible({ timeout: 15000 });
    console.log("Database modal detected. Confirming...");
    await confirmBtn.click({ force: true });
    await page.waitForTimeout(3000); // Wait for action + connection
  } catch {
    console.log("No 'Database' modal appeared. Proceeding to check success...");
  }

  // The Next button being enabled is the definitive signal that the DB test passed.
  // Also check for the "Success!" heading in the database-config component.
  // We try both in parallel and accept whichever comes first.
  const nextButton = page.getByLabel("Next", { exact: true });
  // "Success!" is the heading text node in database-config.svelte (alongside an iconify-icon).
  // getByText with exact:true finds the text node directly, avoiding the icon child mismatch.
  const successHeading = page.getByText("Success!", { exact: true }).first();
  // Fallback: the full message "Database connected successfully! ✨" rendered in +page.svelte
  const successMsgAlt = page.getByText(/connected successfully/i).first();

  async function waitForDbTestSuccess(): Promise<boolean> {
    console.log("[SetupWizard] Waiting for database connection success indicators...");
    // Attempt 1: wait up to 45s for "Success!" heading or the generic success text
    try {
      // Promise.any: resolves as soon as ANY check passes (unlike race, tolerates individual failures)
      await Promise.any([
        expect(successHeading).toBeVisible({ timeout: 45000 }),
        expect(successMsgAlt).toBeVisible({ timeout: 45000 }),
        expect(nextButton).toBeEnabled({ timeout: 45000 }),
      ]);

      // Additional safety: ensure it stays enabled for a moment
      await page.waitForTimeout(500);
      const isEnabled = await nextButton.isEnabled();
      console.log(
        `[SetupWizard] Database connection successful. Next button enabled: ${isEnabled}`,
      );
      return true;
    } catch (err) {
      console.log(`[SetupWizard] Success indicators not found: ${err}`);
      return false;
    }
  }

  let dbTestOk = await waitForDbTestSuccess();

  if (!dbTestOk) {
    console.warn("Initial connection check timed out. Retrying Test Database click...");
    // Log current page text for debugging
    const bodyText = await page
      .locator("body")
      .innerText()
      .catch(() => "(unavailable)");
    console.log("Page body excerpt:", bodyText.substring(0, 500));

    // Re-locate the button to ensure it hasn't been detached
    const retryBtn = page.getByRole("button", { name: /test database connection/i });
    if (await retryBtn.isVisible()) {
      await retryBtn.click({ force: true });
      await page.waitForTimeout(3000);
      dbTestOk = await waitForDbTestSuccess();
    } else {
      console.error("Retry button not visible, setup might be stuck.");
      throw new Error("Setup wizard stuck: Test Database button disappeared.");
    }
  }

  if (!dbTestOk) {
    // Last resort: check if Next is already enabled (can happen if success was momentary)
    const nextEnabled = await nextButton.isEnabled().catch(() => false);
    if (!nextEnabled) {
      throw new Error("Database connection test failed: no success indicator found after retry.");
    }
    console.log(
      "Next button is enabled — DB test passed (success banner may have been dismissed).",
    );
  }

  await clickNext(page);

  // --- STEP 2: Admin User ---
  await expect(page.locator("h2", { hasText: /admin/i }).first()).toBeVisible({
    timeout: 60_000,
  });

  // Fill admin user details
  console.log("Step 2: Admin User Configuration...");
  await page.locator("#admin-username").fill("admin");
  await page.locator("#admin-email").fill("admin@test.com");
  await page.locator("#admin-password").fill("Admin123!");
  await page.locator("#admin-confirm-password").fill("Admin123!");
  await clickNext(page);

  // --- STEP 3: System Settings ---
  console.log("Step 3: System Settings...");
  // Fill Site Name
  await page.locator("#site-name").fill("SveltyCMS Test");

  // Fill Production URL (use the current origin for testing)
  const origin = new URL(page.url()).origin;
  await page.locator("#host-prod").fill(origin);

  // Fill Media Path
  await page.locator("#media-folder").fill("./mediaFolder_test");

  await clickNext(page);

  // --- STEP 4 & 5: Review & Complete ---
  console.log("Step 4 & 5: Reviewing and completing...");
  await clickNext(page); // Review step

  // Final Step: Complete Setup
  // aria-label is set to button_complete() i18n value = "Complete" in English
  const finishButton = page.getByLabel("Complete", { exact: true });
  await expect(finishButton).toBeVisible();
  await finishButton.click();

  // Wait for redirect away from /setup
  console.log("Waiting for redirect away from /setup...");
  await page.waitForTimeout(3000);
  await page.waitForURL((url) => !url.pathname.startsWith("/setup"), { timeout: 120_000 });
  console.log("Successfully redirected after setup. Current URL:", page.url());

  // Navigate to the collection builder to verify setup completed successfully
  await page.goto("/config/collectionbuilder", { waitUntil: "networkidle" });
  console.log("Collection builder URL:", page.url());
  await expect(page).not.toHaveURL(/\/setup/);
  console.log("Setup completed successfully.");
});
