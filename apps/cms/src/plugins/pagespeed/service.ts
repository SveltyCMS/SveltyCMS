/**
 * @file src/plugins/pagespeed/service.ts
 * @description Google PageSpeed Insights API integration
 *
 * Security features:
 * - API key stored in private settings only
 * - SSRF protection via URL validation
 * - Rate limiting via caching
 */

import type { PageSpeedResult, GooglePageSpeedResponse } from './types';
import type { IDBAdapter } from '@shared/database/dbInterface';
import { logger } from '@shared/utils/logger.server';
import { getPrivateSettingSync } from '@shared/services/settingsService';

/**
 * Fetch PageSpeed Insights for a URL
 *
 * @param url - URL to test (must be validated first)
 * @param device - Device type (mobile or desktop)
 * @returns PageSpeed metrics or null on error
 */
export async function fetchPageSpeedInsights(url: string, device: 'mobile' | 'desktop'): Promise<Partial<PageSpeedResult> | null> {
	try {
		// Get API key from private settings
		const apiKey = getPrivateSettingSync('GOOGLE_PAGESPEED_API_KEY');

		if (!apiKey) {
			logger.warn('Google PageSpeed API key not configured');
			return null;
		}

		// Call Google PageSpeed Insights API
		const apiUrl = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
		apiUrl.searchParams.set('url', url);
		apiUrl.searchParams.set('strategy', device);
		apiUrl.searchParams.set('key', apiKey as string);
		apiUrl.searchParams.set('category', 'performance');

		logger.debug('Calling PageSpeed Insights API', { url, device });

		const response = await fetch(apiUrl.toString(), {
			method: 'GET',
			headers: {
				Accept: 'application/json'
			}
		});

		if (!response.ok) {
			logger.error('PageSpeed API request failed', {
				status: response.status,
				statusText: response.statusText,
				url
			});
			return null;
		}

		const data = (await response.json()) as GooglePageSpeedResponse;

		// Extract metrics
		const result: Partial<PageSpeedResult> = {
			performanceScore: Math.round(data.lighthouseResult.categories.performance.score * 100),
			fcp: data.lighthouseResult.audits['first-contentful-paint']?.numericValue,
			lcp: data.lighthouseResult.audits['largest-contentful-paint']?.numericValue,
			cls: data.lighthouseResult.audits['cumulative-layout-shift']?.numericValue,
			tti: data.lighthouseResult.audits.interactive?.numericValue,
			tbt: data.lighthouseResult.audits['total-blocking-time']?.numericValue,
			si: data.lighthouseResult.audits['speed-index']?.numericValue,
			fetchedAt: new Date()
		};

		logger.info('PageSpeed Insights fetched successfully', {
			url,
			device,
			score: result.performanceScore
		});

		return result;
	} catch (error) {
		logger.error('Failed to fetch PageSpeed Insights', { error, url, device });
		return null;
	}
}

/**
 * Get cached PageSpeed result from database
 *
 * @param dbAdapter - Database adapter
 * @param entryId - Entry ID
 * @param collectionId - Collection ID
 * @param language - Content language
 * @param device - Device type
 * @param tenantId - Tenant ID
 * @param maxAgeMinutes - Maximum age of cached result (default: 1440 = 24 hours)
 */
export async function getCachedResult(
	dbAdapter: IDBAdapter,
	entryId: string,
	collectionId: string,
	language: string,
	device: 'mobile' | 'desktop',
	tenantId: string,
	maxAgeMinutes: number = 1440
): Promise<PageSpeedResult | null> {
	try {
		const result = await dbAdapter.crud.findOne<PageSpeedResult>('plugin_pagespeed_results', {
			entryId,
			collectionId,
			language,
			device,
			tenantId
		});

		if (!result.success || !result.data) {
			return null;
		}

		// Check if result is too old
		const ageMinutes = (Date.now() - new Date(result.data.fetchedAt).getTime()) / 1000 / 60;
		if (ageMinutes > maxAgeMinutes) {
			logger.debug('Cached PageSpeed result is stale', {
				entryId,
				ageMinutes,
				maxAgeMinutes
			});
			return null;
		}

		return result.data;
	} catch (error) {
		logger.error('Failed to get cached PageSpeed result', { error, entryId });
		return null;
	}
}

/**
 * Store PageSpeed result in database
 *
 * @param dbAdapter - Database adapter
 * @param result - PageSpeed result to store
 */
export async function storeResult(dbAdapter: IDBAdapter, result: Omit<PageSpeedResult, '_id' | 'createdAt' | 'updatedAt'>): Promise<boolean> {
	try {
		// Check if result already exists (update) or new (insert)
		const existing = await dbAdapter.crud.findOne<PageSpeedResult>('plugin_pagespeed_results', {
			entryId: result.entryId,
			collectionId: result.collectionId,
			language: result.language,
			device: result.device,
			tenantId: result.tenantId
		});

		if (existing.success && existing.data) {
			// Update existing record
			const updateResult = await dbAdapter.crud.update<PageSpeedResult>('plugin_pagespeed_results', existing.data._id!, result);

			if (!updateResult.success) {
				logger.error('Failed to update PageSpeed result', { error: (updateResult as any).error });
				return false;
			}
		} else {
			// Insert new record
			const insertResult = await dbAdapter.crud.insert<PageSpeedResult>('plugin_pagespeed_results', result);

			if (!insertResult.success) {
				logger.error('Failed to insert PageSpeed result', { error: (insertResult as any).error });
				return false;
			}
		}

		logger.debug('PageSpeed result stored', {
			entryId: result.entryId,
			language: result.language,
			device: result.device
		});

		return true;
	} catch (error) {
		logger.error('Failed to store PageSpeed result', { error });
		return false;
	}
}

/**
 * Get multiple cached results for entry list
 *
 * @param dbAdapter - Database adapter
 * @param entryIds - Array of entry IDs
 * @param collectionId - Collection ID
 * @param language - Content language
 * @param device - Device type
 * @param tenantId - Tenant ID
 */
export async function getMultipleCachedResults(
	dbAdapter: IDBAdapter,
	entryIds: string[],
	collectionId: string,
	language: string,
	device: 'mobile' | 'desktop',
	tenantId: string
): Promise<Map<string, PageSpeedResult>> {
	const results = new Map<string, PageSpeedResult>();

	try {
		const queryResult = await dbAdapter.crud.findMany<PageSpeedResult>('plugin_pagespeed_results', {
			entryId: { $in: entryIds },
			collectionId,
			language,
			device,
			tenantId
		} as any);

		if (queryResult.success && queryResult.data) {
			for (const result of queryResult.data) {
				results.set(result.entryId, result);
			}
		}
	} catch (error) {
		logger.error('Failed to get multiple cached results', { error });
	}

	return results;
}
