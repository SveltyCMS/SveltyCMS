import { test, expect } from "@playwright/test";

test.describe("Authentication Module", () => {
  const testUser = {
    email: "testuser@example.com",
    password: "TestPassword123!",
    name: "Test User",
  };

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("User can register a new account", async ({ page }) => {
    await page.click('a:has-text("Sign Up")');
    await page.waitForURL(/.*signup.*/);

    await page.fill('input[name="email"]', testUser.email);
    await page.fill('input[name="password"]', testUser.password);
    await page.fill('input[name="confirmPassword"]', testUser.password);
    await page.fill('input[name="name"]', testUser.name);

    await page.click('button:has-text("Create Account")');
    await page.waitForURL(/.*dashboard.*/);

    expect(page.url()).toContain("dashboard");
  });

  test("User can log in with valid credentials", async ({ page }) => {
    await page.click('a:has-text("Login")');
    await page.waitForURL(/.*login.*/);

    await page.fill('input[name="email"]', testUser.email);
    await page.fill('input[name="password"]', testUser.password);

    await page.click('button:has-text("Log In")');
    await page.waitForURL(/.*dashboard.*/);

    expect(page.url()).toContain("dashboard");
  });

  test("Login fails with invalid credentials", async ({ page }) => {
    await page.click('a:has-text("Login")');
    await page.waitForURL(/.*login.*/);

    await page.fill('input[name="email"]', "wrong@example.com");
    await page.fill('input[name="password"]', "WrongPassword123!");

    await page.click('button:has-text("Log In")');

    // Expect error message or still on login page
    const errorVisible = await page.locator('[role="alert"]').isVisible();
    const stillOnLogin = page.url().includes("login");

    expect(errorVisible || stillOnLogin).toBeTruthy();
  });

  test("User can log out", async ({ page }) => {
    // First, log in
    await page.click('a:has-text("Login")');
    await page.waitForURL(/.*login.*/);

    await page.fill('input[name="email"]', testUser.email);
    await page.fill('input[name="password"]', testUser.password);
    await page.click('button:has-text("Log In")');
    await page.waitForURL(/.*dashboard.*/);

    // Now log out
    await page.click('[data-testid="user-menu"]');
    await page.click('button:has-text("Log Out")');

    await page.waitForURL(/.*login.*/);
    expect(page.url()).not.toContain("dashboard");
  });

  test("Session is maintained on page refresh", async ({ page }) => {
    // Log in
    await page.click('a:has-text("Login")');
    await page.waitForURL(/.*login.*/);

    await page.fill('input[name="email"]', testUser.email);
    await page.fill('input[name="password"]', testUser.password);
    await page.click('button:has-text("Log In")');
    await page.waitForURL(/.*dashboard.*/);

    // Refresh the page
    await page.reload();

    // Should still be on dashboard (session maintained)
    expect(page.url()).toContain("dashboard");
  });

  test("Password reset works with valid email", async ({ page }) => {
    await page.click('a:has-text("Login")');
    await page.waitForURL(/.*login.*/);

    await page.click('a:has-text("Forgot Password")');
    await page.waitForURL(/.*forgot-password.*/);

    await page.fill('input[name="email"]', testUser.email);
    await page.click('button:has-text("Send Reset Link")');

    // Should show success message or redirect
    const successVisible = await page
      .locator('[role="alert"]:has-text("Check your email")')
      .isVisible();
    expect(successVisible || page.url().includes("check-email")).toBeTruthy();
  });
});
