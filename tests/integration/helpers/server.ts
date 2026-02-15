/**
 * @file tests/integration/helpers/server.ts
 * @description Helper functions for server interaction in integration tests.
 */

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:4173';

/**
 * Base URL constant for tests (alias for getApiBaseUrl for compatibility)
 */
export const BASE_URL = process.env.API_BASE_URL || DEFAULT_API_BASE_URL;

/**
 * Returns the API base URL from environment or default.
 */
export function getApiBaseUrl(): string {
	return process.env.API_BASE_URL || DEFAULT_API_BASE_URL;
}

/**
 * Pings the server health endpoint to ensure it's ready.
 */
export async function checkServer(): Promise<boolean> {
	const url = `${getApiBaseUrl()}/api/system/health`;
	try {
		const response = await fetch(url);
		return response.status === 200;
	} catch (_error) {
		return false;
	}
}

/**
 * Waits for the server to become healthy with a timeout.
 */
export async function waitForServer(timeoutMs = 60000): Promise<void> {
	const start = Date.now();
	const baseUrl = getApiBaseUrl();

	console.log(`⏳ Waiting for server at ${baseUrl}...`);

	while (Date.now() - start < timeoutMs) {
		if (await checkServer()) {
			console.log(`✅ Server is up and healthy!`);
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	throw new Error(`Server at ${baseUrl} did not start within ${timeoutMs}ms`);
}
