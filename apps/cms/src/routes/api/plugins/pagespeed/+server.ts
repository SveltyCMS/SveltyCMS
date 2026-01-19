/**
 * @file src/routes/api/plugins/pagespeed/+server.ts
 * @description API endpoint for PageSpeed Insights plugin
 *
 * POST /api/plugins/pagespeed
 * - Fetches PageSpeed Insights for an entry
 * - Validates URL (SSRF protection)
 * - Stores results in database
 * - Returns latest metrics
 *
 * Security:
 * - Requires authentication (enforced by hooks.server.ts)
 * - Validates tenant isolation
 * - Derives URL from entry data (no arbitrary URLs)
 * - Uses private API key from settings
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPublicSettingSync, getPrivateSettingSync } from '@shared/services/settingsService';
import { contentManager } from '@cms/content/ContentManager';
import { deriveEntryUrl, validateUrl } from '@cms/plugins/pagespeed/urlUtils';
import { fetchPageSpeedInsights, storeResult, getCachedResult } from '@cms/plugins/pagespeed/service';
import type { PageSpeedResult } from '@cms/plugins/pagespeed/types';
import { logger } from '@shared/utils/logger.server';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user, tenantId, dbAdapter } = locals;

	// Authentication check (should be handled by hooks, but double-check)
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	if (!dbAdapter) {
		throw error(500, 'Database adapter not available');
	}

	try {
		// Parse request body
		const body = await request.json();
		const { entryId, collectionId, language, device = 'mobile', forceRefresh = false } = body;

		// Validate required parameters
		if (!entryId || !collectionId || !language) {
			throw error(400, 'Missing required parameters: entryId, collectionId, language');
		}

		// Validate device
		if (device !== 'mobile' && device !== 'desktop') {
			throw error(400, 'Invalid device type. Must be "mobile" or "desktop"');
		}

		// Get collection schema
		await contentManager.initialize(tenantId);
		const schema = await contentManager.getCollectionById(collectionId, tenantId);

		if (!schema) {
			throw error(404, `Collection ${collectionId} not found`);
		}

		// Get entry data to derive URL
		const collectionTableName = `collection_${collectionId}`;
		const entryResult = await dbAdapter.crud.findOne(collectionTableName, { _id: entryId });

		if (!entryResult.success || !entryResult.data) {
			throw error(404, `Entry ${entryId} not found`);
		}

		// Validate tenant isolation
		const entry = entryResult.data as unknown as Record<string, unknown>;
		const multiTenant = getPrivateSettingSync('MULTI_TENANT');
		if (multiTenant && entry.tenantId !== tenantId) {
			throw error(403, 'Access denied: tenant mismatch');
		}

		// Check for cached result (unless force refresh)
		if (!forceRefresh) {
			const cached = await getCachedResult(dbAdapter, entryId, collectionId, language, device, tenantId);

			if (cached) {
				logger.debug('Returning cached PageSpeed result', { entryId, language, device });
				return json({
					success: true,
					data: cached,
					cached: true
				});
			}
		}

		// Derive URL from entry
		const baseUrl = getPublicSettingSync('SITE_URL' as any) as string;
		const baseLocale = (getPublicSettingSync('BASE_LOCALE') as string) || 'en';

		if (!baseUrl) {
			throw error(500, 'SITE_URL not configured in system settings');
		}

		const url = deriveEntryUrl(baseUrl, language, baseLocale, entry, schema);

		if (!url) {
			throw error(400, 'Could not derive URL for entry. Ensure entry has a slug field.');
		}

		// Validate URL (SSRF protection)
		if (!validateUrl(url, baseUrl)) {
			throw error(400, 'Invalid URL derived from entry');
		}

		// Fetch PageSpeed Insights
		logger.info('Fetching PageSpeed Insights', { url, device, entryId });
		const metrics = await fetchPageSpeedInsights(url, device);

		if (!metrics) {
			throw error(500, 'Failed to fetch PageSpeed Insights. Check API key configuration.');
		}

		// Store result in database
		const result: Omit<PageSpeedResult, '_id' | 'createdAt' | 'updatedAt'> = {
			entryId,
			collectionId,
			tenantId,
			language,
			device,
			url,
			...metrics,
			fetchedAt: new Date()
		};

		const stored = await storeResult(dbAdapter, result);

		if (!stored) {
			logger.error('Failed to store PageSpeed result', { entryId });
			// Continue anyway - user still gets the result
		}

		return json({
			success: true,
			data: result,
			cached: false
		});
	} catch (err) {
		// Re-throw SvelteKit errors
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		logger.error('PageSpeed API error', { error: err });
		throw error(500, 'Internal server error');
	}
};
