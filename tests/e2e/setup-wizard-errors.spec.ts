// @file tests/playwright/setup-wizard-errors.spec.ts
// This test checks for error handling in the setup wizard.

import { expect, test } from "@playwright/test";

test("should show error on bad database connection", async ({ page }) => {
  await page.goto("/setup");

  // In TEST_MODE, we should be able to see /setup even if configured
  await expect(page).toHaveURL(/\/setup/);

  // Select MariaDB to trigger connection check
  await page.locator("#db-type").selectOption("mariadb");
  await page.locator("#db-host").fill("non-existent-host");
  await page.locator("#db-name").fill("svelty_test");
  await page.locator("#db-user").fill("wrong_user");
  await page.locator("#db-password").fill("wrong_password");

  const testDbButton = page.locator("button", { hasText: /test database/i });
  await testDbButton.click();

  // Assert that an error message appears
  await expect(page.getByText(/connection failed|getaddrinfo ENOTFOUND/i).first()).toBeVisible({
    timeout: 15_000,
  });

  // Assert that the "Next" button is disabled
  const nextButton = page.getByLabel("Next", { exact: true });
  await expect(nextButton).toBeDisabled();
});

test("should show error on admin user password mismatch", async ({ page }) => {
  await page.goto("/setup");

  // Skip to Admin Step (assuming we can bypass via Next if DB is already valid or mocked)
  // For E2E we usually have to follow the flow, so we use SQLite which should be fast
  await page.locator("#db-type").selectOption("sqlite");
  await page.getByLabel("Next", { exact: true }).click();

  await expect(page.locator("h2", { hasText: /admin/i }).first()).toBeVisible();

  await page.locator("#admin-username").fill("admin");
  await page.locator("#admin-email").fill("admin@example.com");
  await page.locator("#admin-password").fill("Password123!");
  await page.locator("#admin-confirm-password").fill("Mismatch123!");

  // Moving out of the field should trigger validation
  await page.locator("#admin-username").focus();

  await expect(page.getByText(/passwords do not match/i)).toBeVisible();
  await expect(page.getByLabel("Next", { exact: true })).toBeDisabled();
});

test("should show error on invalid SMTP configuration", async ({ page }) => {
  await page.goto("/setup");

  // Fast track to SMTP (Step 4 approx)
  await page.locator("#db-type").selectOption("sqlite");
  await page.getByLabel("Next", { exact: true }).click(); // To Admin
  await page.locator("#admin-username").fill("admin");
  await page.locator("#admin-email").fill("admin@example.com");
  await page.locator("#admin-password").fill("Password123!");
  await page.locator("#admin-confirm-password").fill("Password123!");
  await page.getByLabel("Next", { exact: true }).click(); // To Site Settings
  await page.getByLabel("Next", { exact: true }).click(); // To Mail Settings

  await expect(page.locator("h2", { hasText: /email/i }).first()).toBeVisible();

  await page.locator("#smtp-host").fill("smtp.invalid.invalid");
  await page.locator("#smtp-port").fill("587");
  await page.locator("#test-email").fill("test@example.com");

  const testEmailButton = page.locator("button", { hasText: /test email/i });
  await testEmailButton.click();

  await expect(page.getByText(/invalid smtp|enotfound/i).first()).toBeVisible({
    timeout: 20_000,
  });
});
