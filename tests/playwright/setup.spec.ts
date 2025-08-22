import { test, expect } from '@playwright/test';

test.describe('SveltyCMS Setup and Configuration', () => {
  test.beforeEach(async ({ page }) => {
    // Start with a fresh installation state
    await page.goto('/');
  });

  test('should display setup wizard for fresh installation', async ({ page }) => {
    // Check if setup wizard appears for new installation
    await expect(page.locator('h1')).toContainText(['Setup', 'Welcome', 'Install']);
    
    // Verify setup steps are visible
    await expect(page.locator('[data-testid="setup-steps"]')).toBeVisible();
  });

  test('should validate database configuration', async ({ page }) => {
    await page.goto('/setup');
    
    // Test database configuration form
    await page.fill('[data-testid="db-host"]', 'localhost');
    await page.fill('[data-testid="db-port"]', '27017');
    await page.fill('[data-testid="db-name"]', 'SveltyCMS_Test');
    
    await page.click('[data-testid="test-connection"]');
    
    // Verify connection test result
    await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected');
  });

  test('should configure admin user during setup', async ({ page }) => {
    await page.goto('/setup/admin');
    
    // Fill admin user details
    await page.fill('[data-testid="admin-email"]', 'admin@example.com');
    await page.fill('[data-testid="admin-password"]', 'SecurePassword123!');
    await page.fill('[data-testid="confirm-password"]', 'SecurePassword123!');
    await page.fill('[data-testid="admin-name"]', 'System Administrator');
    
    await page.click('[data-testid="create-admin"]');
    
    // Verify admin creation success
    await expect(page.locator('[data-testid="setup-success"]')).toBeVisible();
  });

  test('should configure email settings', async ({ page }) => {
    await page.goto('/setup/email');
    
    // Test development mode configuration
    await page.check('[data-testid="email-dev-mode"]');
    await page.click('[data-testid="save-email-config"]');
    
    await expect(page.locator('[data-testid="email-config-saved"]')).toBeVisible();
    
    // Test SMTP configuration
    await page.uncheck('[data-testid="email-dev-mode"]');
    await page.fill('[data-testid="smtp-host"]', 'smtp.example.com');
    await page.fill('[data-testid="smtp-port"]', '587');
    await page.fill('[data-testid="smtp-user"]', 'test@example.com');
    await page.fill('[data-testid="smtp-password"]', 'password123');
    
    await page.click('[data-testid="test-email"]');
    
    // Verify email test (should show test result)
    await expect(page.locator('[data-testid="email-test-result"]')).toBeVisible();
  });

  test('should complete setup wizard', async ({ page }) => {
    // Go through complete setup flow
    await page.goto('/setup');
    
    // Step 1: Database
    await page.fill('[data-testid="db-host"]', 'localhost');
    await page.fill('[data-testid="db-port"]', '27017');
    await page.fill('[data-testid="db-name"]', 'SveltyCMS_Test');
    await page.click('[data-testid="next-step"]');
    
    // Step 2: Admin User
    await page.fill('[data-testid="admin-email"]', 'admin@test.com');
    await page.fill('[data-testid="admin-password"]', 'SecurePassword123!');
    await page.fill('[data-testid="confirm-password"]', 'SecurePassword123!');
    await page.click('[data-testid="next-step"]');
    
    // Step 3: Email Configuration
    await page.check('[data-testid="email-dev-mode"]');
    await page.click('[data-testid="next-step"]');
    
    // Step 4: Final Configuration
    await page.fill('[data-testid="site-name"]', 'Test SveltyCMS Site');
    await page.click('[data-testid="complete-setup"]');
    
    // Verify setup completion
    await expect(page.locator('[data-testid="setup-complete"]')).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('should prevent access to setup if already configured', async ({ page }) => {
    // Mock that system is already configured
    await page.addInitScript(() => {
      window.localStorage.setItem('sveltycms-configured', 'true');
    });
    
    await page.goto('/setup');
    
    // Should redirect to login or dashboard
    await expect(page).toHaveURL(/\/(login|dashboard)/);
  });

  test('should validate configuration file generation', async ({ page }) => {
    // Complete setup and verify config files are created
    await page.goto('/setup/complete');
    
    // This would need to be implemented to check server-side file generation
    // For now, verify the UI confirms file creation
    await expect(page.locator('[data-testid="config-files-created"]')).toBeVisible();
  });
});