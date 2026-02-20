/**
 * @file tests/integration/api/rtc.test.ts
 * @description Integration tests for Real-Time Collaboration (SSE) API.
 */

import { beforeAll, describe, expect, it } from 'bun:test';
import { getApiBaseUrl } from '../helpers/server';
import { initializeTestEnvironment, prepareAuthenticatedContext } from '../helpers/test-setup';

const API_BASE_URL = getApiBaseUrl();

describe('RTC (SSE) Integration', () => {
	let adminCookie: string;

	// 1. ONE-TIME SETUP
	beforeAll(async () => {
		// Wait for server
		await initializeTestEnvironment();

		// Get session
		adminCookie = await prepareAuthenticatedContext();
	});

	// --- TEST SUITE: SSE CONNECTION ---
	describe('GET /api/events', () => {
		it('should establish an SSE connection and receive "connected" message', async () => {
			const response = await fetch(`${API_BASE_URL}/api/events`, {
				headers: {
					Cookie: adminCookie,
					Accept: 'text/event-stream'
				}
			});

			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toContain('text/event-stream');

			const reader = response.body?.getReader();
			if (!reader) {
				throw new Error('Response body is null');
			}

			// Read first chunk
			const { value } = await reader.read();
			const text = new TextDecoder().decode(value);

			// Verify initial message
			expect(text).toContain('data: {"type":"connected"');

			// Cleanly close connection
			await reader.cancel();
		});

		it('should reject unauthenticated requests', async () => {
			const response = await fetch(`${API_BASE_URL}/api/events`, {
				headers: {
					Accept: 'text/event-stream'
				}
			});

			expect(response.status).toBe(401);
		});

		it('should have correct SSE headers', async () => {
			const response = await fetch(`${API_BASE_URL}/api/events`, {
				headers: {
					Cookie: adminCookie,
					Accept: 'text/event-stream'
				}
			});

			expect(response.headers.get('Cache-Control')).toContain('no-cache');
			expect(response.headers.get('Connection')).toBe('keep-alive');

			if (response.body) {
				await response.body.cancel();
			}
		});
	});
});
