/**
 * @file tests/bun/helpers/server.ts
 * @description Core server connectivity utilities. Zero dependencies.
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5173';

export function getApiBaseUrl(): string {
	return API_BASE_URL;
}

/**
 * Robustly waits for the API to be available.
 * PERFORMANCE OPTIMIZED: Shorter intervals for faster detection.
 */
export async function waitForServer(timeoutMs = 30000, intervalMs = 500): Promise<void> {
	const start = Date.now();
	let lastError: unknown;

	process.stdout.write(`Waiting for server at ${API_BASE_URL}... `);

	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(API_BASE_URL, { method: 'HEAD' }); // HEAD is lighter than GET
			if (res.ok || res.status === 404) {
				console.log('✓ Ready');
				return;
			}
			lastError = new Error(`Status ${res.status}`);
		} catch (e) {
			lastError = e;
		}
		await new Promise((r) => setTimeout(r, intervalMs));
	}

	throw new Error(`\nServer timeout! Ensure 'bun run dev' is running. Last error: ${lastError}`);
}
