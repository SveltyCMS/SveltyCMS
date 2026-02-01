/**
 * @file tests/bun/hooks/preload.ts
 * @description Preload script that mocks SvelteKit modules for hooks tests
 */

import { mock, spyOn } from 'bun:test';

// Mock $app/environment
mock.module('$app/environment', () => ({
	browser: false,
	dev: true,
	building: false,
	version: 'test'
}));

// Mock $app/stores
mock.module('$app/stores', () => ({
	page: { subscribe: () => () => {} },
	navigating: { subscribe: () => () => {} },
	updated: { subscribe: () => () => {}, check: () => Promise.resolve(false) }
}));

// Mock $app/navigation
mock.module('$app/navigation', () => ({
	goto: () => Promise.resolve(),
	invalidate: () => Promise.resolve(),
	invalidateAll: () => Promise.resolve(),
	preloadData: () => Promise.resolve(),
	preloadCode: () => Promise.resolve(),
	beforeNavigate: () => {},
	afterNavigate: () => {},
	onNavigate: () => {},
	pushState: () => {},
	replaceState: () => {}
}));

// Mock sveltekit-rate-limiter/server
mock.module('sveltekit-rate-limiter/server', () => ({
	RateLimiter: class MockRateLimiter {
		constructor() {}
		async isLimited() {
			return { limited: false };
		}
		cookieLimiter() {
			return this;
		}
	},
	RetryAfterRateLimiter: class MockRetryAfterRateLimiter {
		constructor() {}
		async isLimited() {
			return { limited: false, retryAfter: 0 };
		}
	}
}));

// Mock @sveltejs/kit error and redirect (matching SvelteKit's HttpError structure)
mock.module('@sveltejs/kit', () => ({
	error: (status: number, message: string | { message: string }) => {
		const body = typeof message === 'string' ? { message } : message;
		const err = {
			status,
			body,
			message: body.message
		};
		throw err;
	},
	redirect: (status: number, location: string) => {
		const err = {
			status,
			location,
			message: `Redirect to ${location}`
		};
		throw err;
	},
	json: (data: unknown, init?: ResponseInit) => new Response(JSON.stringify(data), {
		...init,
		headers: { 'Content-Type': 'application/json', ...init?.headers }
	}),
	text: (data: string, init?: ResponseInit) => new Response(data, init)
}));

console.log('✅ SvelteKit modules mocked for hooks tests');
