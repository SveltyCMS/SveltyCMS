/**
 * @file tests/bun/hooks/token-resolution.test.ts
 * @description Integration tests for token resolution middleware
 */
import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { handleTokenResolution } from '@src/hooks/tokenResolution';
import { TokenRegistry } from '@src/services/token/engine';

describe('Token Resolution Middleware', () => {
	let mockEvent: any;
	let mockResolve: any;

	beforeEach(() => {
		// Reset TokenRegistry cache
		TokenRegistry.clearCache();

		mockEvent = {
			url: new URL('http://localhost/api/collections/posts'),
			locals: {
				user: {
					_id: 'user-123',
					role: 'admin',
					email: 'admin@example.com'
				},
				contentLanguage: 'en',
				tenantId: 'default',
				roles: [{ _id: 'admin', isAdmin: true }]
			}
		};

		mockResolve = mock(async () => {
			return Response.json({
				title: 'Hello {{user.name}}',
				content: 'Created at {{system.year}}',
				nested: {
					value: '{{user.email}}'
				},
				list: ['Item {{system.year}}']
			});
		});

		// Initialize tokens (system, user, etc.)
		TokenRegistry.getTokens(undefined, mockEvent.locals.user, {
			includeSystem: true,
			includeUser: true
		});
	});

	it('should resolve tokens in JSON response', async () => {
		const response = await handleTokenResolution({ event: mockEvent, resolve: mockResolve });
		const body = await response.json();

		expect(body.title).toBe('Hello '); // Name is undefined in mock user
		expect(body.content).toBe(`Created at ${new Date().getFullYear()}`);
		expect(body.nested.value).toBe('admin@example.com');
		expect(body.list[0]).toBe(`Item ${new Date().getFullYear()}`);
	});

	it('should skip non-JSON responses', async () => {
		mockResolve = mock(async () => {
			return new Response('<html><body>{{user.email}}</body></html>', {
				headers: { 'content-type': 'text/html' }
			});
		});

		const response = await handleTokenResolution({ event: mockEvent, resolve: mockResolve });
		const text = await response.text();

		expect(text).toBe('<html><body>{{user.email}}</body></html>');
	});

	it('should skip non-API routes', async () => {
		mockEvent.url = new URL('http://localhost/dashboard');
		const response = await handleTokenResolution({ event: mockEvent, resolve: mockResolve });
		const body = await response.json();

		// Should remain unresolved
		expect(body.title).toBe('Hello {{user.name}}');
	});

	it('should handle relation tokens (mocked)', async () => {
		// Mock relation token resolution
		const originalResolve = TokenRegistry.resolve;
		TokenRegistry.resolve = mock((key) => {
			if (key === 'entry.relation.title') {
				return 'Resolved Relation';
			}
			return key;
		});

		mockResolve = mock(async () => {
			return Response.json({
				relation: '{{entry.relation.title}}'
			});
		});

		const response = await handleTokenResolution({ event: mockEvent, resolve: mockResolve });
		const body = await response.json();

		expect(body.relation).toBe('Resolved Relation');

		// Restore original
		TokenRegistry.resolve = originalResolve;
	});

	it('should handle errors gracefully', async () => {
		// Let's mock resolve to throw
		mockResolve = mock(async () => {
			throw new Error('Network error');
		});

		try {
			await handleTokenResolution({ event: mockEvent, resolve: mockResolve });
		} catch (e: any) {
			expect(e.message).toBe('Network error');
		}
	});
});
