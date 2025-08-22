import { test, expect } from '@playwright/test';

test.describe('Password Reset Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure we start from login page
    await page.goto('/login');
  });

  test('should display forgot password link on login page', async ({ page }) => {
    await expect(page.locator('[data-testid="forgot-password-link"]')).toBeVisible();
    await expect(page.locator('[data-testid="forgot-password-link"]')).toContainText('Forgot Password');
  });

  test('should navigate to password reset page', async ({ page }) => {
    await page.click('[data-testid="forgot-password-link"]');
    
    await expect(page).toHaveURL('/password-reset');
    await expect(page.locator('h1')).toContainText('Reset Password');
    await expect(page.locator('[data-testid="email-input"]')).toBeVisible();
  });

  test('should validate email format on password reset', async ({ page }) => {
    await page.goto('/password-reset');
    
    // Test invalid email
    await page.fill('[data-testid="email-input"]', 'invalid-email');
    await page.click('[data-testid="send-reset-button"]');
    
    await expect(page.locator('[data-testid="email-error"]')).toContainText('valid email');
    
    // Test valid email
    await page.fill('[data-testid="email-input"]', 'user@example.com');
    await page.click('[data-testid="send-reset-button"]');
    
    await expect(page.locator('[data-testid="reset-email-sent"]')).toBeVisible();
  });

  test('should handle non-existent email gracefully', async ({ page }) => {
    await page.goto('/password-reset');
    
    await page.fill('[data-testid="email-input"]', 'nonexistent@example.com');
    await page.click('[data-testid="send-reset-button"]');
    
    // Should show generic success message for security (don't reveal if email exists)
    await expect(page.locator('[data-testid="reset-email-sent"]')).toBeVisible();
    await expect(page.locator('[data-testid="reset-email-sent"]')).toContainText('If an account with that email exists');
  });

  test('should validate password reset token', async ({ page }) => {
    // Test with invalid token
    await page.goto('/password-reset/invalid-token-123');
    
    await expect(page.locator('[data-testid="invalid-token-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="invalid-token-message"]')).toContainText('invalid or expired');
  });

  test('should allow password reset with valid token', async ({ page }) => {
    // Mock a valid reset scenario
    // In real implementation, this would use a test user with a valid reset token
    await page.addInitScript(() => {
      window.localStorage.setItem('test-reset-token', 'valid-token-123');
    });
    
    await page.goto('/password-reset/valid-token-123');
    
    // Should show password reset form
    await expect(page.locator('[data-testid="new-password-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="confirm-password-input"]')).toBeVisible();
    
    // Test password validation
    await page.fill('[data-testid="new-password-input"]', '123');
    await page.fill('[data-testid="confirm-password-input"]', '123');
    await page.click('[data-testid="reset-password-button"]');
    
    await expect(page.locator('[data-testid="password-error"]')).toContainText('at least 8 characters');
    
    // Test password confirmation mismatch
    await page.fill('[data-testid="new-password-input"]', 'NewSecurePassword123!');
    await page.fill('[data-testid="confirm-password-input"]', 'DifferentPassword123!');
    await page.click('[data-testid="reset-password-button"]');
    
    await expect(page.locator('[data-testid="password-mismatch-error"]')).toContainText('Passwords do not match');
    
    // Test successful password reset
    await page.fill('[data-testid="new-password-input"]', 'NewSecurePassword123!');
    await page.fill('[data-testid="confirm-password-input"]', 'NewSecurePassword123!');
    await page.click('[data-testid="reset-password-button"]');
    
    await expect(page.locator('[data-testid="password-reset-success"]')).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('should prevent token reuse', async ({ page }) => {
    // Mock scenario where token was already used
    await page.goto('/password-reset/already-used-token');
    
    await expect(page.locator('[data-testid="token-already-used"]')).toBeVisible();
    await expect(page.locator('[data-testid="request-new-reset"]')).toBeVisible();
  });

  test('should handle expired tokens', async ({ page }) => {
    // Mock expired token scenario
    await page.goto('/password-reset/expired-token-123');
    
    await expect(page.locator('[data-testid="token-expired"]')).toBeVisible();
    await expect(page.locator('[data-testid="request-new-reset"]')).toBeVisible();
    
    // Test requesting new reset from expired token page
    await page.click('[data-testid="request-new-reset"]');
    await expect(page).toHaveURL('/password-reset');
  });

  test('should rate limit password reset requests', async ({ page }) => {
    await page.goto('/password-reset');
    
    // Send multiple reset requests rapidly
    for (let i = 0; i < 5; i++) {
      await page.fill('[data-testid="email-input"]', `user${i}@example.com`);
      await page.click('[data-testid="send-reset-button"]');
      await page.waitForTimeout(100);
    }
    
    // Should show rate limit message
    await expect(page.locator('[data-testid="rate-limit-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="rate-limit-message"]')).toContainText('too many requests');
  });

  test('should validate password strength requirements', async ({ page }) => {
    await page.goto('/password-reset/valid-token-123');
    
    // Test various password strength scenarios
    const weakPasswords = [
      'password',
      '12345678',
      'Password',
      'password123'
    ];
    
    for (const password of weakPasswords) {
      await page.fill('[data-testid="new-password-input"]', password);
      await page.click('[data-testid="reset-password-button"]');
      
      await expect(page.locator('[data-testid="password-strength-error"]')).toBeVisible();
      await page.fill('[data-testid="new-password-input"]', '');
    }
    
    // Test strong password
    await page.fill('[data-testid="new-password-input"]', 'StrongPassword123!@#');
    await page.fill('[data-testid="confirm-password-input"]', 'StrongPassword123!@#');
    
    await expect(page.locator('[data-testid="password-strength-indicator"]')).toContainText('Strong');
  });

  test('should handle network errors gracefully', async ({ page }) => {
    // Mock network failure
    await page.route('**/api/password-reset', route => route.abort());
    
    await page.goto('/password-reset');
    await page.fill('[data-testid="email-input"]', 'user@example.com');
    await page.click('[data-testid="send-reset-button"]');
    
    await expect(page.locator('[data-testid="network-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="retry-button"]')).toBeVisible();
  });
});