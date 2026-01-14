/**
 * @file tests/bun/helpers/auth.ts
 * @description Real authentication actions against the running server.
 * Provides functions to:
 * - Login as admin/editor
 * - Create test users
 * - Prepare authenticated context
 *
 */
import { testFixtures } from './testSetup';
import { getApiBaseUrl } from './server';

const BASE_URL = getApiBaseUrl();

// Internal helper using FormData (Browser-like behavior)
async function login(email: string, password: string): Promise<string> {
	const formData = new FormData();
	formData.append('email', email);
	formData.append('password', password);

	const response = await fetch(`${BASE_URL}/api/user/login`, {
		method: 'POST',
		body: formData
	});

	if (!response.ok) {
		// Fallback for debugging
		const text = await response.text();
		throw new Error(`Login failed (${response.status}): ${text.substring(0, 100)}...`);
	}

	const cookie = response.headers.get('set-cookie');
	if (!cookie) throw new Error(`Login successful but no cookie returned for ${email}`);
	return cookie;
}

export async function loginAsAdmin(): Promise<string> {
	return login(testFixtures.users.admin.email, testFixtures.users.admin.password);
}

export async function loginAsEditor(): Promise<string> {
	return login(testFixtures.users.editor.email, testFixtures.users.editor.password);
}

export async function loginAsViewer(): Promise<string> {
	return login(testFixtures.users.viewer.email, testFixtures.users.viewer.password);
}

/**
 * Creates test users via the API.
 * Idempotent: Ignores "Duplicate" errors so tests can re-run.
 * 
 * In CI mode (CI=true), creates admin + editor + viewer.
 * In local mode, creates only admin + editor (for backward compatibility).
 */
export async function createTestUsers(): Promise<void> {
	const IS_CI = process.env.CI === 'true';
	const users = IS_CI 
		? [testFixtures.users.admin, testFixtures.users.editor, testFixtures.users.viewer]
		: [testFixtures.users.admin, testFixtures.users.editor];
	let adminCookie: string | undefined;

	for (const [i, user] of users.entries()) {
		const formData = new FormData();
		formData.append('email', user.email);
		formData.append('password', user.password);
		formData.append('confirmPassword', user.confirmPassword);
		formData.append('role', user.role);
		if (user.username) formData.append('username', user.username);

		const headers: Record<string, string> = {};
		// The first user (Admin) is created publicly. Subsequent users need Admin auth.
		if (i > 0 && adminCookie) {
			headers['Cookie'] = adminCookie;
		}

		const res = await fetch(`${BASE_URL}/api/user/createUser`, {
			method: 'POST',
			headers,
			body: formData
		});

		if (!res.ok) {
			const text = await res.text();
			// Only throw if it's NOT a "User already exists" error
			if (!text.toLowerCase().includes('duplicate') && !text.toLowerCase().includes('exists')) {
				console.warn(`Failed to create ${user.role}: ${res.status} ${text}`);
			}
		}

		// After creating admin, log in so we can create the editor and viewer
		if (i === 0) {
			try {
				adminCookie = await loginAsAdmin();
			} catch {}
		}
	}
}

/**
 * Clean Setup Helper: Use this in beforeAll()
 */
export async function prepareAuthenticatedContext(): Promise<string> {
	await createTestUsers();
	return await loginAsAdmin();
}
