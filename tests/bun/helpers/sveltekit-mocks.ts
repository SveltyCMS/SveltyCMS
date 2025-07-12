// tests/bun/helpers/sveltekit-mocks.ts
import { mock } from 'bun:test';

// Mock SvelteKit's $app/environment module
mock('$app/environment', () => ({
	building: false,
	dev: true,
	prerendering: false,
	version: 'test-version'
}));

// Mock SvelteKit's $app/stores module
mock('$app/stores', () => {
	const { readable, writable } = require('svelte/store');
	const page = writable({
		url: new URL('http://localhost'),
		params: {},
		route: { id: null },
		status: 200,
		error: null,
		data: {},
		form: undefined
	});
	const navigating = readable(null);
	const updated = readable(false);

	return {
		page,
		navigating,
		updated,
		getStores: () => ({ page, navigating, updated })
	};
});

// --- NEW MOCK FOR YOUR LOGGER ---
// This intercepts any import of '@utils/logger.svelte' and provides
// a simple object with empty functions in its place.
mock('@utils/logger.svelte', () => ({
	logger: {
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {}
	}
}));

// Mock private environment config
mock('@root/config/private', () => ({
	privateEnv: {
		DB_TYPE: 'mongodb',
		DB_HOST: 'localhost',
		DB_PORT: '27017',
		DB_NAME: 'svelty_test',
		DB_USER: '',
		DB_PASSWORD: '',
		SECRET_KEY: 'test-secret-key',
		JWT_SECRET: 'test-jwt-secret'
	}
}));

// Mock public environment config
mock('@root/config/public', () => ({
	publicEnv: {
		SITE_NAME: 'SveltyCMS Test',
		HOST_PROD: 'http://localhost:5173'
	}
}));
