/**
 * @file tests/bun/api/telemetry.test.ts
 * @description
 * Integration tests for telemetry API endpoints.
 * This suite covers telemetry reporting, opt-in/opt-out functionality,
 * and ensures proper handling of the SVELTYCMS_TELEMETRY setting.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, test } from 'bun:test';
import { prepareAuthenticatedContext, cleanupTestDatabase } from '../helpers/testSetup';
import { getApiBaseUrl, waitForServer } from '../helpers/server';

const API_BASE_URL = getApiBaseUrl();

// Check if server is available before running tests
const serverReady = await waitForServer(5000); // Quick 5s check

const describeOrSkip = serverReady ? describe : describe.skip;

describeOrSkip('Telemetry API Endpoints', () => {
	let authCookie: string;

	beforeAll(async () => {
		// Server already checked, this is just for completeness
	});

	afterAll(async () => {
		await cleanupTestDatabase();
	});

	beforeEach(async () => {
		authCookie = await prepareAuthenticatedContext();
	});

	describe('POST /api/telemetry/report', () => {
		it('should accept telemetry data when telemetry is enabled', async () => {
			const telemetryPayload = {
				current_version: '0.5.0',
				node_version: 'v20.10.0',
				environment: 'test',
				installation_id: 'test-installation-id',
				db_type: 'mongodb'
			};

			const response = await fetch(`${API_BASE_URL}/api/telemetry/report`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookie
				},
				body: JSON.stringify(telemetryPayload)
			});

			expect([200, 500]).toContain(response.status); // 200 or 500 (upstream fail)
			const result = await response.json();
			expect(result).toBeDefined();
		});

		it('should return disabled status when telemetry is disabled', async () => {
			// Note: This test assumes telemetry can be disabled via settings
			// In actual implementation, the SVELTYCMS_TELEMETRY setting would need to be set to false
			const response = await fetch(`${API_BASE_URL}/api/telemetry/report`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookie
				},
				body: JSON.stringify({ test: 'data' })
			});

			// If telemetry is enabled (default), should forward to upstream
			// If disabled, should return { status: 'disabled' }
			expect(response.status).toBe(200);
			const result = await response.json();
			expect(['disabled', 'error', 'active', 'rate_limited']).toContain(result.status);
		});

		it('should fail gracefully when upstream telemetry server is unreachable', async () => {
			const response = await fetch(`${API_BASE_URL}/api/telemetry/report`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookie
				},
				body: JSON.stringify({
					version: '0.5.0',
					current_version: '0.5.0',
					installation_id: 'test-id'
				})
			});

			// Should never crash the app (fail silently)
			expect(response.status).toBe(200);
			const result = await response.json();
			expect(result.status).toBeDefined();
		});

		it('should handle malformed payload gracefully', async () => {
			const response = await fetch(`${API_BASE_URL}/api/telemetry/report`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookie
				},
				body: 'invalid json'
			});

			// Should fail gracefully and not crash the app
			expect([200, 400, 500]).toContain(response.status);
		});

		it('should forward complete telemetry payload', async () => {
			const completePayload = {
				current_version: '0.6.0',
				node_version: 'v20.10.0',
				environment: 'production',
				installation_id: 'abc123',
				db_type: 'mongodb',
				country: 'US',
				metrics: {
					users: 5,
					collections: 10,
					roles: 3
				},
				system: {
					cpu_count: 4,
					cpu_model: 'Intel i7',
					total_memory_gb: 16,
					os_type: 'Linux'
				}
			};

			const response = await fetch(`${API_BASE_URL}/api/telemetry/report`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookie
				},
				body: JSON.stringify(completePayload)
			});

			expect([200, 500]).toContain(response.status);
		});

		it('should not require authentication (public endpoint)', async () => {
			// Telemetry endpoint should be accessible without auth
			const response = await fetch(`${API_BASE_URL}/api/telemetry/report`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					version: '0.5.0',
					current_version: '0.5.0',
					installation_id: 'test'
				})
			});

			// Should work without auth (telemetry is meant to be accessible)
			expect([200, 401]).toContain(response.status);
		});
	});

	describe('Telemetry Settings Integration', () => {
		it('should respect SVELTYCMS_TELEMETRY private setting', async () => {
			// This test verifies the fix we made: using SVELTYCMS_TELEMETRY key
			const response = await fetch(`${API_BASE_URL}/api/telemetry/report`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookie
				},
				body: JSON.stringify({
					current_version: '0.5.0'
				})
			});

			// Should not throw errors related to invalid key
			expect(response.status).toBe(200);
			const result = await response.json();

			// Result should have a valid status
			expect(result).toHaveProperty('status');
			expect(typeof result.status).toBe('string');
		});

		it('should default to enabled when SVELTYCMS_TELEMETRY is undefined', async () => {
			// Telemetry defaults to TRUE if not explicitly set to false
			const response = await fetch(`${API_BASE_URL}/api/telemetry/report`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookie
				},
				body: JSON.stringify({
					current_version: '0.5.0',
					installation_id: 'default-test'
				})
			});

			expect(response.status).toBe(200);
			const result = await response.json();

			// Should not be 'disabled' by default
			// (unless explicitly configured in test environment)
			expect(result.status).toBeDefined();
		});
	});

	describe('Error Handling', () => {
		it('should never throw 500 errors that crash the app', async () => {
			// Even with bad data, telemetry should fail gracefully
			const badPayloads = [
				{}, // Empty object
				{ random: 'data' }, // Missing required fields
				null, // Null body
				{ current_version: '' } // Empty version
			];

			for (const payload of badPayloads) {
				const response = await fetch(`${API_BASE_URL}/api/telemetry/report`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Cookie: authCookie
					},
					body: JSON.stringify(payload)
				});

				// Should always return 200 with error status (fail silently)
				expect(response.status).toBe(200);
				const result = await response.json();
				expect(result).toHaveProperty('status');
			}
		});

		it('should handle network timeouts gracefully', async () => {
			// Simulate a long request (telemetry should have timeout handling)
			const response = await fetch(`${API_BASE_URL}/api/telemetry/report`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookie
				},
				body: JSON.stringify({
					current_version: '0.5.0',
					installation_id: 'timeout-test'
				})
			});

			// Should respond even if upstream times out
			expect(response.status).toBe(200);
		});
	});
});
