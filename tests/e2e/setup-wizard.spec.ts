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
  const nextButton = page.getByLabel("Next", { exact: true });
  await expect(nextButton).toBeEnabled();

  // Use force: true to bypass any ghost overlays from stepper transitions
  await nextButton.click({ force: true });
  await page.waitForTimeout(1000); // Wait for stepper animation and hydration
}

test.beforeEach(async ({ page }) => {
  // Ensure we start with a clean state by calling the Hard Reset API
  // This deletes private.test.ts and clears the DB for this worker
  try {
    const response = await page.request.post("/api/testing", {
      data: { action: "reset" },
    });
    if (response.ok()) {
      console.log("[SetupWizard] Hard Reset successful.");
    }
  } catch (err) {
    console.warn("[SetupWizard] Hard Reset failed (non-fatal):", err);
  }
});

test("Setup Wizard: Configure DB and Create Admin", async ({ page }) => {
  // Setup wizard can take time due to DB initialization/seeding
  test.setTimeout(180_000);

  // 1. Start at root, expect redirect to /setup
  await page.goto("/", { waitUntil: "networkidle" });
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

  // Dismiss cookie consent banner if present (e.g. "Accept All")
  const cookieAcceptBtn = page.getByRole("button", { name: /accept all/i });
  if (await cookieAcceptBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log("Cookie consent banner detected. Clicking Accept All...");
    await cookieAcceptBtn.click();
    await page.waitForTimeout(300);
  }

  console.log("Starting setup wizard...");

  // Check for "Welcome to SveltyCMS" popup and click "Get Started" if present
  // NOTE: Skeleton v4 renders the modal twice (component tree + portal), so #welcome-heading
  // resolves to 2 elements. Use .first() to avoid strict mode violation.
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

  // Select SQLite (default for E2E tests)
  const dbType = process.env.DB_TYPE || "sqlite";
  const dbHost = process.env.DB_HOST || (dbType === "sqlite" ? "config/database" : "localhost");
  const dbName =
    process.env.DB_NAME || (dbType === "sqlite" ? "sveltycms_test.db" : "sveltycms_test");

  const dbTypeSelect = page.getByTestId("db-type");
  await dbTypeSelect.selectOption(dbType);

  await page.getByTestId("db-host").fill(dbHost);
  await page.getByTestId("db-name").fill(dbName);

  // Click Test Database and handle SQLite "create missing" modal
  const testDbButton = page.getByRole("button", { name: /test database/i });
  await testDbButton.click({ force: true });

  // Handle "Database does not exist" confirmation for SQLite
  const confirmBtn = page.getByRole("button", { name: /yes/i });
  try {
    // Wait up to 10s for the modal to appear (SQLite only)
    await expect(confirmBtn).toBeVisible({ timeout: 10000 });
    console.log("Database missing modal detected. Confirming creation...");
    await confirmBtn.click({ force: true });
  } catch {
    console.log(
      "No 'Database missing' modal appeared (or not SQLite). Proceeding to check success...",
    );
  }

  // Expect success message with a generous timeout for DB creation/I/O
  const successMsg = page.getByText(/success/i).first();
  try {
    await expect(successMsg).toBeVisible({ timeout: 45000 });
    console.log("Database connection successful.");
  } catch {
    console.warn("Initial Success message not found. Retrying Test Database click...");
    await testDbButton.click({ force: true });
    await expect(successMsg).toBeVisible({ timeout: 45000 });
  }

  await clickNext(page);

  // --- STEP 2: Admin User ---
  await expect(page.locator("h2", { hasText: /admin/i }).first()).toBeVisible({
    timeout: 60_000,
  });

  // Fill admin user details
  console.log("Step 2: Admin User Configuration...");
  await page.getByTestId("admin-username").fill("admin");
  await page.getByTestId("admin-email").fill("admin@test.com");
  await page.getByTestId("admin-password").fill("Admin123!");
  await page.getByTestId("admin-confirm-password").fill("Admin123!");
  await clickNext(page);

  // --- STEP 3: System Settings ---
  console.log("Step 3: System Settings...");
  // Fill Site Name
  await page.getByTestId("site-name").fill("SveltyCMS Test");

  // Fill Production URL (use the current origin for testing)
  const origin = new URL(page.url()).origin;
  await page.getByTestId("host-prod").fill(origin);

  // Fill Media Path
  await page.getByTestId("media-folder").fill("./mediaFolder_test");

  await clickNext(page);

  // --- STEP 4 & 5: Review & Complete ---
  console.log("Step 4 & 5: Reviewing and completing...");
  await clickNext(page); // Review step

  // Final Step: Complete Setup
  const finishButton = page.getByRole("button", { name: /finish|complete/i });
  await expect(finishButton).toBeVisible();
  await finishButton.click();

  // Wait for redirect to dashboard
  console.log("Waiting for redirect to dashboard...");
  // Complete setup triggers a database seed and then redirect
  await page.waitForURL(/\/en\/collections/, { timeout: 120_000 });
  console.log("Successfully redirected to dashboard. Setup complete!");

  // --- VERIFICATION ---
  // Force the server to recognize the setup is complete
  // We use a retry loop since the server might be re-initializing and cause ECONNREFUSED
  let setupOk = false;
  let attempts = 0;
  while (!setupOk && attempts < 5) {
    try {
      const response = await page.request.post("/api/testing", {
        data: { action: "setup" },
      });
      if (response.ok()) {
        setupOk = true;
        console.log("Forced setup completion via API.");
      }
    } catch (err) {
      console.warn(`Attempt ${attempts + 1} to call setup API failed:`, err);
      await page.waitForTimeout(2000 * (attempts + 1)); // Exponential backoff
    }
    attempts++;
  }

  // 2. Expect redirect to Login or Dashboard
  // In TEST_MODE with Hard Reset, the redirect should be immediate
  await expect(page).not.toHaveURL(/\/setup/, { timeout: 40_000 });
  console.log("Setup completed successfully.");
});
