ts

/**
 * @file tests/bun/helpers/auth.ts
 * @description Real authentication actions against the running server.
 *
 * IMPORTANT:
 * - Cookies are handled globally via testSetup.ts
 * - NEVER manually set Cookie headers here
 */

import { testFixtures } from './testSetup';
import { getApiBaseUrl } from './server';

const BASE_URL = getApiBaseUrl();

// --------------------------------------------------
// Internal login helper (browser-like FormData)
// --------------------------------------------------
async function login(email: string, password: string): Promise<void> {
	const formData = new FormData();
	formData.append('email', email);
	formData.append('password', password);

	const response = await fetch(`${BASE_URL}/api/user/login`, {
		method: 'POST',
		body: formData
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(
			`Login failed (${response.status}): ${text.substring(0, 120)}`
		);
	}

	// ✅ DO NOT read set-cookie here
	// Cookie is captured by global fetch patch
}

// --------------------------------------------------
// Public helpers
// --------------------------------------------------

export async function loginAsAdmin(): Promise<void> {
	await login(
		testFixtures.users.admin.email,
		testFixtures.users.admin.password
	);
}

export async function loginAsEditor(): Promise<void> {
	await login(
		testFixtures.users.editor.email,
		testFixtures.users.editor.password
	);
}

/**
 * Create test users (idempotent)
 */
export async function createTestUsers(): Promise<void> {
	const users = [
		testFixtures.users.admin,
		testFixtures.users.editor
	];

	for (const user of users) {
		const formData = new FormData();
		formData.append('email', user.email);
		formData.append('password', user.password);
		formData.append('confirmPassword', user.confirmPassword);
		formData.append('role', user.role);
		if (user.username) {
			formData.append('username', user.username);
		}

		const res = await fetch(`${BASE_URL}/api/user/createUser`, {
			method: 'POST',
			body: formData
		});

		if (!res.ok) {
			const text = await res.text();
			if (
				!text.toLowerCase().includes('duplicate') &&
				!text.toLowerCase().includes('exists')
			) {
				console.warn(
					`User creation failed (${user.role}): ${res.status} ${text}`
				);
			}
		}
	}
}

/**
 * Ensure authenticated admin context
 */
export async function prepareAuthenticatedContext(): Promise<void> {
	try {
		await loginAsAdmin();
	} catch {
		await createTestUsers();
		await loginAsAdmin();
	}
}
