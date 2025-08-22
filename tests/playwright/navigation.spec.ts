import { test, expect } from '@playwright/test';

test.describe('Navigation Management', () => {
  test.beforeEach(async ({ page }) => {
    // Use environment-based URL or fallback to dev server
    const baseUrl = process.env.BASE_URL || 'http://localhost:5174';
    
    // Login as admin user
    await page.goto(`${baseUrl}/login`);
    await page.fill('[data-testid="email"]', 'admin@example.com');
    await page.fill('[data-testid="password"]', 'password123');
    await page.click('[data-testid="login-button"]');
    
    // Navigate to navigation manager
    await page.goto(`${baseUrl}/admin/navigation`);
  });

  test('should display navigation manager interface', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Navigation Manager');
    await expect(page.locator('[data-testid="menu-list"]')).toBeVisible();
    await expect(page.locator('[data-testid="create-menu"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-locations"]')).toBeVisible();
  });

  test('should show existing navigation menus', async ({ page }) => {
    await expect(page.locator('[data-testid="menu-list"]')).toBeVisible();
    
    // Check for default menus
    const expectedMenus = ['Main Navigation', 'Footer Menu', 'Mobile Menu'];
    for (const menu of expectedMenus) {
      await expect(page.locator('[data-testid="menu-list"]')).toContainText(menu);
    }
    
    // Each menu should have edit and delete options
    await expect(page.locator('[data-testid="menu-item"] [data-testid="edit-menu"]')).toHaveCount(3);
  });

  test('should create new navigation menu', async ({ page }) => {
    await page.click('[data-testid="create-menu"]');
    
    await expect(page.locator('[data-testid="menu-form"]')).toBeVisible();
    
    await page.fill('[data-testid="menu-name"]', 'Secondary Navigation');
    await page.fill('[data-testid="menu-description"]', 'Secondary navigation for content pages');
    await page.selectOption('[data-testid="menu-location"]', 'header-secondary');
    
    await page.click('[data-testid="save-menu"]');
    
    await expect(page.locator('[data-testid="menu-created"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-list"]')).toContainText('Secondary Navigation');
  });

  test('should add menu items to navigation', async ({ page }) => {
    // Edit main navigation
    await page.click('[data-testid="menu-item-main-navigation"] [data-testid="edit-menu"]');
    
    await expect(page.locator('[data-testid="menu-builder"]')).toBeVisible();
    
    // Add page link
    await page.click('[data-testid="add-menu-item"]');
    await page.selectOption('[data-testid="item-type"]', 'page');
    await page.selectOption('[data-testid="select-page"]', 'about-us');
    await page.fill('[data-testid="menu-label"]', 'About Us');
    await page.click('[data-testid="add-item-confirm"]');
    
    // Add custom link
    await page.click('[data-testid="add-menu-item"]');
    await page.selectOption('[data-testid="item-type"]', 'custom');
    await page.fill('[data-testid="custom-url"]', '/contact');
    await page.fill('[data-testid="menu-label"]', 'Contact');
    await page.click('[data-testid="add-item-confirm"]');
    
    // Add category/collection link
    await page.click('[data-testid="add-menu-item"]');
    await page.selectOption('[data-testid="item-type"]', 'collection');
    await page.selectOption('[data-testid="select-collection"]', 'blog-posts');
    await page.fill('[data-testid="menu-label"]', 'Blog');
    await page.click('[data-testid="add-item-confirm"]');
    
    await page.click('[data-testid="save-menu"]');
    await expect(page.locator('[data-testid="menu-saved"]')).toBeVisible();
  });

  test('should support nested menu items', async ({ page }) => {
    await page.click('[data-testid="menu-item-main-navigation"] [data-testid="edit-menu"]');
    
    // Add parent item
    await page.click('[data-testid="add-menu-item"]');
    await page.selectOption('[data-testid="item-type"]', 'custom');
    await page.fill('[data-testid="custom-url"]', '/services');
    await page.fill('[data-testid="menu-label"]', 'Services');
    await page.click('[data-testid="add-item-confirm"]');
    
    // Add child items
    await page.click('[data-testid="menu-item-services"] [data-testid="add-child-item"]');
    await page.selectOption('[data-testid="item-type"]', 'page');
    await page.selectOption('[data-testid="select-page"]', 'web-development');
    await page.fill('[data-testid="menu-label"]', 'Web Development');
    await page.click('[data-testid="add-item-confirm"]');
    
    await page.click('[data-testid="menu-item-services"] [data-testid="add-child-item"]');
    await page.selectOption('[data-testid="item-type"]', 'page');
    await page.selectOption('[data-testid="select-page"]', 'design');
    await page.fill('[data-testid="menu-label"]', 'Design');
    await page.click('[data-testid="add-item-confirm"]');
    
    // Verify nested structure
    await expect(page.locator('[data-testid="menu-item-services"] [data-testid="child-items"]')).toContainText('Web Development');
    await expect(page.locator('[data-testid="menu-item-services"] [data-testid="child-items"]')).toContainText('Design');
    
    await page.click('[data-testid="save-menu"]');
  });

  test('should reorder menu items with drag and drop', async ({ page }) => {
    await page.click('[data-testid="menu-item-main-navigation"] [data-testid="edit-menu"]');
    
    // Get initial order
    const firstItem = page.locator('[data-testid="menu-builder"] [data-testid="sortable-item"]:first-child');
    const secondItem = page.locator('[data-testid="menu-builder"] [data-testid="sortable-item"]:nth-child(2)');
    
    // Drag first item to second position
    await firstItem.dragTo(secondItem);
    
    // Verify order changed
    await expect(page.locator('[data-testid="menu-builder"] [data-testid="sortable-item"]:first-child')).not.toContainText(await firstItem.textContent());
    
    await page.click('[data-testid="save-menu"]');
    await expect(page.locator('[data-testid="menu-saved"]')).toBeVisible();
  });

  test('should configure menu item properties', async ({ page }) => {
    await page.click('[data-testid="menu-item-main-navigation"] [data-testid="edit-menu"]');
    
    // Edit existing menu item
    await page.click('[data-testid="menu-item-about"] [data-testid="edit-item"]');
    
    await expect(page.locator('[data-testid="item-properties"]')).toBeVisible();
    
    // Configure properties
    await page.fill('[data-testid="menu-label"]', 'About Our Company');
    await page.fill('[data-testid="menu-description"]', 'Learn more about our company');
    await page.fill('[data-testid="css-classes"]', 'nav-highlight important');
    await page.selectOption('[data-testid="target"]', '_blank');
    await page.check('[data-testid="no-follow"]');
    
    // Set visibility conditions
    await page.selectOption('[data-testid="visibility"]', 'logged-in');
    await page.selectOption('[data-testid="required-role"]', 'member');
    
    await page.click('[data-testid="save-item"]');
    await expect(page.locator('[data-testid="item-updated"]')).toBeVisible();
  });

  test('should assign menus to locations', async ({ page }) => {
    await expect(page.locator('[data-testid="menu-locations"]')).toBeVisible();
    
    // Assign main navigation to header location
    await page.selectOption('[data-testid="location-header-primary"]', 'main-navigation');
    
    // Assign footer menu to footer location
    await page.selectOption('[data-testid="location-footer"]', 'footer-menu');
    
    // Assign mobile menu to mobile location
    await page.selectOption('[data-testid="location-mobile"]', 'mobile-menu');
    
    await page.click('[data-testid="save-locations"]');
    await expect(page.locator('[data-testid="locations-saved"]')).toBeVisible();
  });

  test('should preview menu in different contexts', async ({ page }) => {
    await page.click('[data-testid="menu-item-main-navigation"] [data-testid="preview-menu"]');
    
    await expect(page.locator('[data-testid="menu-preview"]')).toBeVisible();
    
    // Test different preview contexts
    await page.click('[data-testid="preview-desktop"]');
    await expect(page.locator('[data-testid="desktop-preview"]')).toBeVisible();
    
    await page.click('[data-testid="preview-mobile"]');
    await expect(page.locator('[data-testid="mobile-preview"]')).toBeVisible();
    
    // Test different user states
    await page.selectOption('[data-testid="preview-user-state"]', 'logged-out');
    await expect(page.locator('[data-testid="menu-preview"]')).not.toContainText('Dashboard');
    
    await page.selectOption('[data-testid="preview-user-state"]', 'logged-in');
    await expect(page.locator('[data-testid="menu-preview"]')).toContainText('Dashboard');
  });

  test('should delete menu items', async ({ page }) => {
    await page.click('[data-testid="menu-item-main-navigation"] [data-testid="edit-menu"]');
    
    // Delete a menu item
    await page.click('[data-testid="menu-item-contact"] [data-testid="delete-item"]');
    
    await expect(page.locator('[data-testid="delete-confirmation"]')).toBeVisible();
    await page.click('[data-testid="confirm-delete"]');
    
    await expect(page.locator('[data-testid="item-deleted"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-builder"]')).not.toContainText('Contact');
    
    await page.click('[data-testid="save-menu"]');
  });

  test('should delete entire menu', async ({ page }) => {
    await page.click('[data-testid="menu-item-secondary-navigation"] [data-testid="delete-menu"]');
    
    await expect(page.locator('[data-testid="delete-menu-confirmation"]')).toBeVisible();
    await expect(page.locator('[data-testid="delete-warning"]')).toContainText('This action cannot be undone');
    
    await page.fill('[data-testid="confirm-menu-name"]', 'Secondary Navigation');
    await page.click('[data-testid="confirm-menu-delete"]');
    
    await expect(page.locator('[data-testid="menu-deleted"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-list"]')).not.toContainText('Secondary Navigation');
  });

  test('should import/export menu configuration', async ({ page }) => {
    // Export menu
    await page.click('[data-testid="menu-item-main-navigation"] [data-testid="export-menu"]');
    
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="download-menu-config"]');
    const download = await downloadPromise;
    
    expect(download.suggestedFilename()).toContain('main-navigation');
    
    // Import menu
    await page.click('[data-testid="import-menu"]');
    
    const menuConfig = {
      name: 'Imported Menu',
      description: 'Menu imported from configuration',
      items: [
        { type: 'page', pageId: 'home', label: 'Home' },
        { type: 'custom', url: '/services', label: 'Services' }
      ]
    };
    
    await page.setInputFiles('[data-testid="menu-config-file"]', {
      name: 'menu-config.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(menuConfig))
    });
    
    await page.click('[data-testid="import-confirm"]');
    
    await expect(page.locator('[data-testid="import-success"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-list"]')).toContainText('Imported Menu');
  });

  test('should validate menu accessibility', async ({ page }) => {
    await page.click('[data-testid="menu-item-main-navigation"] [data-testid="edit-menu"]');
    
    // Run accessibility check
    await page.click('[data-testid="check-accessibility"]');
    
    await expect(page.locator('[data-testid="accessibility-results"]')).toBeVisible();
    
    // Should show warnings for missing alt text, aria labels, etc.
    await expect(page.locator('[data-testid="accessibility-warnings"]')).toBeVisible();
    
    // Fix accessibility issues
    await page.click('[data-testid="menu-item-about"] [data-testid="edit-item"]');
    await page.fill('[data-testid="aria-label"]', 'About our company page');
    await page.click('[data-testid="save-item"]');
    
    // Re-run check
    await page.click('[data-testid="check-accessibility"]');
    await expect(page.locator('[data-testid="accessibility-score"]')).toContainText('100%');
  });

  test('should support mega menu configuration', async ({ page }) => {
    await page.click('[data-testid="menu-item-main-navigation"] [data-testid="edit-menu"]');
    
    // Create mega menu item
    await page.click('[data-testid="add-menu-item"]');
    await page.selectOption('[data-testid="item-type"]', 'mega-menu');
    await page.fill('[data-testid="menu-label"]', 'Products');
    await page.click('[data-testid="add-item-confirm"]');
    
    // Configure mega menu layout
    await page.click('[data-testid="menu-item-products"] [data-testid="configure-mega-menu"]');
    
    await expect(page.locator('[data-testid="mega-menu-builder"]')).toBeVisible();
    
    // Add columns to mega menu
    await page.click('[data-testid="add-mega-column"]');
    await page.fill('[data-testid="column-title"]', 'Software');
    await page.selectOption('[data-testid="column-content"]', 'collection');
    await page.selectOption('[data-testid="content-collection"]', 'software-products');
    await page.click('[data-testid="save-column"]');
    
    await page.click('[data-testid="add-mega-column"]');
    await page.fill('[data-testid="column-title"]', 'Hardware');
    await page.selectOption('[data-testid="column-content"]', 'custom-links');
    await page.click('[data-testid="save-column"]');
    
    await page.click('[data-testid="save-mega-menu"]');
    await expect(page.locator('[data-testid="mega-menu-saved"]')).toBeVisible();
  });
});