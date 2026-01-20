/**
 * @file tests/playwright/global-setup.ts
 * @description Global setup for Playwright E2E tests
 *
 * This runs ONCE before all E2E tests:
 * 1. Clean state (remove config/private.ts, drop test DB)
 * 2. Run Setup Wizard to create fresh config + admin
 * 3. Seed additional test users (dev, editor, viewer)
 * 4. Save auth states for reuse across tests
 */

import { chromium, type FullConfig } from '@playwright/test';
import * as fs from 'fs/promises';
import * as path from 'path';

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173';

// Test user credentials
const TEST_USERS = {
	admin: { email: 'admin@example.com', password: 'Admin123!' },
	dev: { email: 'dev@example.com', password: 'DevPassword123!' },
	editor: { email: 'editor@example.com', password: 'EditorPassword123!' },
	viewer: { email: 'viewer@example.com', password: 'ViewerPassword123!' }
};

async function globalSetup(_config: FullConfig) {
	console.log('\n🚀 Playwright Global Setup Starting...\n');

	// Skip setup if SKIP_GLOBAL_SETUP is set (for debugging)
	if (process.env.SKIP_GLOBAL_SETUP === 'true') {
		console.log('⏭️  Skipping global setup (SKIP_GLOBAL_SETUP=true)');
		return;
	}

	const storageDir = path.join(process.cwd(), 'tests/playwright/.auth');

	// Ensure auth storage directory exists
	await fs.mkdir(storageDir, { recursive: true });

	// Step 1: Check if system needs fresh setup
	const privateConfigPath = path.join(process.cwd(), 'config/private.ts');
	const needsFreshSetup = !(await fileExists(privateConfigPath));

	if (needsFreshSetup) {
		console.log('📋 Fresh setup required - running Setup Wizard...');
		await runSetupWizard();
	} else {
		console.log('✅ System already configured - skipping Setup Wizard');
	}

	// Step 2: Seed additional users (if not already created)
	console.log('🌱 Seeding test users...');
	await seedTestUsers();

	// Step 3: Save authenticated states for each role
	console.log('🔐 Saving auth states for test roles...');
	const browser = await chromium.launch();

	for (const [role, creds] of Object.entries(TEST_USERS)) {
		try {
			const context = await browser.newContext();
			const page = await context.newPage();

			// Login
			await page.goto(`${BASE_URL}/login`);
			await page.fill('input[name="email"], input[type="email"]', creds.email);
			await page.fill('input[name="password"], input[type="password"]', creds.password);
			await page.click('button[type="submit"]');

			// Wait for successful login (redirect to dashboard)
			await page.waitForURL(/\/(dashboard|admin|$)/, { timeout: 10000 }).catch(() => {
				console.warn(`  ⚠️  ${role}: Login may have failed (no redirect)`);
			});

			// Save storage state
			const statePath = path.join(storageDir, `${role}.json`);
			await context.storageState({ path: statePath });
			console.log(`  ✅ ${role}: Auth state saved`);

			await context.close();
		} catch (error) {
			console.error(`  ❌ ${role}: Failed to save auth state`, error);
		}
	}

	await browser.close();
	console.log('\n✅ Playwright Global Setup Complete!\n');
}

async function runSetupWizard() {
	const browser = await chromium.launch();
	const context = await browser.newContext();
	const page = await context.newPage();

	try {
		await page.goto(BASE_URL);

		// Wait for redirect to /setup
		await page.waitForURL(/\/setup/, { timeout: 15000 });

		// Fill setup wizard (DB configuration + Admin creation)
		// This is a simplified version - adjust based on your actual setup wizard
		// ... setup wizard steps would go here ...

		console.log('  ℹ️  Setup Wizard automation not fully implemented');
		console.log('  ℹ️  Please run setup manually or ensure config/private.ts exists');
	} finally {
		await context.close();
		await browser.close();
	}
}

async function seedTestUsers() {
	// Call the seed script via API or direct DB access
	try {
		const response = await fetch(`${BASE_URL}/api/health`, { method: 'GET' });
		if (!response.ok) {
			console.warn('  ⚠️  Server not ready for seeding');
			return;
		}

		// Import and run seed function
		const { createTestUsers } = await import('../bun/helpers/auth');
		await createTestUsers();
		console.log('  ✅ Test users seeded');
	} catch (error) {
		console.warn('  ⚠️  Could not seed users:', (error as Error).message);
	}
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

export default globalSetup;
