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

// Internal helper using JSON (avoids CSRF protection issues with FormData)
async function login(email: string, password: string): Promise<string> {
	const response = await fetch(`${BASE_URL}/api/user/login`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Origin: BASE_URL
		},
		body: JSON.stringify({ email, password })
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

export async function loginAsDeveloper(): Promise<string> {
	return login(testFixtures.users.developer.email, testFixtures.users.developer.password);
}

/**
 * Creates test users via the API.
 * Idempotent: Ignores "Duplicate" errors so tests can re-run.
 */
export async function createTestUsers(): Promise<void> {
	const users = [testFixtures.users.admin, testFixtures.users.developer, testFixtures.users.editor];

	// In CI environments (or if explicitly requested), add the viewer user
	if (process.env.CI === 'true') {
		users.push(testFixtures.users.viewer);
	}

	let adminCookie: string | undefined;

	for (const [i, user] of users.entries()) {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			Origin: BASE_URL
		};
		// The first user (Admin) is created publicly. Subsequent users need Admin auth.
		if (i > 0 && adminCookie) {
			headers['Cookie'] = adminCookie;
		}

		const res = await fetch(`${BASE_URL}/api/user/createUser`, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				email: user.email,
				password: user.password,
				confirmPassword: user.confirmPassword,
				role: user.role,
				username: user.username
			})
		});

		if (!res.ok) {
			const text = await res.text();
			// Only throw if it's NOT a "User already exists" error
			if (!text.toLowerCase().includes('duplicate') && !text.toLowerCase().includes('exists')) {
				console.warn(`Failed to create ${user.role}: ${res.status} ${text}`);
			}
		}

		// After creating admin, log in so we can create the editor
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
