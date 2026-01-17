/**
 * @file tests/bun/plugins/urlUtils.test.ts
 * @description Unit tests for PageSpeed plugin URL derivation logic
 */

import { describe, test, expect } from 'bun:test';
import { deriveEntryUrl, generateCacheKey, validateUrl } from '@src/plugins/pagespeed/urlUtils';
import type { Schema } from '@src/content/types';

describe('PageSpeed URL Utils', () => {
	describe('deriveEntryUrl', () => {
		test('should derive URL for base locale without language prefix', () => {
			const baseUrl = 'https://example.com';
			const language = 'en';
			const baseLocale = 'en';
			const entry = {
				_id: 'entry1',
				slug: '/about-us'
			};
			const schema: Partial<Schema> = {
				_id: 'collection1',
				fields: [
					{ widget: 'slug', name: 'slug', db_fieldName: 'slug' } as any
				]
			};

			const url = deriveEntryUrl(baseUrl, language, baseLocale, entry, schema as Schema);

			expect(url).toBe('https://example.com/about-us');
		});

		test('should derive URL for translated locale with language prefix', () => {
			const baseUrl = 'https://example.com';
			const language = 'de';
			const baseLocale = 'en';
			const entry = {
				_id: 'entry1',
				slug: '/uber-uns'
			};
			const schema: Partial<Schema> = {
				_id: 'collection1',
				fields: [
					{ widget: 'slug', name: 'slug', db_fieldName: 'slug' } as any
				]
			};

			const url = deriveEntryUrl(baseUrl, language, baseLocale, entry, schema as Schema);

			expect(url).toBe('https://example.com/de/uber-uns');
		});

		test('should handle slug without leading slash', () => {
			const baseUrl = 'https://example.com';
			const language = 'en';
			const baseLocale = 'en';
			const entry = {
				_id: 'entry1',
				slug: 'about-us'
			};
			const schema: Partial<Schema> = {
				_id: 'collection1',
				fields: [
					{ widget: 'slug', name: 'slug', db_fieldName: 'slug' } as any
				]
			};

			const url = deriveEntryUrl(baseUrl, language, baseLocale, entry, schema as Schema);

			expect(url).toBe('https://example.com/about-us');
		});

		test('should handle translated slug field', () => {
			const baseUrl = 'https://example.com';
			const language = 'de';
			const baseLocale = 'en';
			const entry = {
				_id: 'entry1',
				slug: {
					en: '/about-us',
					de: '/uber-uns'
				}
			};
			const schema: Partial<Schema> = {
				_id: 'collection1',
				fields: [
					{ widget: 'slug', name: 'slug', db_fieldName: 'slug', translated: true } as any
				]
			};

			const url = deriveEntryUrl(baseUrl, language, baseLocale, entry, schema as Schema);

			expect(url).toBe('https://example.com/de/uber-uns');
		});

		test('should handle base URL with trailing slash', () => {
			const baseUrl = 'https://example.com/';
			const language = 'en';
			const baseLocale = 'en';
			const entry = {
				_id: 'entry1',
				slug: '/about-us'
			};
			const schema: Partial<Schema> = {
				_id: 'collection1',
				fields: [
					{ widget: 'slug', name: 'slug', db_fieldName: 'slug' } as any
				]
			};

			const url = deriveEntryUrl(baseUrl, language, baseLocale, entry, schema as Schema);

			expect(url).toBe('https://example.com/about-us');
		});

		test('should return null if no slug field found', () => {
			const baseUrl = 'https://example.com';
			const language = 'en';
			const baseLocale = 'en';
			const entry = {
				_id: 'entry1',
				title: 'About Us'
			};
			const schema: Partial<Schema> = {
				_id: 'collection1',
				fields: [
					{ widget: 'text', name: 'title', db_fieldName: 'title' } as any
				]
			};

			const url = deriveEntryUrl(baseUrl, language, baseLocale, entry, schema as Schema);

			expect(url).toBeNull();
		});

		test('should return null if slug value is missing', () => {
			const baseUrl = 'https://example.com';
			const language = 'en';
			const baseLocale = 'en';
			const entry = {
				_id: 'entry1',
				slug: null
			};
			const schema: Partial<Schema> = {
				_id: 'collection1',
				fields: [
					{ widget: 'slug', name: 'slug', db_fieldName: 'slug' } as any
				]
			};

			const url = deriveEntryUrl(baseUrl, language, baseLocale, entry, schema as Schema);

			expect(url).toBeNull();
		});
	});

	describe('generateCacheKey', () => {
		test('should generate cache key with all parameters', () => {
			const key = generateCacheKey('entry1', 'en', 'mobile', 'tenant1');

			expect(key).toBe('pagespeed:tenant1:entry1:en:mobile');
		});

		test('should generate different keys for different languages', () => {
			const keyEn = generateCacheKey('entry1', 'en', 'mobile', 'tenant1');
			const keyDe = generateCacheKey('entry1', 'de', 'mobile', 'tenant1');

			expect(keyEn).not.toBe(keyDe);
			expect(keyEn).toBe('pagespeed:tenant1:entry1:en:mobile');
			expect(keyDe).toBe('pagespeed:tenant1:entry1:de:mobile');
		});

		test('should generate different keys for different devices', () => {
			const keyMobile = generateCacheKey('entry1', 'en', 'mobile', 'tenant1');
			const keyDesktop = generateCacheKey('entry1', 'en', 'desktop', 'tenant1');

			expect(keyMobile).not.toBe(keyDesktop);
			expect(keyMobile).toBe('pagespeed:tenant1:entry1:en:mobile');
			expect(keyDesktop).toBe('pagespeed:tenant1:entry1:en:desktop');
		});

		test('should generate different keys for different tenants', () => {
			const keyTenant1 = generateCacheKey('entry1', 'en', 'mobile', 'tenant1');
			const keyTenant2 = generateCacheKey('entry1', 'en', 'mobile', 'tenant2');

			expect(keyTenant1).not.toBe(keyTenant2);
			expect(keyTenant1).toBe('pagespeed:tenant1:entry1:en:mobile');
			expect(keyTenant2).toBe('pagespeed:tenant2:entry1:en:mobile');
		});
	});

	describe('validateUrl', () => {
		test('should accept valid HTTPS URL matching base URL', () => {
			const url = 'https://example.com/page';
			const baseUrl = 'https://example.com';

			const isValid = validateUrl(url, baseUrl);

			expect(isValid).toBe(true);
		});

		test('should reject HTTP URL', () => {
			const url = 'http://example.com/page';
			const baseUrl = 'https://example.com';

			const isValid = validateUrl(url, baseUrl);

			expect(isValid).toBe(false);
		});

		test('should reject URL with different hostname', () => {
			const url = 'https://evil.com/page';
			const baseUrl = 'https://example.com';

			const isValid = validateUrl(url, baseUrl);

			expect(isValid).toBe(false);
		});

		test('should accept URL with same hostname but different path', () => {
			const url = 'https://example.com/different/path';
			const baseUrl = 'https://example.com/original/path';

			const isValid = validateUrl(url, baseUrl);

			expect(isValid).toBe(true);
		});

		test('should reject invalid URL format', () => {
			const url = 'not-a-url';
			const baseUrl = 'https://example.com';

			const isValid = validateUrl(url, baseUrl);

			expect(isValid).toBe(false);
		});

		test('should accept URL with subdomain if base has subdomain', () => {
			const url = 'https://www.example.com/page';
			const baseUrl = 'https://www.example.com';

			const isValid = validateUrl(url, baseUrl);

			expect(isValid).toBe(true);
		});

		test('should reject URL with different subdomain', () => {
			const url = 'https://www.example.com/page';
			const baseUrl = 'https://example.com';

			const isValid = validateUrl(url, baseUrl);

			expect(isValid).toBe(false);
		});
	});
});
