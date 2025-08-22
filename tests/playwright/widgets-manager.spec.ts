import { test, expect } from '@playwright/test';

test.describe('Widgets Manager', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin user
    await page.goto('/login');
    await page.fill('[data-testid="email"]', 'admin@example.com');
    await page.fill('[data-testid="password"]', 'password123');
    await page.click('[data-testid="login-button"]');
    
    // Navigate to widgets manager
    await page.goto('/admin/widgets');
  });

  test('should display widgets manager interface', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Widgets Manager');
    await expect(page.locator('[data-testid="widget-library"]')).toBeVisible();
    await expect(page.locator('[data-testid="widget-instances"]')).toBeVisible();
    await expect(page.locator('[data-testid="create-widget"]')).toBeVisible();
  });

  test('should display available widget types', async ({ page }) => {
    await expect(page.locator('[data-testid="widget-library"]')).toBeVisible();
    
    // Check for common widget types
    const expectedWidgets = [
      'Text Widget',
      'Image Widget', 
      'Video Widget',
      'Gallery Widget',
      'Form Widget',
      'Calendar Widget',
      'Map Widget',
      'Social Media Widget'
    ];
    
    for (const widget of expectedWidgets) {
      await expect(page.locator('[data-testid="widget-library"]')).toContainText(widget);
    }
  });

  test('should create a new text widget', async ({ page }) => {
    await page.click('[data-testid="create-widget"]');
    
    // Select widget type
    await page.selectOption('[data-testid="widget-type"]', 'text');
    await page.fill('[data-testid="widget-name"]', 'Welcome Message');
    await page.fill('[data-testid="widget-description"]', 'Welcome message for homepage');
    
    // Configure text widget settings
    await page.fill('[data-testid="text-content"]', 'Welcome to our amazing website!');
    await page.selectOption('[data-testid="text-alignment"]', 'center');
    await page.selectOption('[data-testid="text-size"]', 'large');
    
    await page.click('[data-testid="save-widget"]');
    
    await expect(page.locator('[data-testid="widget-created"]')).toBeVisible();
    await expect(page.locator('[data-testid="widget-instances"]')).toContainText('Welcome Message');
  });

  test('should create an image widget with upload', async ({ page }) => {
    await page.click('[data-testid="create-widget"]');
    
    await page.selectOption('[data-testid="widget-type"]', 'image');
    await page.fill('[data-testid="widget-name"]', 'Hero Image');
    
    // Upload image
    const testImagePath = require('path').join(__dirname, 'testthumb.png');
    await page.setInputFiles('[data-testid="image-upload"]', testImagePath);
    
    // Configure image settings
    await page.fill('[data-testid="alt-text"]', 'Hero banner image');
    await page.fill('[data-testid="image-caption"]', 'Beautiful hero banner');
    await page.selectOption('[data-testid="image-alignment"]', 'center');
    await page.check('[data-testid="responsive-image"]');
    
    await page.click('[data-testid="save-widget"]');
    
    await expect(page.locator('[data-testid="widget-created"]')).toBeVisible();
    
    // Verify image preview
    await page.click('[data-testid="widget-item-hero-image"] [data-testid="preview-widget"]');
    await expect(page.locator('[data-testid="widget-preview"] img')).toBeVisible();
  });

  test('should create a form widget with fields', async ({ page }) => {
    await page.click('[data-testid="create-widget"]');
    
    await page.selectOption('[data-testid="widget-type"]', 'form');
    await page.fill('[data-testid="widget-name"]', 'Contact Form');
    
    // Add form fields
    await page.click('[data-testid="add-form-field"]');
    await page.selectOption('[data-testid="field-type"]', 'text');
    await page.fill('[data-testid="field-label"]', 'Full Name');
    await page.fill('[data-testid="field-name"]', 'full_name');
    await page.check('[data-testid="field-required"]');
    await page.click('[data-testid="confirm-add-field"]');
    
    await page.click('[data-testid="add-form-field"]');
    await page.selectOption('[data-testid="field-type"]', 'email');
    await page.fill('[data-testid="field-label"]', 'Email Address');
    await page.fill('[data-testid="field-name"]', 'email');
    await page.check('[data-testid="field-required"]');
    await page.click('[data-testid="confirm-add-field"]');
    
    await page.click('[data-testid="add-form-field"]');
    await page.selectOption('[data-testid="field-type"]', 'textarea');
    await page.fill('[data-testid="field-label"]', 'Message');
    await page.fill('[data-testid="field-name"]', 'message');
    await page.click('[data-testid="confirm-add-field"]');
    
    // Configure form settings
    await page.fill('[data-testid="submit-button-text"]', 'Send Message');
    await page.fill('[data-testid="success-message"]', 'Thank you for your message!');
    await page.fill('[data-testid="notification-email"]', 'admin@example.com');
    
    await page.click('[data-testid="save-widget"]');
    
    await expect(page.locator('[data-testid="widget-created"]')).toBeVisible();
  });

  test('should create a calendar widget', async ({ page }) => {
    await page.click('[data-testid="create-widget"]');
    
    await page.selectOption('[data-testid="widget-type"]', 'calendar');
    await page.fill('[data-testid="widget-name"]', 'Event Calendar');
    
    // Configure calendar settings
    await page.selectOption('[data-testid="calendar-view"]', 'month');
    await page.check('[data-testid="show-weekends"]');
    await page.selectOption('[data-testid="first-day"]', 'monday');
    
    // Connect to events collection
    await page.selectOption('[data-testid="events-collection"]', 'events');
    await page.selectOption('[data-testid="date-field"]', 'start_date');
    await page.selectOption('[data-testid="title-field"]', 'title');
    
    await page.click('[data-testid="save-widget"]');
    
    await expect(page.locator('[data-testid="widget-created"]')).toBeVisible();
  });

  test('should edit existing widget', async ({ page }) => {
    // Assume we have a widget to edit
    await page.click('[data-testid="widget-item-welcome-message"] [data-testid="edit-widget"]');
    
    await expect(page.locator('h2')).toContainText('Edit Widget: Welcome Message');
    
    // Modify widget content
    await page.fill('[data-testid="text-content"]', 'Updated welcome message!');
    await page.selectOption('[data-testid="text-size"]', 'extra-large');
    
    await page.click('[data-testid="save-widget"]');
    
    await expect(page.locator('[data-testid="widget-updated"]')).toBeVisible();
  });

  test('should preview widget in different contexts', async ({ page }) => {
    await page.click('[data-testid="widget-item-welcome-message"] [data-testid="preview-widget"]');
    
    await expect(page.locator('[data-testid="widget-preview"]')).toBeVisible();
    
    // Test different preview contexts
    await page.selectOption('[data-testid="preview-context"]', 'mobile');
    await expect(page.locator('[data-testid="mobile-preview"]')).toBeVisible();
    
    await page.selectOption('[data-testid="preview-context"]', 'tablet');
    await expect(page.locator('[data-testid="tablet-preview"]')).toBeVisible();
    
    await page.selectOption('[data-testid="preview-context"]', 'desktop');
    await expect(page.locator('[data-testid="desktop-preview"]')).toBeVisible();
  });

  test('should duplicate widget', async ({ page }) => {
    await page.click('[data-testid="widget-item-welcome-message"] [data-testid="duplicate-widget"]');
    
    await expect(page.locator('[data-testid="duplicate-dialog"]')).toBeVisible();
    await page.fill('[data-testid="duplicate-name"]', 'Welcome Message Copy');
    await page.click('[data-testid="confirm-duplicate"]');
    
    await expect(page.locator('[data-testid="widget-duplicated"]')).toBeVisible();
    await expect(page.locator('[data-testid="widget-instances"]')).toContainText('Welcome Message Copy');
  });

  test('should organize widgets with categories and tags', async ({ page }) => {
    await page.click('[data-testid="widget-item-welcome-message"] [data-testid="edit-widget"]');
    
    // Add category and tags
    await page.selectOption('[data-testid="widget-category"]', 'content');
    await page.fill('[data-testid="widget-tags"]', 'homepage, welcome, text');
    
    await page.click('[data-testid="save-widget"]');
    
    // Test filtering by category
    await page.selectOption('[data-testid="filter-category"]', 'content');
    await expect(page.locator('[data-testid="widget-instances"] [data-testid="widget-item"]')).toHaveCount(1);
    
    // Test searching by tag
    await page.fill('[data-testid="search-widgets"]', 'homepage');
    await expect(page.locator('[data-testid="widget-instances"] [data-testid="widget-item"]')).toHaveCount(1);
  });

  test('should delete widget with confirmation', async ({ page }) => {
    await page.click('[data-testid="widget-item-welcome-message"] [data-testid="delete-widget"]');
    
    await expect(page.locator('[data-testid="delete-confirmation"]')).toBeVisible();
    await expect(page.locator('[data-testid="delete-warning"]')).toContainText('permanently deleted');
    
    // Test cancellation
    await page.click('[data-testid="cancel-delete"]');
    await expect(page.locator('[data-testid="delete-confirmation"]')).not.toBeVisible();
    
    // Test deletion
    await page.click('[data-testid="widget-item-welcome-message"] [data-testid="delete-widget"]');
    await page.click('[data-testid="confirm-delete"]');
    
    await expect(page.locator('[data-testid="widget-deleted"]')).toBeVisible();
    await expect(page.locator('[data-testid="widget-instances"]')).not.toContainText('Welcome Message');
  });

  test('should manage widget permissions and visibility', async ({ page }) => {
    await page.click('[data-testid="widget-item-contact-form"] [data-testid="edit-widget"]');
    
    // Configure visibility settings
    await page.click('[data-testid="visibility-settings"]');
    
    await page.check('[data-testid="require-login"]');
    await page.selectOption('[data-testid="required-role"]', 'member');
    
    // Set display conditions
    await page.selectOption('[data-testid="display-condition"]', 'specific-pages');
    await page.fill('[data-testid="page-paths"]', '/contact\n/about');
    
    await page.click('[data-testid="save-widget"]');
    
    await expect(page.locator('[data-testid="widget-updated"]')).toBeVisible();
  });

  test('should export and import widget configurations', async ({ page }) => {
    // Export widget
    await page.click('[data-testid="widget-item-contact-form"] [data-testid="export-widget"]');
    
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="download-config"]');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('contact-form-widget');
    
    // Import widget
    await page.click('[data-testid="import-widget"]');
    
    const widgetConfig = {
      name: 'Imported Widget',
      type: 'text',
      settings: {
        content: 'This is an imported widget',
        alignment: 'center'
      }
    };
    
    await page.setInputFiles('[data-testid="config-file-input"]', {
      name: 'widget-config.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(widgetConfig))
    });
    
    await page.click('[data-testid="import-confirm"]');
    
    await expect(page.locator('[data-testid="import-success"]')).toBeVisible();
    await expect(page.locator('[data-testid="widget-instances"]')).toContainText('Imported Widget');
  });

  test('should test widget responsiveness', async ({ page }) => {
    await page.click('[data-testid="widget-item-hero-image"] [data-testid="edit-widget"]');
    
    // Configure responsive settings
    await page.click('[data-testid="responsive-settings"]');
    
    // Desktop settings
    await page.selectOption('[data-testid="breakpoint"]', 'desktop');
    await page.fill('[data-testid="width"]', '100%');
    await page.fill('[data-testid="height"]', '400px');
    
    // Tablet settings
    await page.selectOption('[data-testid="breakpoint"]', 'tablet');
    await page.fill('[data-testid="width"]', '100%');
    await page.fill('[data-testid="height"]', '300px');
    
    // Mobile settings
    await page.selectOption('[data-testid="breakpoint"]', 'mobile');
    await page.fill('[data-testid="width"]', '100%');
    await page.fill('[data-testid="height"]', '200px');
    
    await page.click('[data-testid="save-widget"]');
    
    // Test responsive preview
    await page.click('[data-testid="preview-widget"]');
    
    await page.setViewportSize({ width: 768, height: 1024 }); // Tablet
    await expect(page.locator('[data-testid="widget-preview"]')).toHaveCSS('height', '300px');
    
    await page.setViewportSize({ width: 375, height: 667 }); // Mobile
    await expect(page.locator('[data-testid="widget-preview"]')).toHaveCSS('height', '200px');
  });

  test('should validate widget configurations', async ({ page }) => {
    await page.click('[data-testid="create-widget"]');
    
    // Test required field validation
    await page.click('[data-testid="save-widget"]');
    await expect(page.locator('[data-testid="name-error"]')).toContainText('Widget name is required');
    
    // Test invalid configuration
    await page.selectOption('[data-testid="widget-type"]', 'form');
    await page.fill('[data-testid="widget-name"]', 'Invalid Form');
    
    // Try to save without required form fields
    await page.click('[data-testid="save-widget"]');
    await expect(page.locator('[data-testid="validation-error"]')).toContainText('At least one form field is required');
    
    // Test valid configuration
    await page.click('[data-testid="add-form-field"]');
    await page.selectOption('[data-testid="field-type"]', 'text');
    await page.fill('[data-testid="field-label"]', 'Name');
    await page.fill('[data-testid="field-name"]', 'name');
    await page.click('[data-testid="confirm-add-field"]');
    
    await page.click('[data-testid="save-widget"]');
    await expect(page.locator('[data-testid="widget-created"]')).toBeVisible();
  });
});