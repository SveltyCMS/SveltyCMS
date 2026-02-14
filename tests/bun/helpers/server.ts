/**
 * @file tests/bun/helpers/server.ts
 * @description Helper utility for integration tests to check server readiness
 *
 * Provides a common BASE_URL configuration and server wait function
 */

// Use preview server port (4173) by default for CI/CD
// Environment variable API_BASE_URL or TEST_BASE_URL can override
export const BASE_URL = process.env.API_BASE_URL || process.env.TEST_BASE_URL || 'http://localhost:4173';

// Cache server availability status
let _serverAvailable: boolean | null = null;

export function getApiBaseUrl(): string {
	return BASE_URL;
}

/**
 * Quick check if server is available.
 * Caches result to avoid repeated checks.
 * @returns true if server is reachable, false otherwise
 */
export async function isServerAvailable(): Promise<boolean> {
	if (_serverAvailable !== null) return _serverAvailable;

	try {
		const res = await fetch(`${BASE_URL}/api/system/version`, {
			method: 'GET',
			redirect: 'manual',
			signal: AbortSignal.timeout(5000)
		});
		_serverAvailable = res.ok;
	} catch {
		_serverAvailable = false;
	}

	if (!_serverAvailable) {
		console.warn(`⚠️ Server at ${BASE_URL} is not reachable. Integration tests will be skipped.`);
	}

	return _serverAvailable;
}

/**
 * Reset server availability cache (useful between test suites)
 */
export function resetServerCheck(): void {
	_serverAvailable = null;
}

/**
 * Robustly waits for the API to be available.
 * PERFORMANCE OPTIMIZED: Shorter intervals for faster detection.
 *
 * @returns true if server is ready, false if not available (allows graceful skip)
 */
export async function waitForServer(timeoutMs = 30000, intervalMs = 500): Promise<boolean> {
	const start = Date.now();
	let lastError: unknown;

	process.stdout.write(`Waiting for server at ${BASE_URL}... `);

	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(`${BASE_URL}/api/system/version`, {
				method: 'GET',
				redirect: 'manual'
			});
			if (res.ok) {
				console.log('✓ Ready');

				// CRITICAL: Wait for Vite module runner to register collection models
				// This prevents "transport disconnected" errors during tests
				console.log('⏳ Waiting for models to register...');
				await new Promise((r) => setTimeout(r, 2000)); // 2s delay
				console.log('✅ Models registered, server fully ready');

				_serverAvailable = true;
				return true;
			}
			lastError = new Error(`Status ${res.status}`);
		} catch (e) {
			lastError = e;
		}
		await new Promise((r) => setTimeout(r, intervalMs));
	}

	console.log(`✗ Server not available (${lastError})`);
	console.log('💡 Run integration tests with: bun run test:integration');
	_serverAvailable = false;
	return false;
}
