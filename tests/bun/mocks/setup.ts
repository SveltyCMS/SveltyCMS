// tests/bun/mocks/setup.ts
// Test setup file for Bun tests
import { mock } from 'bun:test';

// Mock public environment
globalThis.publicEnv = {
	DEFAULT_CONTENT_LANGUAGE: 'en',
	AVAILABLE_CONTENT_LANGUAGES: ['en', 'de', 'fr'],
	HOST_DEV: 'localhost:3000',
	HOST_PROD: 'example.com',
	SITE_NAME: 'SveltyCMS',
	PASSWORD_LENGTH: 8,
	BASE_LOCALE: 'en',
	LOCALES: ['en', 'de', 'fr']
};

// Mock private environment
globalThis.privateEnv = {
	DB_TYPE: 'mongodb',
	DB_HOST: 'localhost',
	DB_PORT: 27017,
	DB_NAME: 'sveltycms_test',
	DB_USER: 'test',
	DB_PASSWORD: 'test',
	JWT_SECRET_KEY: 'test-secret',
	ENCRYPTION_KEY: 'test-encryption-key'
};

// Mock store modules
mock('@src/stores/globalSettings', () => ({
	publicEnv: globalThis.publicEnv
}));

// Mock paraglide messages
mock('@src/paraglide/messages', () => ({
	widgets_nodata: () => 'No Data'
}));

console.log('✅ Test environment setup complete');
