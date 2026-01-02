ts

/**
 * @file tests/bun/helpers/auth.ts
 * @description Real authentication actions against the running server.
 */

import { testFixtures } from './testSetup';
import { getApiBaseUrl } from './server';

const BASE_URL = getApiBaseUrl();

// ✅ Shared integration-test header
const TEST_HEADERS = {
	'x-integration-test': 'true'
};

// Internal helper using FormData (Browser-like behavior)
async function login(email: string, password: string): Promise<string> {
	const formData = new FormData();
	formData.append('email', email);
	formData.append('password', password);

	const response = await fetch(`${BASE_URL}/api/user/login`, {
		method: 'POST',
		headers: TEST_HEADERS, // ✅ FIX HERE
		body: formData
	});

	if (!response.ok) {
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

/**
 * Creates test users via the API.
 * Idempotent: Ignores "Duplicate" errors so tests can re-run.
 */
export async function createTestUsers(): Promise<void> {
	const users = [testFixtures.users.admin, testFixtures.users.editor];
	let adminCookie: string | undefined;

	for (const [i, user] of users.entries()) {
		const formData = new FormData();
		formData.append('email', user.email);
		formData.append('password', user.password);
		formData.append('confirmPassword', user.confirmPassword);
		formData.append('role', user.role);
		if (user.username) formData.append('username', user.username);

		const headers: Record<string, string> = {
			...TEST_HEADERS // ✅ FIX HERE
		};

		// Admin auth required for second user
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
			if (!text.toLowerCase().includes('duplicate') && !text.toLowerCase().includes('exists')) {
				console.warn(`Failed to create ${user.role}: ${res.status} ${text}`);
			}
		}

		if (i === 0) {
			try {
				adminCookie = await loginAsAdmin();
			} catch {}
		}
	}
}

/**
 * Clean Setup Helper
 */
export async function prepareAuthenticatedContext(): Promise<string> {
	await createTestUsers();
	return await loginAsAdmin();
}
