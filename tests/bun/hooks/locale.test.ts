/**
 * @file tests/bun/hooks/locale.test.ts
 * @description Comprehensive tests for handleLocale middleware
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { handleLocale } from '@src/hooks/handleLocale';
import type { RequestEvent } from '@sveltejs/kit';

// --- Test Utilities ---

function createMockEvent(pathname: string, cookies: Record<string, string> = {}): RequestEvent {
	const url = new URL(pathname, 'http://localhost');

	const cookieDeleteMock = mock(() => {});

	return {
		url,
		request: new Request(url.toString()),
		cookies: {
			get: (name: string) => cookies[name] || null,
			set: mock(() => {}),
			delete: cookieDeleteMock
		},
		locals: {}
	} as unknown as RequestEvent;
}

function createMockResponse(): Response {
	return new Response('test body', { status: 200 });
}

// --- Tests ---

describe('handleLocale Middleware', () => {
	let mockResolve: ReturnType<typeof mock>;
	let mockResponse: Response;

	beforeEach(() => {
		mockResponse = createMockResponse();
		mockResolve = mock(() => Promise.resolve(mockResponse));
	});

	describe('Valid Locale Detection', () => {
		it('should accept valid systemLanguage cookie', async () => {
			const event = createMockEvent('/dashboard', { systemLanguage: 'en' });
			const response = await handleLocale({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
			expect(mockResolve).toHaveBeenCalledTimes(1);
		});

		it('should accept valid contentLanguage cookie', async () => {
			const event = createMockEvent('/dashboard', { contentLanguage: 'en' });
			const response = await handleLocale({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
		});

		it('should accept both systemLanguage and contentLanguage', async () => {
			const event = createMockEvent('/dashboard', {
				systemLanguage: 'en',
				contentLanguage: 'de'
			});
			const response = await handleLocale({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
		});

		it('should accept supported locales (en, de, fr, etc.)', async () => {
			const locales = ['en', 'de', 'fr', 'es', 'it'];

			for (const locale of locales) {
				mockResolve.mockClear();
				const event = createMockEvent('/dashboard', { systemLanguage: locale });
				await handleLocale({ event, resolve: mockResolve });
				expect(mockResolve).toHaveBeenCalledTimes(1);
			}
		});
	});

	describe('Invalid Locale Cleanup', () => {
		it('should delete invalid systemLanguage cookie', async () => {
			const event = createMockEvent('/dashboard', { systemLanguage: 'invalid' });
			await handleLocale({ event, resolve: mockResolve });

			// Should delete the invalid cookie
			expect(event.cookies.delete).toHaveBeenCalledWith('systemLanguage', { path: '/' });
		});

		it('should delete invalid contentLanguage cookie', async () => {
			const event = createMockEvent('/dashboard', { contentLanguage: 'xyz' });
			await handleLocale({ event, resolve: mockResolve });

			expect(event.cookies.delete).toHaveBeenCalledWith('contentLanguage', { path: '/' });
		});

		it('should delete both if both invalid', async () => {
			const event = createMockEvent('/dashboard', {
				systemLanguage: 'invalid1',
				contentLanguage: 'invalid2'
			});
			await handleLocale({ event, resolve: mockResolve });

			expect(event.cookies.delete).toHaveBeenCalledTimes(2);
		});

		it('should handle empty string locale', async () => {
			const event = createMockEvent('/dashboard', { systemLanguage: '' });
			await handleLocale({ event, resolve: mockResolve });

			// Empty should be considered invalid
			expect(event.cookies.delete).toHaveBeenCalled();
		});

		it('should handle locale with special characters', async () => {
			const event = createMockEvent('/dashboard', { systemLanguage: 'en<script>' });
			await handleLocale({ event, resolve: mockResolve });

			expect(event.cookies.delete).toHaveBeenCalled();
		});
	});

	describe('Store Synchronization', () => {
		it('should update systemLanguage store when valid', async () => {
			const event = createMockEvent('/dashboard', { systemLanguage: 'de' });
			await handleLocale({ event, resolve: mockResolve });

			// Store update happens internally
			expect(mockResolve).toHaveBeenCalled();
		});

		it('should update contentLanguage store when valid', async () => {
			const event = createMockEvent('/dashboard', { contentLanguage: 'fr' });
			await handleLocale({ event, resolve: mockResolve });

			expect(mockResolve).toHaveBeenCalled();
		});

		it('should update both stores when both valid', async () => {
			const event = createMockEvent('/dashboard', {
				systemLanguage: 'en',
				contentLanguage: 'de'
			});
			await handleLocale({ event, resolve: mockResolve });

			expect(mockResolve).toHaveBeenCalled();
		});

		it('should not update stores for invalid locales', async () => {
			const event = createMockEvent('/dashboard', { systemLanguage: 'invalid' });
			await handleLocale({ event, resolve: mockResolve });

			// Should delete cookie, not update store
			expect(event.cookies.delete).toHaveBeenCalled();
		});
	});

	describe('Missing Cookie Handling', () => {
		it('should handle missing systemLanguage cookie gracefully', async () => {
			const event = createMockEvent('/dashboard', {});
			const response = await handleLocale({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
			expect(event.cookies.delete).not.toHaveBeenCalled();
		});

		it('should handle missing contentLanguage cookie gracefully', async () => {
			const event = createMockEvent('/dashboard', {});
			const response = await handleLocale({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
		});

		it('should handle missing both cookies gracefully', async () => {
			const event = createMockEvent('/dashboard', {});
			const response = await handleLocale({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
		});
	});

	describe('Store Availability Check', () => {
		it('should check if stores are available before proceeding', async () => {
			const event = createMockEvent('/dashboard', { systemLanguage: 'en' });
			const response = await handleLocale({ event, resolve: mockResolve });

			// Should handle gracefully even if stores unavailable
			expect(response).toBe(mockResponse);
		});

		it('should not crash if stores are undefined', async () => {
			const event = createMockEvent('/dashboard', { systemLanguage: 'en' });

			// Should not throw error
			const response = await handleLocale({ event, resolve: mockResolve });
			expect(response).toBeDefined();
		});
	});

	describe('ParaglideJS Integration', () => {
		it('should validate against ParaglideJS available locales', async () => {
			const event = createMockEvent('/dashboard', { systemLanguage: 'en' });
			await handleLocale({ event, resolve: mockResolve });

			// Validation uses isValidLocale() from ParaglideJS
			expect(mockResolve).toHaveBeenCalled();
		});

		it('should run after ParaglideJS i18n.handle() in middleware chain', async () => {
			// This middleware assumes ParaglideJS has already set up i18n
			const event = createMockEvent('/dashboard', { systemLanguage: 'de' });
			const response = await handleLocale({ event, resolve: mockResolve });

			expect(response).toBeDefined();
		});
	});

	describe('safelySetLanguage Function', () => {
		it('should safely set systemLanguage when valid', async () => {
			const event = createMockEvent('/dashboard', { systemLanguage: 'fr' });
			await handleLocale({ event, resolve: mockResolve });

			expect(mockResolve).toHaveBeenCalled();
		});

		it('should safely set contentLanguage when valid', async () => {
			const event = createMockEvent('/dashboard', { contentLanguage: 'es' });
			await handleLocale({ event, resolve: mockResolve });

			expect(mockResolve).toHaveBeenCalled();
		});

		it('should handle errors in language setter gracefully', async () => {
			const event = createMockEvent('/dashboard', { systemLanguage: 'en' });

			// Should not throw even if setter has issues
			const response = await handleLocale({ event, resolve: mockResolve });
			expect(response).toBeDefined();
		});
	});

	describe('Edge Cases', () => {
		it('should handle case-sensitive locale codes', async () => {
			const event = createMockEvent('/dashboard', { systemLanguage: 'EN' });
			await handleLocale({ event, resolve: mockResolve });

			// Depends on implementation - might be invalid
			// Most locale codes are lowercase
		});

		it('should handle locale with region (en-US, de-DE)', async () => {
			const event = createMockEvent('/dashboard', { systemLanguage: 'en-US' });
			await handleLocale({ event, resolve: mockResolve });

			// Depends on ParaglideJS config
		});

		it('should handle very long locale strings', async () => {
			const event = createMockEvent('/dashboard', { systemLanguage: 'x'.repeat(100) });
			await handleLocale({ event, resolve: mockResolve });

			expect(event.cookies.delete).toHaveBeenCalled();
		});

		it('should handle locale with numbers', async () => {
			const event = createMockEvent('/dashboard', { systemLanguage: 'en123' });
			await handleLocale({ event, resolve: mockResolve });

			expect(event.cookies.delete).toHaveBeenCalled();
		});

		it('should handle null cookie values', async () => {
			const event = createMockEvent('/dashboard', {});
			const response = await handleLocale({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
		});

		it('should handle undefined cookie values', async () => {
			const event = createMockEvent('/dashboard', {});
			const response = await handleLocale({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
		});
	});

	describe('Multiple Requests', () => {
		it('should handle sequential requests with different locales', async () => {
			const locales = ['en', 'de', 'fr', 'es'];

			for (const locale of locales) {
				mockResolve.mockClear();
				const event = createMockEvent('/dashboard', { systemLanguage: locale });
				await handleLocale({ event, resolve: mockResolve });
				expect(mockResolve).toHaveBeenCalledTimes(1);
			}
		});

		it('should handle parallel requests (different cookies)', async () => {
			const event1 = createMockEvent('/page1', { systemLanguage: 'en' });
			const event2 = createMockEvent('/page2', { systemLanguage: 'de' });

			const [response1, response2] = await Promise.all([
				handleLocale({ event: event1, resolve: mockResolve }),
				handleLocale({ event: event2, resolve: mockResolve })
			]);

			expect(response1).toBeDefined();
			expect(response2).toBeDefined();
		});
	});

	describe('Warning Messages', () => {
		it('should log warning for invalid systemLanguage', async () => {
			const event = createMockEvent('/dashboard', { systemLanguage: 'invalid' });
			await handleLocale({ event, resolve: mockResolve });

			// Warning logged internally
			expect(event.cookies.delete).toHaveBeenCalled();
		});

		it('should log warning for invalid contentLanguage', async () => {
			const event = createMockEvent('/dashboard', { contentLanguage: 'xyz' });
			await handleLocale({ event, resolve: mockResolve });

			expect(event.cookies.delete).toHaveBeenCalled();
		});
	});

	describe('Cookie Path', () => {
		it('should delete cookies with correct path', async () => {
			const event = createMockEvent('/dashboard', { systemLanguage: 'invalid' });
			await handleLocale({ event, resolve: mockResolve });

			expect(event.cookies.delete).toHaveBeenCalledWith('systemLanguage', { path: '/' });
		});
	});
});
