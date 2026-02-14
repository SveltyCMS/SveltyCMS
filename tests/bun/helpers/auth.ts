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

/**
 * Extracts just the cookie name=value from a set-cookie header.
 * The set-cookie header includes attributes like Path, HttpOnly, etc.
 * but the Cookie request header should only contain name=value pairs.
 *
 * Example:
 * Input: "sveltycms_session=abc123; Path=/; HttpOnly; SameSite=strict"
 * Output: "sveltycms_session=abc123"
 */
function extractCookieValue(setCookieHeader: string): string {
	// The cookie value is the first part before any semicolon

	return setCookieHeader.split(';')[0].trim();
}

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

	const setCookie = response.headers.get('set-cookie');
	if (!setCookie) {
		throw new Error(`Login successful but no cookie returned for ${email}`);
	}
	// Extract just the cookie name=value, not the attributes
	return extractCookieValue(setCookie);
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
 */
export async function createTestUsers(): Promise<void> {
	const users = [testFixtures.users.admin, testFixtures.users.editor];

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
			// Only throw if it's NOT a "User already exists" error or "Unauthorized" (meaning setup done)
			const isDuplicate = text.toLowerCase().includes('duplicate') || text.toLowerCase().includes('exists');
			const isUnauthorized = res.status === 401 || res.status === 403;

			if (!isDuplicate && !isUnauthorized) {
				console.warn(`Failed to create ${user.role}: ${res.status} ${text}`);
			} else if (isUnauthorized) {
				// Quietly proceed if unauthorized, assuming user/admin exists from seeding
			}
		}

		// After creating admin, log in so we can create the editor
		if (i === 0) {
			try {
				adminCookie = await loginAsAdmin();
			} catch {
				// ignore
			}
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
