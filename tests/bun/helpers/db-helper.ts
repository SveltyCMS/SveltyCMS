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
 * NOTE: This requires a specific endpoints to be enabled in your CMS
 * or for the 'seed-test-db.ts' script to be run via shell.
 * * Since we can't drop the DB via a standard API call for security,
 * this function logs a warning to ensure the developer knows to clean the DB externally.
 */
export async function dropDatabase(): Promise<void> {
	// In CI, the container is fresh.
	// In Local, we rely on scripts/seed-test-db.ts
	console.log("ℹ️ Database cleanup should be handled by 'bun run scripts/seed-test-db.ts' before tests.");
}
