/**
 * @file src/plugins/pagespeed/urlUtils.ts
 * @description URL derivation utilities for PageSpeed plugin
 */

import type { Schema } from '@content/types';
import { logger } from '@utils/logger.server';

/**
 * Derive the public URL for an entry
 *
 * @param baseUrl - System base URL (e.g., 'https://example.com')
 * @param language - Content language (e.g., 'en', 'de')
 * @param baseLocale - Base locale from settings (e.g., 'en')
 * @param entry - Entry data containing slug
 * @param schema - Collection schema to find slug field
 * @returns Full URL or null if cannot be derived
 */
export function deriveEntryUrl(baseUrl: string, language: string, baseLocale: string, entry: Record<string, unknown>, schema: Schema): string | null {
	try {
		// Find slug field in schema
		const slugField = schema.fields.find((f: any) => f.widget === 'slug' || f.name === 'slug' || f.db_fieldName === 'slug');

		if (!slugField) {
			logger.warn('No slug field found in schema', { schemaId: schema._id });
			return null;
		}

		// Get slug value from entry
		const fieldName = (slugField as any).db_fieldName || (slugField as any).name || 'slug';
		let slug = entry[fieldName];

		// Handle translated slug fields
		if (slug && typeof slug === 'object' && !Array.isArray(slug)) {
			slug = (slug as Record<string, unknown>)[language];
		}

		if (!slug || typeof slug !== 'string') {
			logger.warn('No slug value found for entry', { entryId: entry._id });
			return null;
		}

		// Clean base URL (remove trailing slash)
		const cleanBaseUrl = baseUrl.replace(/\/$/, '');

		// Build URL based on language prefix rules
		// BASE_LOCALE: no prefix (e.g., /about)
		// Other languages: prefixed (e.g., /de/about)
		const languagePrefix = language === baseLocale ? '' : `/${language}`;

		// Ensure slug starts with /
		const cleanSlug = slug.startsWith('/') ? slug : `/${slug}`;

		const fullUrl = `${cleanBaseUrl}${languagePrefix}${cleanSlug}`;

		logger.debug('Derived entry URL', {
			entryId: entry._id,
			language,
			baseLocale,
			slug,
			url: fullUrl
		});

		return fullUrl;
	} catch (error) {
		logger.error('Failed to derive entry URL', { error, entryId: entry._id });
		return null;
	}
}

/**
 * Generate cache key for PageSpeed results
 */
export function generateCacheKey(entryId: string, language: string, device: 'mobile' | 'desktop', tenantId: string): string {
	return `pagespeed:${tenantId}:${entryId}:${language}:${device}`;
}

/**
 * Validate URL to prevent SSRF attacks
 */
export function validateUrl(url: string, allowedBaseUrl: string): boolean {
	try {
		const urlObj = new URL(url);
		const baseObj = new URL(allowedBaseUrl);

		// Check protocol (only https)
		if (urlObj.protocol !== 'https:') {
			logger.warn('Invalid URL protocol', { url, protocol: urlObj.protocol });
			return false;
		}

		// Check hostname matches base URL
		if (urlObj.hostname !== baseObj.hostname) {
			logger.warn('URL hostname does not match base URL', {
				url: urlObj.hostname,
				base: baseObj.hostname
			});
			return false;
		}

		return true;
	} catch (error) {
		logger.error('URL validation failed', { error, url });
		return false;
	}
}
