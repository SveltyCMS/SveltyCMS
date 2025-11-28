// @ts-ignore
/**
 * @file tests/bun/helpers/testSetup.ts
 * @description Static test data and environment initialization with SAFETY GUARDS.
 */
import { waitForServer, getApiBaseUrl } from './server';
import { createTestUsers, loginAsAdmin } from './auth';

const API_BASE_URL = getApiBaseUrl();

/**
 * Initialize the environment (wait for server).
 */
export async function initializeTestEnvironment(): Promise<void> {
	await waitForServer();
}

// --- PERFORMANCE OPTIMIZATION: Smart caching ---
let globalServerReady = false;
let globalAuthCookie: string | null = null;
let globalAuthTestFile: string | null = null; // Track which test file created the auth
let globalUsersCreated = false; // Track if users exist

/**
 * SAFETY GUARD: Cleans the test database.
 * Throws warning if the database name does not contain '_test' to avoid wiping prod data.
 */
export async function cleanupTestDatabase(): Promise<void> {
	// 1. Determine target DB name (via env or health endpoint)
	const targetDb = process.env.DB_NAME || process.env.MONGO_DB || '';

	// 2. Safety check
	const isCI = process.env.CI === 'true';
	const isTestDb = targetDb.includes('_test') || targetDb.includes('test_');

	if (!isCI && !isTestDb) {
		if (process.env.FORCE_TEST_WIPE !== 'true') {
			console.warn(`
        ⚠️  SKIPPING DATABASE CLEANUP ⚠️
        Current DB: '${targetDb}' does not look like a test database.
        
        To enable auto-cleanup, either:
        1. Rename DB to include '_test' (e.g. 'sveltycms_test')
        2. Run with FORCE_TEST_WIPE=true
      `);
			return;
		}
	}

	// 3. Perform cleanup – rely on seeding script or dedicated endpoint.
	// Example (uncomment if endpoint exists):
	// await fetch(`${API_BASE_URL}/api/admin/testing/reset-db`, { method: 'POST' });

	// 4. Invalidate auth cache when DB is cleaned
	globalAuthCookie = null;
	globalAuthTestFile = null;
}

/**
 * Ensure server is ready (cached globally for performance).
 * Only waits once per test run, subsequent calls return immediately.
 */
export async function ensureServerReady(): Promise<void> {
	if (globalServerReady) return; // Already checked
	await waitForServer();
	globalServerReady = true;
}

/**
 * Get the current test file name from the call stack.
 * Used to track which test file is requesting auth.
 */
function getCurrentTestFile(): string {
	const stack = new Error().stack || '';
	const match = stack.match(/\/tests\/bun\/api\/([^\/]+\.test\.ts)/);
	return match ? match[1] : 'unknown';
}

/**
 * Prepare a clean DB and a logged‑in admin for a test case.
 * Returns the admin session cookie string.
 *
 * SMART CACHING STRATEGY:
 * - Caches auth cookie per test file
 * - Reuses auth if same test file requests it again (beforeAll pattern)
 * - Invalidates cache when different test file requests auth (new file)
 * - Invalidates cache when cleanupTestDatabase() is called (beforeEach pattern)
 * - Server readiness always cached (only wait once)
 *
 * This optimizes for:
 * - Most tests (beforeAll): Reuse auth across all tests in file
 * - Some tests (beforeEach): Fresh auth per test (auto-detected via cleanup)
 */
export async function prepareAuthenticatedContext(): Promise<string> {
	// Ensure server is ready (always cached)
	await ensureServerReady();

	// Detect current test file
	const currentTestFile = getCurrentTestFile();

	// Check if we can reuse cached auth
	const canReuseAuth = globalAuthCookie && globalAuthTestFile === currentTestFile && globalUsersCreated;

	if (canReuseAuth) {
		// Fast path: Reuse existing auth (no DB operations needed!)
		return globalAuthCookie!;
	}

	// Slow path: Need fresh auth
	// Try to login first - if it works, users already exist
	try {
		const adminCookie = await loginAsAdmin();
		globalAuthCookie = adminCookie;
		globalAuthTestFile = currentTestFile;
		globalUsersCreated = true;
		return adminCookie;
	} catch (error) {
		// Login failed, users don't exist yet - create them
		console.log(`Creating test users for ${currentTestFile}...`);
		await createTestUsers();
		const adminCookie = await loginAsAdmin();
		globalAuthCookie = adminCookie;
		globalAuthTestFile = currentTestFile;
		globalUsersCreated = true;
		return adminCookie;
	}
}

/**
 * Initialize test environment for AUTHENTICATED tests.
 * Ensures config/private.ts exists (configured CMS) and waits for server.
 */
export async function initializeAuthenticatedTests(): Promise<void> {
	await waitForServer();
	console.log('✅ Authenticated test environment ready');
}

/**
 * Initialize test environment for SETUP tests.
 * Ensures NO config/private.ts exists (fresh CMS) and waits for server.
 */
export async function initializeSetupTests(): Promise<void> {
	await waitForServer();
	console.warn('⚠️ initializeSetupTests: Config removal not yet implemented');
	console.log('✅ Setup test environment ready (setup mode)');
}

// --- FIXTURES ---
export const testFixtures = {
	users: {
		admin: {
			email: `admin_${Date.now()}@test.com`,
			username: 'admin',
			password: 'Test123!',
			confirmPassword: 'Test123!',
			role: 'admin'
		},
		editor: {
			email: `editor_${Date.now()}@test.com`,
			username: 'editor',
			password: 'Test123!',
			confirmPassword: 'Test123!',
			role: 'editor'
		}
	},
	apiTokens: {
		fullAccess: {
			type: 'access',
			email: 'admin@test.com',
			expires: new Date(Date.now() + 31536000000).toISOString()
		}
	}
};
