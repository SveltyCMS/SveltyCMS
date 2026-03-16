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
export async function waitForServer(timeoutMs = 60_000): Promise<void> {
	const start = Date.now();
	const baseUrl = getApiBaseUrl();

	console.log(`⏳ Waiting for server at ${baseUrl}...`);

	while (Date.now() - start < timeoutMs) {
		if (await checkServer()) {
			console.log('✅ Server is up and healthy!');
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	throw new Error(`Server at ${baseUrl} did not start within ${timeoutMs}ms`);
}
/**
 * Safely performs a fetch, returning null instead of crashing when the server is unreachable.
 * Automatically adds the Origin header to bypass CSRF protection.
 */
export async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
	const API_BASE_URL = getApiBaseUrl();

	// Merge Origin into headers as plain object to preserve Cookie
	// (new Headers() strips Cookie per fetch spec)
	const existingHeaders = (init?.headers as Record<string, string>) || {};
	const headers: Record<string, string> = { ...existingHeaders };
	if (!headers['Origin'] && !headers['origin']) {
		headers['Origin'] = API_BASE_URL;
	}

	try {
		const resp = await fetch(url, { ...init, headers });
		if (!resp) {
			throw new Error(`Server at ${url} returned an undefined response. Is the preview server running?`);
		}
		// Hardening: Verify that the response has a headers property (Mock detection)
		if (!resp.headers) {
			throw new Error(
				`Server at ${url} returned a response without headers. This usually indicates a global fetch mock has leaked from a unit test (e.g., ai-service.test.ts).`
			);
		}
		return resp;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Failed to reach server at ${url}. Integration tests require a running preview server (bun run test:integration). Error: ${message}`
		);
	}
}
