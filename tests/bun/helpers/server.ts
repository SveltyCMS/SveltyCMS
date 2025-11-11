/**
 * @file tests/bun/helpers/server.ts
 * @description Helper utilities for waiting on the SvelteKit dev server to be ready.
 * This is useful for API integration tests that need the server running.
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5173';

/**
 * Waits for the SvelteKit server to become ready by polling the base URL.
 * Throws an error if the server doesn't respond within the timeout period.
 *
 * @param timeoutMs - Maximum time to wait for server (default: 60 seconds)
 * @param intervalMs - Time between polling attempts (default: 1 second)
 * @throws {Error} If server doesn't become ready within timeout
 */
export async function waitForServer(timeoutMs = 60000, intervalMs = 1000): Promise<void> {
	const start = Date.now();
	let lastError: unknown;

	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(API_BASE_URL, { method: 'GET' });
			if (res.ok || res.status === 404) {
				// 200 OK or 404 means the server is responding (404 is fine for base URL)
				console.log(`✓ Server is ready at ${API_BASE_URL}`);
				return;
			}
			lastError = new Error(`Server responded with ${res.status}`);
		} catch (e) {
			lastError = e;
		}
		await new Promise((r) => setTimeout(r, intervalMs));
	}

	throw new Error(`CMS server did not become ready at ${API_BASE_URL} within ${timeoutMs}ms. ` + `Last error: ${String(lastError)}`);
}

/**
 * Gets the configured API base URL for tests.
 * @returns The API base URL
 */
export function getApiBaseUrl(): string {
	return API_BASE_URL;
}
