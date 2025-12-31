/**
 * @file tests/bun/helpers/db-helper.ts
 * @description Verification helpers that check the REAL server state via API.
 * Replaces unreliable in-memory mocks.
 */
import { getApiBaseUrl } from './server';
import { loginAsAdmin } from './auth';

const BASE_URL = getApiBaseUrl();

/**
 * Checks if a user exists by querying the Admin API.
 * Requires a working Admin login.
 */
export async function userExists(email: string): Promise<boolean> {
	try {
		const cookie = await loginAsAdmin();

		// Use the user listing endpoint to find the user
		const response = await fetch(`${BASE_URL}/api/user/batch`, {
			method: 'POST',
			headers: {
				Cookie: cookie,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				operation: 'list',
				limit: 100 // Assume test DB is small
			})
		});

		if (!response.ok) return false;

		const result = await response.json();
		const users = result.data || [];

		return users.some((u: any) => u.email === email);
	} catch (e) {
		console.warn('Could not verify user existence via API:', e);
		return false;
	}
}

/**
 * Gets a specific user by email.
 */
export async function getUser(email: string): Promise<any> {
	try {
		const cookie = await loginAsAdmin();
		const response = await fetch(`${BASE_URL}/api/user/batch`, {
			method: 'POST',
			headers: {
				Cookie: cookie,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ operation: 'list', limit: 100 })
		});

		const result = await response.json();
		const users = result.data || [];
		return users.find((u: any) => u.email === email);
	} catch {
		return null;
	}
}

/**
 * Gets the total user count via API
 */
export async function getUserCount(): Promise<number> {
	try {
		const cookie = await loginAsAdmin();
		const response = await fetch(`${BASE_URL}/api/user/batch`, {
			method: 'POST',
			headers: {
				Cookie: cookie,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ operation: 'list' })
		});

		const result = await response.json();
		return (result.data || []).length;
	} catch {
		return 0;
	}
}

/**
 * Drops the database.
 */
export async function dropDatabase(): Promise<void> {
	console.log("ℹ️ Database cleanup should be handled by 'bun run scripts/seed-test-db.ts' before tests.");
}

/**
 * Polling helper that waits for a condition to be met.
 */
export async function waitFor(callback: () => Promise<boolean>, timeout: number = 5000): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		if (await callback()) return true;
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
	return false;
}
