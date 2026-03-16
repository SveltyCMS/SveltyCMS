/**
 * @file tests/integration/preload.ts
 * @description Preload script for bun test — mocks SvelteKit virtual modules
 * that don't exist outside the SvelteKit runtime (e.g. $app/environment).
 *
 * Used via: bun test --preload ./tests/integration/preload.ts
 */

import { mock } from 'bun:test';

mock.module('$app/environment', () => ({
	browser: false,
	dev: true,
	building: false,
	version: '1.0.0'
}));

mock.module('$app/navigation', () => ({
	goto: () => Promise.resolve(),
	invalidate: () => Promise.resolve(),
	invalidateAll: () => Promise.resolve(),
	afterNavigate: () => {},
	beforeNavigate: () => {},
	preloadData: () => Promise.resolve()
}));

mock.module('$app/forms', () => ({
	applyAction: () => Promise.resolve(),
	enhance: () => {},
	deserialize: (v: string) => {
		try {
			return JSON.parse(v);
		} catch {
			return v;
		}
	}
}));

mock.module('$app/paths', () => ({
	base: '',
	assets: ''
}));

mock.module('$app/state', () => ({
	page: {
		url: new URL('http://localhost'),
		params: {},
		route: { id: null },
		status: 200,
		error: null,
		data: {},
		form: null
	}
}));
