/**
 * Centralized test configuration and utilities for SveltyCMS
 */

export const testConfig = {
  // Environment URLs
  urls: {
    dev: process.env.BASE_URL || 'http://localhost:5174',
    prod: process.env.PROD_URL || 'http://localhost:5174',
    staging: process.env.STAGING_URL || 'http://localhost:5174'
  },

  // Test user credentials
  users: {
    admin: {
      email: process.env.TEST_ADMIN_EMAIL || 'admin@example.com',
      password: process.env.TEST_ADMIN_PASSWORD || 'admin@123',
      role: 'admin'
    },
    editor: {
      email: process.env.TEST_EDITOR_EMAIL || 'editor@example.com',
      password: process.env.TEST_EDITOR_PASSWORD || 'editor@123',
      role: 'editor'
    },
    user: {
      email: process.env.TEST_USER_EMAIL || 'user@example.com',
      password: process.env.TEST_USER_PASSWORD || 'user@123',
      role: 'user'
    }
  },

  // Database configuration for tests
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || '27017',
    name: process.env.DB_NAME || 'SveltyCMS_Test',
    user: process.env.DB_USER || 'admin',
    password: process.env.DB_PASSWORD || 'admin'
  },

  // Test timeouts
  timeouts: {
    short: 5000,
    medium: 15000,
    long: 30000,
    extraLong: 60000
  },

  // Common selectors
  selectors: {
    // Authentication
    email: '[data-testid="email"], input[name="email"], input[type="email"]',
    password: '[data-testid="password"], input[name="password"], input[type="password"]',
    loginButton: '[data-testid="login-button"], button:has-text("Sign In"), button[type="submit"]',
    logoutButton: '[data-testid="logout-button"], button[aria-label="Sign Out"], button:has-text("Sign Out")',
    
    // Navigation
    userMenu: '[data-testid="user-menu"], [aria-label="User menu"]',
    mainNav: '[data-testid="main-nav"], nav[role="navigation"]',
    
    // Forms
    submitButton: '[data-testid="submit"], button[type="submit"]',
    cancelButton: '[data-testid="cancel"], button:has-text("Cancel")',
    saveButton: '[data-testid="save"], button:has-text("Save")',
    
    // Messages
    successMessage: '[data-testid="success"], .success, [role="status"]',
    errorMessage: '[data-testid="error"], .error, [role="alert"]',
    loadingIndicator: '[data-testid="loading"], .loading, [aria-label="Loading"]'
  }
};

/**
 * Common test utilities
 */
export class TestUtils {
  /**
   * Login with specified user type
   */
  static async login(page: any, userType: keyof typeof testConfig.users = 'admin') {
    const user = testConfig.users[userType];
    const baseUrl = testConfig.urls.dev; // Use dev URL for tests
    
    await page.goto(`${baseUrl}/login`);
    await page.waitForLoadState('networkidle');
    
    await page.fill(testConfig.selectors.email, user.email);
    await page.fill(testConfig.selectors.password, user.password);
    await page.click(testConfig.selectors.loginButton);
    
    // Wait for successful login
    await page.waitForURL(/\/(admin|dashboard|en\/Collections)/i, { timeout: testConfig.timeouts.medium });
  }

  /**
   * Logout current user
   */
  static async logout(page: any) {
    const logoutButton = page.locator(testConfig.selectors.logoutButton).first();
    await logoutButton.click();
    await page.waitForURL(/\/login/, { timeout: testConfig.timeouts.medium });
  }

  /**
   * Wait for element to be visible with retry logic
   */
  static async waitForElement(page: any, selector: string, timeout = testConfig.timeouts.medium) {
    const element = page.locator(selector).first();
    await element.waitFor({ state: 'visible', timeout });
    return element;
  }

  /**
   * Fill form with data
   */
  static async fillForm(page: any, formData: Record<string, string>) {
    for (const [field, value] of Object.entries(formData)) {
      await page.fill(`[data-testid="${field}"], [name="${field}"], input[placeholder*="${field}"]`, value);
    }
  }

  /**
   * Upload file helper
   */
  static async uploadFile(page: any, selector: string, filePath: string) {
    await page.setInputFiles(selector, filePath);
  }

  /**
   * Wait for API response
   */
  static async waitForAPI(page: any, urlPattern: string | RegExp, timeout = testConfig.timeouts.medium) {
    return await page.waitForResponse(
      response => {
        const url = response.url();
        return typeof urlPattern === 'string' ? url.includes(urlPattern) : urlPattern.test(url);
      },
      { timeout }
    );
  }

  /**
   * Take screenshot for debugging
   */
  static async screenshot(page: any, name: string) {
    await page.screenshot({ path: `test-results/screenshots/${name}-${Date.now()}.png`, fullPage: true });
  }

  /**
   * Clean up test data
   */
  static async cleanup(page: any) {
    // Clear localStorage and sessionStorage
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // Clear cookies
    await page.context().clearCookies();
  }

  /**
   * Mock API responses
   */
  static async mockAPI(page: any, endpoint: string, response: any) {
    await page.route(`**/api/${endpoint}`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response)
      });
    });
  }

  /**
   * Generate test data
   */
  static generateTestData() {
    const timestamp = Date.now();
    return {
      email: `test-${timestamp}@example.com`,
      name: `Test User ${timestamp}`,
      title: `Test Content ${timestamp}`,
      slug: `test-slug-${timestamp}`,
      content: `This is test content generated at ${new Date().toISOString()}`
    };
  }
}

/**
 * Test data fixtures
 */
export const testData = {
  validUser: {
    email: 'newuser@example.com',
    password: 'SecurePassword123!',
    firstName: 'John',
    lastName: 'Doe'
  },
  
  validContent: {
    title: 'Test Blog Post',
    slug: 'test-blog-post',
    content: 'This is a test blog post content.',
    status: 'published'
  },

  validCollection: {
    name: 'Test Collection',
    slug: 'test-collection',
    description: 'A test collection for automated testing'
  },

  invalidData: {
    email: 'invalid-email',
    shortPassword: '123',
    emptyField: '',
    specialChars: '!@#$%^&*()'
  }
};