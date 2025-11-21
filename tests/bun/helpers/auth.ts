/**
 * @file tests/bun/helpers/auth.ts
 * @description Authentication helpers for integration tests
 *
 * Provides functions to:
 * - Login as different user roles (admin, editor)
 * - Create API tokens for headless access
 * - Create test users with proper roles
 */

import { testFixtures } from './testSetup';
import { getApiBaseUrl } from './server';

const API_BASE_URL = getApiBaseUrl();

/**
 * Login as admin and return authentication cookies
 * @returns {Promise<string>} The authentication cookie string
 */
export async function loginAsAdmin(): Promise<string> {
	const response = await fetch(`${API_BASE_URL}/api/user/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			email: testFixtures.users.admin.email,
			password: testFixtures.users.admin.password
		})
	});

	if (!response.ok) {
		throw new Error(`Admin login failed: ${response.status} ${await response.text()}`);
	}

	const setCookieHeader = response.headers.get('set-cookie');
	if (!setCookieHeader) {
		throw new Error('No cookie returned from admin login');
	}

	return setCookieHeader;
}

/**
 * Login as editor and return authentication cookies
 * @returns {Promise<string>} The authentication cookie string
 */
export async function loginAsEditor(): Promise<string> {
	const response = await fetch(`${API_BASE_URL}/api/user/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			email: testFixtures.users.editor.email,
			password: testFixtures.users.editor.password
		})
	});

	if (!response.ok) {
		throw new Error(`Editor login failed: ${response.status} ${await response.text()}`);
	}

	const setCookieHeader = response.headers.get('set-cookie');
	if (!setCookieHeader) {
		throw new Error('No cookie returned from editor login');
	}

	return setCookieHeader;
}

/**
 * Create API access token for headless access (REST/GraphQL/GraphQL-WS)
 * These are long-lived tokens for external applications
 * @param {string} adminCookies - Admin authentication cookies
 * @param {string} userId - User ID to associate token with
 * @param {string} email - Email for the token
 * @returns {Promise<string>} The created API access token
 */
export async function createApiToken(adminCookies: string, userId: string, email: string): Promise<string> {
	// API access tokens are created directly in the database
	// They have type 'access' and are long-lived
	const tokenData = {
		user_id: userId,
		email: email,
		type: 'access',
		expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year
	};

	// Note: In a real implementation, this would call a database method directly
	// For now, we'll use a placeholder that tests can mock
	// TODO: Implement actual API endpoint for creating access tokens
	const response = await fetch(`${API_BASE_URL}/api/admin/tokens/create-access`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Cookie: adminCookies
		},
		body: JSON.stringify(tokenData)
	});

	if (!response.ok) {
		throw new Error(`API token creation failed: ${response.status} ${await response.text()}`);
	}

	const result = await response.json();
	return result.token || result.data?.token;
}

/**
 * Create all test users (admin, editor)
 * This should be called in beforeEach to ensure fresh users for each test
 * @returns {Promise<void>}
 */
export async function createTestUsers(): Promise<void> {
	// 1. Create admin user (first user, no auth needed)
	const adminResponse = await fetch(`${API_BASE_URL}/api/user/createUser`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(testFixtures.users.admin)
	});

	if (!adminResponse.ok) {
		const error = await adminResponse.text();
		// Ignore "already exists" errors
		if (!error.includes('already exists') && !error.includes('duplicate')) {
			throw new Error(`Admin user creation failed: ${adminResponse.status} ${error}`);
		}
	}

	// 2. Login as admin
	const adminCookies = await loginAsAdmin();

	// 3. Create editor user (requires admin auth)
	const editorResponse = await fetch(`${API_BASE_URL}/api/user/createUser`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Cookie: adminCookies
		},
		body: JSON.stringify(testFixtures.users.editor)
	});

	if (!editorResponse.ok) {
		const error = await editorResponse.text();
		// Ignore "already exists" errors
		if (!error.includes('already exists') && !error.includes('duplicate')) {
			throw new Error(`Editor user creation failed: ${editorResponse.status} ${error}`);
		}
	}
}

/**
 * Create test API tokens for headless access testing
 * @param {string} adminCookies - Admin authentication cookies
 * @returns {Promise<{fullAccess: string, readOnly: string}>} Created tokens
 */
export async function createTestApiTokens(adminCookies: string): Promise<{
	fullAccess: string;
	readOnly: string;
}> {
	// Get admin user ID first
	const adminUser = await fetch(`${API_BASE_URL}/api/user/batch`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
		body: JSON.stringify({ operation: 'list', limit: 1 })
	});
	const adminData = await adminUser.json();
	const adminUserId = adminData.data?.[0]?._id || 'admin-id';

	// Create access tokens (placeholder - will be mocked in tests)
	const fullAccessToken = 'test-full-access-token-' + Date.now();
	const readOnlyToken = 'test-read-only-token-' + Date.now();

	return {
		fullAccess: fullAccessToken,
		readOnly: readOnlyToken
	};
}
