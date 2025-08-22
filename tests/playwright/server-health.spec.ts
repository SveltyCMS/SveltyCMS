/**
 * @file tests/playwright/server-health.spec.ts
 * @description Simple diagnostic test to check if the SvelteKit server is responding correctly
 */
import { test, expect } from '@playwright/test';

test.describe('Server Health Check', () => {
	test('should check if server is responding', async ({ page }) => {
		console.log('Testing server health...');
		
		// Try to access the home page first
		try {
			const homeResponse = await page.goto('/', { 
				waitUntil: 'domcontentloaded',
				timeout: 30000 
			});
			console.log(`Home page status: ${homeResponse?.status()}`);
			if (homeResponse && homeResponse.status() !== 200) {
				const responseText = await homeResponse.text();
				console.log(`Home page error: ${responseText}`);
			}
		} catch (error) {
			console.log(`Home page failed: ${error.message}`);
		}

		// Try to access the login page
		try {
			const loginResponse = await page.goto('/login', { 
				waitUntil: 'domcontentloaded',
				timeout: 30000 
			});
			console.log(`Login page status: ${loginResponse?.status()}`);
			if (loginResponse && loginResponse.status() !== 200) {
				const responseText = await loginResponse.text();
				console.log(`Login page error: ${responseText}`);
			}
		} catch (error) {
			console.log(`Login page failed: ${error.message}`);
		}

		// Check if the page loads at all
		await expect(page).toHaveURL(/.*\/login/);
	});

	test('should capture console errors', async ({ page }) => {
		const errors: string[] = [];
		
		page.on('console', msg => {
			if (msg.type() === 'error') {
				errors.push(msg.text());
				console.log(`Browser console error: ${msg.text()}`);
			}
		});

		page.on('pageerror', error => {
			errors.push(error.message);
			console.log(`Page error: ${error.message}`);
		});

		try {
			await page.goto('/login', { timeout: 30000 });
		} catch (error) {
			console.log(`Navigation error: ${error.message}`);
		}

		console.log(`Total errors captured: ${errors.length}`);
		errors.forEach((error, index) => {
			console.log(`Error ${index + 1}: ${error}`);
		});
	});
});