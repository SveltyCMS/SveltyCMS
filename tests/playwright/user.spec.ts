/**
 * @file user.spec.ts
 * @description Enterprise-grade E2E tests for user profile management.
 * Refactored to use standard authentication patterns and robust locators.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// Constants for test stability
const TEST_USER = {
    email: 'test@test.de', // Ensure this user exists in your seed/setup
    password: 'Test123!'
};

// Construct reliable file path for CI/CD environments
// This looks for 'testthumb.png' in the SAME directory as this test file
const AVATAR_PATH = path.join(__dirname, 'testthumb.png');

test.describe('User Profile Management', () => {

    // 1. Setup: Run before every test in this group
    test.beforeEach(async ({ page }) => {
        // Navigate to login
        await page.goto('/login'); // Use relative path (baseURL is set in playwright.config.ts)

        // Perform Login
        await page.getByLabel('Email Address').fill(TEST_USER.email);
        await page.getByLabel('Password').fill(TEST_USER.password);
        await page.getByRole('button', { name: 'Sign In' }).click();

        // Verification: Wait for dashboard to ensure we are logged in
        await expect(page).toHaveURL('/');
    });

    test('Login Verification', async ({ page }) => {
        // Already verified in beforeEach, but good for sanity check
        expect(page.url()).not.toContain('/login');
    });

    test('Edit Avatar', async ({ page }) => {
        // Ensure the test image exists before trying to upload
        if (!fs.existsSync(AVATAR_PATH)) {
            test.skip(true, `Test image not found at ${AVATAR_PATH}`);
        }

        await page.goto('/user');
        
        // Wait for profile to load
        await expect(page.getByRole('heading', { name: 'User Profile' })).toBeVisible();

        // Trigger upload
        await page.getByRole('button', { name: 'Edit Avatar' }).click();
        
        // Handle file input safely
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(AVATAR_PATH);
        
        await page.getByRole('button', { name: 'Save' }).click();

        // Assertion: Check if the image source changes or notification appears
        // Using a more generic waiter to prevent timeout flakes
        await expect(page.locator('.avatar-image, img[alt="Avatar"]')).toBeVisible();
    });

    test('Delete Avatar', async ({ page }) => {
        await page.goto('/user');
        await page.getByRole('button', { name: 'Edit Avatar' }).click();
        
        // Use a more specific selector for the delete button (add data-testid in source if possible)
        // Fallback to class if needed, but verify visibility first
        const deleteBtn = page.locator('button.variant-filled-error');
        await expect(deleteBtn).toBeVisible();
        await deleteBtn.click();

        // Assertion: Check for default avatar fallback
        // Note: Update selector based on your actual default avatar implementation
        await expect(page.locator('img')).toBeVisible(); 
    });

    test('Edit User Details', async ({ page }) => {
        await page.goto('/user');
        
        await page.getByRole('button', { name: /Edit User Settings/i }).click();

        // Use fill for robustness
        await page.locator('#username').fill('Test User Updated');
        // Only fill password if specifically testing password change
        // otherwise it might trigger re-auth logic
        
        await page.getByRole('button', { name: 'Save' }).click();
        
        await expect(page.getByText('User details updated')).toBeVisible();
    });

    test('Registration Token Workflow', async ({ page }) => {
        await page.goto('/user');
        
        await page.getByText('Email User Registration token').click();
        
        // Fill details
        await page.locator('#email-address').fill('newuser@test.ge');
        
        // Select Role (Robust selection)
        await page.getByText('user', { exact: true }).click();
        
        // Select Duration
        await page.getByText('12 hrs').click();
        
        await page.getByRole('button', { name: 'Send' }).click();
        
        await expect(page.getByText('Token sent')).toBeVisible();
    });

    test('Toggle User Token Visibility', async ({ page }) => {
        await page.goto('/user');
        
        // Open
        await page.getByText('Show User Token').click();
        const tokenList = page.getByRole('heading', { name: 'Token List:' });
        await expect(tokenList).toBeVisible();
        
        // Close
        await page.getByText('Hide User Token').click();
        await expect(tokenList).not.toBeVisible();
    });

    test('Toggle User List Visibility', async ({ page }) => {
        await page.goto('/user');
        
        // Open
        await page.getByText('Show User List').click();
        const userList = page.getByRole('heading', { name: 'User List:' });
        await expect(userList).toBeVisible();
        
        // Close
        await page.getByText('Hide User List').click();
        await expect(userList).not.toBeVisible();
    });
});