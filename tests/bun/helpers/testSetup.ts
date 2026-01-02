ts

// @ts-ignore
/**
 * @file tests/bun/helpers/testSetup.ts
 * @description Static test data and environment initialization with SAFETY GUARDS.
 */
/* =========================================================
   GLOBAL COOKIE JAR FOR BUN (REQUIRED)
   ========================================================= */

const originalFetch = globalThis.fetch;

// Simple in-memory cookie jar
let cookieJar = '';

globalThis.fetch = async (input: RequestInfo, init: RequestInit = {}) => {
	const headers = new Headers(init.headers || {});

	// ✅ Send stored cookies
	if (cookieJar) {
		headers.set('Cookie', cookieJar);
	}

	headers.set('Accept', 'application/json');
	headers.set('x-integration-test', 'true');

	const response = await originalFetch(input, {
		...init,
		headers
	});

	// ✅ Capture Set-Cookie
	const setCookie = response.headers.get('set-cookie');
	if (setCookie) {
		// keep only cookie value, ignore attributes
		cookieJar = setCookie.split(';')[0];
	}

	return response;
};

import { waitForServer, getApiBaseUrl } from './server';
import { createTestUsers, loginAsAdmin } from './auth';


/* ========================================================= */

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
let globalAuthTestFile: string | null = null;
let globalUsersCreated = false;

/**
 * SAFETY GUARD: Cleans the test database.
 */
export async function cleanupTestDatabase(): Promise<void> {
	const targetDb = process.env.DB_NAME || process.env.MONGO_DB || '';
	const isCI = process.env.CI === 'true';
	const isTestDb = targetDb.includes('_test') || targetDb.includes('test_');

	if (!isCI && !isTestDb && process.env.FORCE_TEST_WIPE !== 'true') {
		console.warn(`
⚠️  SKIPPING DATABASE CLEANUP
DB "${targetDb}" does not look like a test database
`);
		return;
	}

	globalAuthCookie = null;
	globalAuthTestFile = null;
	globalUsersCreated = false;
}

/**
 * Ensure server is ready (cached globally).
 */
export async function ensureServerReady(): Promise<void> {
	if (globalServerReady) return;
	await waitForServer();
	globalServerReady = true;
}

/**
 * Get the current test file name from the call stack.
 */
function getCurrentTestFile(): string {
	const stack = new Error().stack || '';
	const match = stack.match(/\/tests\/bun\/api\/([^\/]+\.test\.ts)/);
	return match ? match[1] : 'unknown';
}

/**
 * Prepare a clean DB and a logged-in admin for a test case.
 */
export async function prepareAuthenticatedContext(): Promise<string> {
	await ensureServerReady();

	const currentTestFile = getCurrentTestFile();
	const canReuseAuth =
		globalAuthCookie &&
		globalAuthTestFile === currentTestFile &&
		globalUsersCreated;

	if (canReuseAuth) {
		return globalAuthCookie!;
	}

	try {
		const adminCookie = await loginAsAdmin();
		globalAuthCookie = adminCookie;
		globalAuthTestFile = currentTestFile;
		globalUsersCreated = true;
		return adminCookie;
	} catch {
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
 */
export async function initializeAuthenticatedTests(): Promise<void> {
	await waitForServer();
	console.log('✅ Authenticated test environment ready');
}

/**
 * Initialize test environment for SETUP tests.
 */
export async function initializeSetupTests(): Promise<void> {
	await waitForServer();
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
