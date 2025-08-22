import { test, expect } from '@playwright/test';

test.describe('Theme Manager', () => {
  test.beforeEach(async ({ page }) => {
    // Use environment-based URL or fallback to dev server
    const baseUrl = process.env.BASE_URL || 'http://localhost:5174';
    
    // Login as admin user
    await page.goto(`${baseUrl}/login`);
    await page.fill('[data-testid="email"]', 'admin@example.com');
    await page.fill('[data-testid="password"]', 'password123');
    await page.click('[data-testid="login-button"]');
    
    // Navigate to theme manager
    await page.goto(`${baseUrl}/admin/themes`);
  });

  test('should display theme manager interface', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Theme Manager');
    await expect(page.locator('[data-testid="active-theme"]')).toBeVisible();
    await expect(page.locator('[data-testid="available-themes"]')).toBeVisible();
    await expect(page.locator('[data-testid="theme-customizer"]')).toBeVisible();
  });

  test('should show current active theme', async ({ page }) => {
    await expect(page.locator('[data-testid="active-theme-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="active-theme-preview"]')).toBeVisible();
    await expect(page.locator('[data-testid="customize-button"]')).toBeVisible();
  });

  test('should list available themes', async ({ page }) => {
    const expectedThemes = ['SveltyCMS Default', 'Corporate', 'Blog', 'Portfolio'];
    
    for (const theme of expectedThemes) {
      await expect(page.locator('[data-testid="available-themes"]')).toContainText(theme);
    }
    
    // Each theme should have preview and activate buttons
    await expect(page.locator('[data-testid="theme-item"] [data-testid="preview-theme"]')).toHaveCount(4);
    await expect(page.locator('[data-testid="theme-item"] [data-testid="activate-theme"]')).toHaveCount(3); // Excluding active theme
  });

  test('should preview theme before activation', async ({ page }) => {
    await page.click('[data-testid="theme-item-corporate"] [data-testid="preview-theme"]');
    
    await expect(page.locator('[data-testid="theme-preview-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="preview-iframe"]')).toBeVisible();
    
    // Test different device previews
    await page.click('[data-testid="preview-mobile"]');
    await expect(page.locator('[data-testid="preview-iframe"]')).toHaveCSS('width', '375px');
    
    await page.click('[data-testid="preview-tablet"]');
    await expect(page.locator('[data-testid="preview-iframe"]')).toHaveCSS('width', '768px');
    
    await page.click('[data-testid="preview-desktop"]');
    await expect(page.locator('[data-testid="preview-iframe"]')).toHaveCSS('width', '1200px');
    
    await page.click('[data-testid="close-preview"]');
  });

  test('should activate a different theme', async ({ page }) => {
    await page.click('[data-testid="theme-item-blog"] [data-testid="activate-theme"]');
    
    await expect(page.locator('[data-testid="activation-confirmation"]')).toBeVisible();
    await expect(page.locator('[data-testid="activation-warning"]')).toContainText('This will change the appearance');
    
    await page.click('[data-testid="confirm-activation"]');
    
    await expect(page.locator('[data-testid="theme-activated"]')).toBeVisible();
    await expect(page.locator('[data-testid="active-theme-name"]')).toContainText('Blog');
  });

  test('should customize theme colors', async ({ page }) => {
    await page.click('[data-testid="customize-button"]');
    
    await expect(page.locator('[data-testid="theme-customizer"]')).toBeVisible();
    
    // Test color customization
    await page.click('[data-testid="colors-section"]');
    
    await page.fill('[data-testid="primary-color"]', '#3366cc');
    await page.fill('[data-testid="secondary-color"]', '#ff6600');
    await page.fill('[data-testid="accent-color"]', '#00cc66');
    
    // Preview changes
    await page.click('[data-testid="preview-changes"]');
    await expect(page.locator('[data-testid="live-preview"]')).toBeVisible();
    
    // Apply changes
    await page.click('[data-testid="apply-changes"]');
    await expect(page.locator('[data-testid="customization-saved"]')).toBeVisible();
  });

  test('should customize typography settings', async ({ page }) => {
    await page.click('[data-testid="customize-button"]');
    await page.click('[data-testid="typography-section"]');
    
    // Font family settings
    await page.selectOption('[data-testid="primary-font"]', 'Roboto');
    await page.selectOption('[data-testid="heading-font"]', 'Playfair Display');
    
    // Font size settings
    await page.fill('[data-testid="base-font-size"]', '16');
    await page.fill('[data-testid="h1-size"]', '2.5');
    await page.fill('[data-testid="h2-size"]', '2.0');
    
    // Line height and letter spacing
    await page.fill('[data-testid="line-height"]', '1.6');
    await page.fill('[data-testid="letter-spacing"]', '0.02');
    
    await page.click('[data-testid="apply-changes"]');
    await expect(page.locator('[data-testid="typography-updated"]')).toBeVisible();
  });

  test('should customize layout and spacing', async ({ page }) => {
    await page.click('[data-testid="customize-button"]');
    await page.click('[data-testid="layout-section"]');
    
    // Container width
    await page.selectOption('[data-testid="container-width"]', 'wide');
    
    // Spacing settings
    await page.fill('[data-testid="section-padding"]', '4rem');
    await page.fill('[data-testid="element-spacing"]', '2rem');
    
    // Grid settings
    await page.fill('[data-testid="grid-columns"]', '12');
    await page.fill('[data-testid="grid-gap"]', '1.5rem');
    
    await page.click('[data-testid="apply-changes"]');
    await expect(page.locator('[data-testid="layout-updated"]')).toBeVisible();
  });

  test('should upload custom theme files', async ({ page }) => {
    await page.click('[data-testid="upload-theme"]');
    
    // Mock theme zip file
    const themeZip = Buffer.from('mock theme zip content');
    await page.setInputFiles('[data-testid="theme-file-input"]', {
      name: 'custom-theme.zip',
      mimeType: 'application/zip',
      buffer: themeZip
    });
    
    await page.fill('[data-testid="theme-name"]', 'Custom Theme');
    await page.fill('[data-testid="theme-description"]', 'My custom theme');
    
    await page.click('[data-testid="upload-confirm"]');
    
    await expect(page.locator('[data-testid="theme-uploaded"]')).toBeVisible();
    await expect(page.locator('[data-testid="available-themes"]')).toContainText('Custom Theme');
  });

  test('should export theme configuration', async ({ page }) => {
    await page.click('[data-testid="export-theme"]');
    
    await expect(page.locator('[data-testid="export-options"]')).toBeVisible();
    
    // Select export options
    await page.check('[data-testid="include-customizations"]');
    await page.check('[data-testid="include-assets"]');
    await page.selectOption('[data-testid="export-format"]', 'zip');
    
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="download-theme"]');
    const download = await downloadPromise;
    
    expect(download.suggestedFilename()).toContain('theme-export');
  });

  test('should manage theme templates', async ({ page }) => {
    await page.click('[data-testid="theme-templates"]');
    
    await expect(page.locator('[data-testid="template-list"]')).toBeVisible();
    
    // Check default templates
    const expectedTemplates = ['home.svelte', 'blog.svelte', 'page.svelte', 'error.svelte'];
    for (const template of expectedTemplates) {
      await expect(page.locator('[data-testid="template-list"]')).toContainText(template);
    }
    
    // Edit template
    await page.click('[data-testid="template-item-home"] [data-testid="edit-template"]');
    
    await expect(page.locator('[data-testid="template-editor"]')).toBeVisible();
    await expect(page.locator('[data-testid="code-editor"]')).toBeVisible();
    
    // Make changes to template
    await page.fill('[data-testid="code-editor"]', '<div>Updated home template</div>');
    
    await page.click('[data-testid="save-template"]');
    await expect(page.locator('[data-testid="template-saved"]')).toBeVisible();
  });

  test('should create custom CSS overrides', async ({ page }) => {
    await page.click('[data-testid="custom-css"]');
    
    await expect(page.locator('[data-testid="css-editor"]')).toBeVisible();
    
    const customCSS = `
      .custom-header {
        background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
        padding: 2rem;
      }
      
      .custom-button {
        border-radius: 25px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.1);
      }
    `;
    
    await page.fill('[data-testid="css-editor"]', customCSS);
    
    // Preview CSS changes
    await page.click('[data-testid="preview-css"]');
    await expect(page.locator('[data-testid="css-preview"]')).toBeVisible();
    
    // Apply custom CSS
    await page.click('[data-testid="apply-css"]');
    await expect(page.locator('[data-testid="css-applied"]')).toBeVisible();
  });

  test('should manage theme assets', async ({ page }) => {
    await page.click('[data-testid="theme-assets"]');
    
    await expect(page.locator('[data-testid="assets-manager"]')).toBeVisible();
    
    // Upload new asset
    const logoImage = Buffer.from('mock logo image');
    await page.setInputFiles('[data-testid="asset-upload"]', {
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: logoImage
    });
    
    await expect(page.locator('[data-testid="asset-uploaded"]')).toBeVisible();
    await expect(page.locator('[data-testid="asset-list"]')).toContainText('logo.png');
    
    // Delete asset
    await page.click('[data-testid="asset-item-logo"] [data-testid="delete-asset"]');
    await page.click('[data-testid="confirm-delete-asset"]');
    
    await expect(page.locator('[data-testid="asset-deleted"]')).toBeVisible();
  });

  test('should validate theme compatibility', async ({ page }) => {
    await page.click('[data-testid="theme-item-portfolio"] [data-testid="activate-theme"]');
    
    // Should show compatibility check
    await expect(page.locator('[data-testid="compatibility-check"]')).toBeVisible();
    
    // Mock compatibility issues
    await expect(page.locator('[data-testid="compatibility-warnings"]')).toContainText('Some widgets may not display correctly');
    
    // User can proceed despite warnings
    await page.check('[data-testid="accept-compatibility-risks"]');
    await page.click('[data-testid="proceed-activation"]');
    
    await expect(page.locator('[data-testid="theme-activated"]')).toBeVisible();
  });

  test('should reset theme to defaults', async ({ page }) => {
    // Customize theme first
    await page.click('[data-testid="customize-button"]');
    await page.fill('[data-testid="primary-color"]', '#ff0000');
    await page.click('[data-testid="apply-changes"]');
    
    // Reset to defaults
    await page.click('[data-testid="reset-theme"]');
    
    await expect(page.locator('[data-testid="reset-confirmation"]')).toBeVisible();
    await expect(page.locator('[data-testid="reset-warning"]')).toContainText('All customizations will be lost');
    
    await page.click('[data-testid="confirm-reset"]');
    
    await expect(page.locator('[data-testid="theme-reset"]')).toBeVisible();
    
    // Verify customizations are removed
    await page.click('[data-testid="customize-button"]');
    await expect(page.locator('[data-testid="primary-color"]')).not.toHaveValue('#ff0000');
  });
});