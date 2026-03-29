import { test as baseTest, expect, Page } from "@playwright/test";

type AuthContext = {
  token: string;
  email: string;
  userId: string;
};

export const test = baseTest.extend<{
  authenticatedPage: Page;
  authContext: AuthContext;
}>({
  authContext: async ({}, use) => {
    // In a real scenario, this would use API to authenticate
    const authContext: AuthContext = {
      token: "",
      email: process.env.TEST_EMAIL || "test@example.com",
      userId: "",
    };

    await use(authContext);

    // Cleanup if needed
  },

  authenticatedPage: async ({ page, authContext }, use) => {
    // Navigate to app
    await page.goto("/");

    // Check if already logged in
    const loginButton = await page.locator('a:has-text("Login")').first();
    if (await loginButton.isVisible()) {
      // Perform login
      await page.click('a:has-text("Login")');
      await page.waitForURL(/.*login.*/);

      await page.fill('input[name="email"]', authContext.email);
      await page.fill('input[name="password"]', process.env.TEST_PASSWORD || "password123");
      await page.click('button:has-text("Log In")');

      await page.waitForURL(/.*dashboard.*/);
    }

    await use(page);

    // Cleanup - logout
    const userMenu = await page.locator('[data-testid="user-menu"]').first();
    if (await userMenu.isVisible()) {
      await userMenu.click();
      await page.click('button:has-text("Log Out")');
    }
  },
});

export { expect };

/**
 * Helper functions for common test operations
 */

export class TestHelpers {
  /**
   * Create test content via UI
   */
  static async createContent(
    page: Page,
    data: {
      title: string;
      slug: string;
      body: string;
      excerpt?: string;
      tags?: string[];
      status?: "draft" | "published";
    },
  ) {
    await page.click('a:has-text("Create Content")');
    await page.waitForURL(/.*content.*new.*/);

    await page.fill('input[name="title"]', data.title);
    await page.fill('input[name="slug"]', data.slug);

    const editorLocator = page.locator('[data-testid="content-editor"]');
    await editorLocator.click();
    await page.keyboard.type(data.body);

    if (data.excerpt) {
      await page.fill('input[name="excerpt"]', data.excerpt);
    }

    if (data.tags && data.tags.length > 0) {
      for (const tag of data.tags) {
        await page.click('input[name="tags"]');
        await page.keyboard.type(tag);
        await page.press('input[name="tags"]', "Enter");
      }
    }

    const publishButton = data.status === "draft" ? "Save as Draft" : "Publish";
    await page.click(`button:has-text("${publishButton}")`);
    await page.waitForURL(/.*content.*/);
  }

  /**
   * Navigate to content by title and open it
   */
  static async openContentByTitle(page: Page, title: string) {
    await page.goto("/dashboard/content");
    await page.waitForLoadState("networkidle");

    await page.click(`text=${title}`);
    await page.waitForURL(/.*content.*edit.*/);
  }

  /**
   * Delete content by title
   */
  static async deleteContentByTitle(page: Page, title: string) {
    await page.goto("/dashboard/content");
    await page.waitForLoadState("networkidle");

    // Find and click delete for this content
    const row = page.locator(`tr:has-text("${title}")`);
    await row.locator('button[aria-label="Delete"]').click();

    // Confirm deletion
    await page.click('button:has-text("Confirm Delete")');
    await page.waitForLoadState("networkidle");
  }

  /**
   * Wait for and verify toast notification
   */
  static async expectToastMessage(page: Page, message: string, timeout = 5000) {
    const toast = page.locator(`[role="alert"]:has-text("${message}")`);
    await toast.waitFor({ state: "visible", timeout });
    return toast;
  }

  /**
   * Login via UI
   */
  static async login(
    page: Page,
    email: string = process.env.TEST_EMAIL || "test@example.com",
    password: string = process.env.TEST_PASSWORD || "password123",
  ) {
    await page.goto("/login");

    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button:has-text("Log In")');

    await page.waitForURL(/.*dashboard.*/);
  }

  /**
   * Logout via UI
   */
  static async logout(page: Page) {
    await page.click('[data-testid="user-menu"]');
    await page.click('button:has-text("Log Out")');

    await page.waitForURL(/.*login.*/);
  }

  /**
   * Check if element is in viewport
   */
  static async isInViewport(page: Page, selector: string) {
    return await page.evaluate((selector) => {
      const element = document.querySelector(selector);
      if (!element) return false;

      const rect = element.getBoundingClientRect();
      return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.right <= window.innerWidth
      );
    }, selector);
  }

  /**
   * Generate unique test data
   */
  static generateTestData(prefix: string = "test") {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);

    return {
      title: `${prefix}-${timestamp}-${random}`,
      slug: `${prefix}-${timestamp}-${random}`.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      email: `${prefix}-${timestamp}@example.com`,
      userId: `user-${timestamp}`,
    };
  }

  /**
   * Wait for network to be idle
   */
  static async waitForNetworkIdle(page: Page, timeout = 5000) {
    await page.waitForLoadState("networkidle", { timeout });
  }

  /**
   * Take screenshot with timestamp
   */
  static async takeScreenshot(page: Page, name: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    await page.screenshot({ path: `test-results/${name}-${timestamp}.png` });
  }
}

/**
 * Mock data generators
 */

export const MockData = {
  user: (overrides?: Partial<any>) => ({
    email: `user-${Date.now()}@example.com`,
    password: "TestPassword123!",
    name: "Test User",
    role: "editor",
    ...overrides,
  }),

  content: (overrides?: Partial<any>) => ({
    title: `Test Article ${Date.now()}`,
    slug: `test-article-${Date.now()}`,
    body: "This is test content",
    excerpt: "A brief excerpt",
    tags: ["test", "automation"],
    status: "draft",
    ...overrides,
  }),

  comment: (overrides?: Partial<any>) => ({
    text: `Test comment ${Date.now()}`,
    author: "Test Author",
    ...overrides,
  }),
};
