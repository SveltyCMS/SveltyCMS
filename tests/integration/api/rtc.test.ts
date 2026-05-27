/**
 * @file tests/integration/api/rtc.test.ts
 * @description Integration tests for Real-Time Collaboration (SSE) API.
 */

import { beforeAll, describe, expect, it } from 'bun:test';
import { getApiBaseUrl } from '../helpers/server';
import { prepareAuthenticatedContext } from '../helpers/test-setup';

const API_BASE_URL = getApiBaseUrl();

describe('RTC (SSE) Integration', () => {
	let adminCookie: string;

	// 1. ONE-TIME SETUP
	beforeAll(async () => {
		// prepareAuthenticatedContext handles reset, seed, and login
		adminCookie = await prepareAuthenticatedContext();
	}, 30_000); // 30s timeout

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
			expect(response.headers.get('Content-Type')).toBe('text/event-stream');
			const cacheControl = response.headers.get('Cache-Control');
			expect(cacheControl).toBeDefined();
			expect(cacheControl).toContain('no-cache');
			expect(response.headers.get('Connection')).toBe('keep-alive');

			const reader = response.body?.getReader();
			if (!reader) throw new Error('No reader available');

			try {
				const { value, done } = await reader.read();
				if (done) throw new Error('Stream closed prematurely');

				const text = new TextDecoder().decode(value);
				console.log('SSE First Message:', text);
				expect(text).toContain('connected');
			} finally {
				await reader.cancel();
			}
		}, 10_000);

		it('should reject unauthenticated requests', async () => {
			const response = await fetch(`${API_BASE_URL}/api/events`);
			expect(response.status).toBe(401);
		});
	});
});
