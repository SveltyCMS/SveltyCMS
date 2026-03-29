import { test, expect } from "@playwright/test";

test.describe("Content Management Module", () => {
  const testContent = {
    title: "Test Article",
    slug: "test-article",
    body: "This is a test article body with some content.",
    excerpt: "A brief excerpt",
    tags: ["test", "automation"],
  };

  test.beforeEach(async ({ page }) => {
    // Navigate to dashboard (assuming logged in)
    await page.goto("/dashboard");
    // If login required, handle it
    const loginButton = await page.locator('a:has-text("Login")').first();
    if (await loginButton.isVisible()) {
      // Navigate to login and authenticate
      await page.click('a:has-text("Login")');
      await page.waitForURL(/.*login.*/);
      // Use test credentials (these should come from env vars)
      await page.fill('input[name="email"]', process.env.TEST_EMAIL || "test@example.com");
      await page.fill('input[name="password"]', process.env.TEST_PASSWORD || "password123");
      await page.click('button:has-text("Log In")');
      await page.waitForURL(/.*dashboard.*/);
    }
  });

  test("User can create a new content item", async ({ page }) => {
    await page.click('a:has-text("Create Content")');
    await page.waitForURL(/.*content.*new.*/);

    await page.fill('input[name="title"]', testContent.title);
    await page.fill('input[name="slug"]', testContent.slug);

    // Rich editor - adjust selector based on actual implementation
    const editorLocator = page.locator('[data-testid="content-editor"]');
    await editorLocator.click();
    await page.keyboard.type(testContent.body);

    await page.fill('input[name="excerpt"]', testContent.excerpt);

    // Add tags
    for (const tag of testContent.tags) {
      await page.click('input[name="tags"]');
      await page.keyboard.type(tag);
      await page.press('input[name="tags"]', "Enter");
    }

    await page.click('button:has-text("Publish")');
    await page.waitForURL(/.*content.*/);

    // Verify content appears in list
    expect(await page.locator(`text=${testContent.title}`).isVisible()).toBeTruthy();
  });

  test("User can edit existing content", async ({ page }) => {
    // Navigate to content list
    await page.goto("/dashboard/content");
    await page.waitForLoadState("networkidle");

    // Click first content item
    await page.click('tr:first-child >> a:has-text("Edit")');
    await page.waitForURL(/.*content.*edit.*/);

    const newTitle = "Updated Test Article";
    await page.fill('input[name="title"]', newTitle);

    await page.click('button:has-text("Update")');
    await page.waitForURL(/.*content.*/);

    // Verify update
    expect(await page.locator(`text=${newTitle}`).isVisible()).toBeTruthy();
  });

  test("User can delete content with confirmation", async ({ page }) => {
    await page.goto("/dashboard/content");
    await page.waitForLoadState("networkidle");

    const initialCount = await page.locator("tbody >> tr").count();

    // Click delete on first item
    await page.click('tr:first-child >> button[aria-label="Delete"]');

    // Confirm deletion in modal
    await page.click('button:has-text("Confirm Delete")');
    await page.waitForLoadState("networkidle");

    const finalCount = await page.locator("tbody >> tr").count();
    expect(finalCount).toBe(initialCount - 1);
  });

  test("Content filtering works by status", async ({ page }) => {
    await page.goto("/dashboard/content");
    await page.waitForLoadState("networkidle");

    // Filter by published
    await page.selectOption('select[name="status"]', "published");
    await page.click('button:has-text("Apply Filter")');
    await page.waitForLoadState("networkidle");

    // All visible items should be published
    const statusBadges = page.locator('[data-status="published"]');
    expect(await statusBadges.count()).toBeGreaterThan(0);
  });

  test("Content search functionality works", async ({ page }) => {
    await page.goto("/dashboard/content");
    await page.waitForLoadState("networkidle");

    const searchTerm = testContent.title;
    await page.fill('input[placeholder="Search content"]', searchTerm);
    await page.press('input[placeholder="Search content"]', "Enter");
    await page.waitForLoadState("networkidle");

    // Results should contain search term
    const results = page.locator("tbody >> tr");
    expect(await results.count()).toBeGreaterThan(0);
  });

  test("Content draft can be saved without publishing", async ({ page }) => {
    await page.click('a:has-text("Create Content")');
    await page.waitForURL(/.*content.*new.*/);

    await page.fill('input[name="title"]', "Draft Article");
    await page.fill('input[name="slug"]', "draft-article");

    const editorLocator = page.locator('[data-testid="content-editor"]');
    await editorLocator.click();
    await page.keyboard.type("Draft content");

    await page.click('button:has-text("Save as Draft")');
    await page.waitForURL(/.*content.*/);

    // Navigate to drafts
    await page.selectOption('select[name="status"]', "draft");
    await page.click('button:has-text("Apply Filter")');
    await page.waitForLoadState("networkidle");

    expect(await page.locator("text=Draft Article").isVisible()).toBeTruthy();
  });

  test("Bulk operations on multiple content items", async ({ page }) => {
    await page.goto("/dashboard/content");
    await page.waitForLoadState("networkidle");

    // Select first 3 items
    for (let i = 0; i < 3; i++) {
      await page.click(`tbody >> tr:nth-child(${i + 1}) >> input[type="checkbox"]`);
    }

    // Apply bulk action
    await page.selectOption('select[name="bulk-action"]', "publish");
    await page.click('button:has-text("Apply")');
    await page.waitForLoadState("networkidle");

    // Verify action applied
    expect(await page.locator('[data-status="published"]').count()).toBeGreaterThanOrEqual(3);
  });
});
