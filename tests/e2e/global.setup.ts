/**
 * @file tests/e2e/global.setup.ts
 * @description Playwright global setup — initialises the test database via API calls.
 *
 * Handles two scenarios:
 *   A) Fresh run: private.test.ts has empty values → seedDatabase writes config + seeds DB
 *   B) Repeat run: private.test.ts already has valid values → seedDatabase returns 403
 *      In both cases completeSetup creates/refreshes the admin session.
 *
 * Must run with TEST_MODE=true so the server reads/writes config/private.test.ts.
 */

import { request, test as setup } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173';

const dbType = process.env.DB_TYPE || 'sqlite';

// buildDatabaseConnectionString (utils.ts) for SQLite builds `{host}/{name}`.
// host='.' gives path './{name}' relative to process CWD.
const DB_CONFIG = {
	type: dbType,
	host: process.env.DB_HOST || (dbType === 'sqlite' ? '.' : 'localhost'),
	port: Number(process.env.DB_PORT) || (dbType === 'mariadb' ? 3306 : dbType === 'postgresql' ? 5432 : 27017),
	name: process.env.DB_NAME || (dbType === 'sqlite' ? 'sveltycms-test.db' : 'sveltycms_test'),
	user: process.env.DB_USER || (dbType === 'sqlite' ? '' : 'test'),
	password: process.env.DB_PASSWORD || (dbType === 'sqlite' ? '' : 'test')
};

const ADMIN = {
	username: process.env.ADMIN_USER || 'admin',
	email: process.env.ADMIN_EMAIL || 'admin@example.com',
	password: process.env.ADMIN_PASS || 'Admin123!'
};

setup('Initialise test database via setup API', async () => {
	const ctx = await request.newContext({
		baseURL: BASE,
		// Same-origin Origin header so SvelteKit's CSRF check passes
		extraHTTPHeaders: { Origin: BASE }
	});

	// ── 1. Seed the database (writes config/private.test.ts + creates schema) ──
	// Returns 403 if setup is already complete (private.test.ts has valid values).
	console.log(`[setup] Seeding database (type=${DB_CONFIG.type}, host=${DB_CONFIG.host}, name=${DB_CONFIG.name})...`);
	const seedResp = await ctx.post('/setup?/seedDatabase', {
		form: {
			config: JSON.stringify(DB_CONFIG),
			system: JSON.stringify({ preset: 'blank' })
		}
	});
	const seedStatus = seedResp.status();
	const seedBody = await seedResp.text();
	console.log('[setup] seedDatabase status:', seedStatus);
	console.log('[setup] seedDatabase body:', seedBody.slice(0, 400));

	if (seedStatus === 200) {
		// Seeding started — wait for critical phases (roles/settings) to complete
		console.log('[setup] Waiting for background seeding...');
		await new Promise((r) => setTimeout(r, 8000));
	} else if (seedStatus === 403) {
		// Setup is already complete (private.test.ts has valid values from a previous run).
		// The DB is already seeded; completeSetup below will refresh the admin session.
		console.log('[setup] seedDatabase blocked (403 — setup already marked complete). Proceeding to completeSetup.');
	} else {
		console.warn('[setup] seedDatabase unexpected status:', seedStatus, seedBody.slice(0, 400));
	}

	// ── 2. Complete setup (creates/refreshes admin user + session) ────────────────
	// completeSetup is always allowed (even when setup is complete) so this is idempotent.
	console.log('[setup] Completing setup...');
	const completeResp = await ctx.post('/setup?/completeSetup', {
		form: {
			data: JSON.stringify({
				database: DB_CONFIG,
				admin: {
					username: ADMIN.username,
					email: ADMIN.email,
					password: ADMIN.password,
					confirmPassword: ADMIN.password
				},
				system: {
					preset: 'blank',
					siteName: 'SveltyCMS Test',
					multiTenant: false,
					demoMode: false,
					useRedis: false,
					redisHost: 'localhost',
					redisPort: 6379,
					redisPassword: '',
					defaultContentLanguage: 'en',
					contentLanguages: ['en'],
					defaultSystemLanguage: 'en',
					systemLanguages: ['en'],
					hostProd: '',
					timezone: 'UTC',
					mediaStorageType: 'local',
					mediaFolder: 'media'
				}
			})
		}
	});
	console.log('[setup] completeSetup status:', completeResp.status());
	const completeBody = await completeResp.text();
	console.log('[setup] completeSetup body:', completeBody.slice(0, 400));

	// ── 3. Confirm server is now out of setup mode ─────────────────────────────
	await new Promise((r) => setTimeout(r, 2000));

	const homeResp = await ctx.get('/');
	const finalUrl = homeResp.url();
	console.log('[setup] Home redirect after setup:', finalUrl);

	if (finalUrl.includes('/setup')) {
		console.error('[setup] ❌ Server is still in setup mode after initialisation.');
		console.error('[setup]    Authenticated tests will fail. Check server logs.');
	} else {
		console.log('[setup] ✅ Server is in normal mode — database ready for tests.');
	}

	await ctx.dispose();
});
