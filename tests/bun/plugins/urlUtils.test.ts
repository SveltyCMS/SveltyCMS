import { describe, test, expect, mock } from 'bun:test';

// Mock SvelteKit environment
mock.module('$app/environment', () => ({
	browser: false,
	building: false,
	dev: true,
	version: 'test'
}));

// Mock logger
mock.module('@shared/utils/logger.server', () => ({
	logger: {
		info: () => {},
		warn: () => {},
		error: () => {},
		debug: () => {}
	}
}));

// Mock global settings if needed (as it imports $app/environment)
mock.module('@shared/stores/globalSettings.svelte', () => ({
	publicEnv: {}
}));

import { deriveEntryUrl, generateCacheKey, validateUrl } from '@cms/plugins/pagespeed/urlUtils';

describe('PageSpeed URL Utils', () => {
	describe('deriveEntryUrl', () => {
		const baseUrl = 'https://example.com';
		const baseLocale = 'en';
		const schema = {
			_id: 'test_collection',
			fields: [
				{ name: 'title', label: 'Title', widget: 'string' },
				{ name: 'slug', label: 'Slug', widget: 'slug', db_fieldName: 'slug' }
			]
		};

		test('should derive URL for base locale', () => {
			const entry = { _id: '1', slug: 'my-page' };
			const url = deriveEntryUrl(baseUrl, 'en', baseLocale, entry, schema as any);
			expect(url).toBe('https://example.com/my-page');
		});

		test('should derive URL for other locale', () => {
			const entry = { _id: '1', slug: 'my-page' };
			const url = deriveEntryUrl(baseUrl, 'de', baseLocale, entry, schema as any);
			expect(url).toBe('https://example.com/de/my-page');
		});

		test('should handle translated slugs', () => {
			const translatedSchema = {
				...schema,
				fields: [{ name: 'slug', label: 'Slug', widget: 'slug', db_fieldName: 'slug', translated: true }]
			};
			const entry = {
				_id: '1',
				slug: { en: 'my-page', de: 'meine-seite' }
			};

			const urlEn = deriveEntryUrl(baseUrl, 'en', baseLocale, entry, translatedSchema as any);
			expect(urlEn).toBe('https://example.com/my-page');

			const urlDe = deriveEntryUrl(baseUrl, 'de', baseLocale, entry, translatedSchema as any);
			expect(urlDe).toBe('https://example.com/de/meine-seite');
		});

		test('should return null if slug missing', () => {
			const entry = { _id: '1', title: 'Start' };
			const url = deriveEntryUrl(baseUrl, 'en', baseLocale, entry, schema as any);
			expect(url).toBeNull();
		});

		test('should clean base URL trailing slash', () => {
			const url = deriveEntryUrl('https://example.com/', 'en', baseLocale, { slug: 'page' }, schema as any);
			expect(url).toBe('https://example.com/page');
		});
	});

	describe('validateUrl', () => {
		const baseUrl = 'https://example.com';

		test('should allow valid URLs', () => {
			expect(validateUrl('https://example.com/page', baseUrl)).toBe(true);
			expect(validateUrl('https://example.com/de/page', baseUrl)).toBe(true);
		});

		test('should reject different hostname', () => {
			expect(validateUrl('https://evil.com/page', baseUrl)).toBe(false);
		});

		test('should reject non-https', () => {
			expect(validateUrl('http://example.com/page', baseUrl)).toBe(false);
		});
	});

	describe('generateCacheKey', () => {
		test('should generate correct key', () => {
			const key = generateCacheKey('123', 'en', 'mobile', 'default');
			expect(key).toBe('pagespeed:default:123:en:mobile');
		});
	});
});
