/**
 * @file src/routes/api/plugins/pagespeed/+server.ts
 * @description API endpoint for PageSpeed Insights plugin
 */

import { json } from '@sveltejs/kit';
import { getPublicSettingSync, getPrivateSettingSync } from '@src/services/settingsService';
import { contentManager } from '@src/content/ContentManager';
import { deriveEntryUrl, validateUrl } from '@src/plugins/pagespeed/urlUtils';
import { fetchPageSpeedInsights, storeResult, getCachedResult } from '@src/plugins/pagespeed/service';
import type { PageSpeedResult } from '@src/plugins/pagespeed/types';
import { logger } from '@utils/logger.server';

// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';

export const POST = apiHandler(async ({ request, locals }) => {
	const { user, tenantId, dbAdapter } = locals;

	// Authentication check
	if (!user) {
		throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	}

	if (!dbAdapter) {
		throw new AppError('Database adapter not available', 500, 'DB_UNAVAILABLE');
	}

	try {
		// Parse request body
		const body = await request.json();
		const { entryId, collectionId, language, device = 'mobile', forceRefresh = false } = body;

		// Validate required parameters
		if (!entryId || !collectionId || !language) {
			throw new AppError('Missing required parameters: entryId, collectionId, language', 400, 'MISSING_PARAMS');
		}

		// Validate device
		if (device !== 'mobile' && device !== 'desktop') {
			throw new AppError('Invalid device type. Must be "mobile" or "desktop"', 400, 'INVALID_DEVICE');
		}

		// Get collection schema
		await contentManager.initialize(tenantId);
		const schema = contentManager.getCollectionById(collectionId, tenantId);

		if (!schema) {
			throw new AppError(`Collection ${collectionId} not found`, 404, 'COLLECTION_NOT_FOUND');
		}

		// Get entry data to derive URL
		const collectionTableName = `collection_${collectionId}`;
		const entryResult = await dbAdapter.crud.findOne(collectionTableName, { _id: entryId } as any);

		if (!entryResult.success || !entryResult.data) {
			throw new AppError(`Entry ${entryId} not found`, 404, 'ENTRY_NOT_FOUND');
		}

		// Validate tenant isolation
		const entry = entryResult.data as unknown as Record<string, unknown>;
		const multiTenant = getPrivateSettingSync('MULTI_TENANT' as any);
		if (multiTenant && entry.tenantId !== tenantId) {
			throw new AppError('Access denied: tenant mismatch', 403, 'TENANT_MISMATCH');
		}

		// Check for cached result (unless force refresh)
		if (!forceRefresh) {
			const cached = await getCachedResult(dbAdapter, entryId, collectionId, language, device, tenantId || 'default');

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
		const baseLocale = (getPublicSettingSync('BASE_LOCALE' as any) as string) || 'en';

		if (!baseUrl) {
			throw new AppError('SITE_URL not configured in system settings', 500, 'CONFIG_ERROR');
		}

		const url = deriveEntryUrl(baseUrl, language, baseLocale, entry, schema);

		if (!url) {
			throw new AppError('Could not derive URL for entry. Ensure entry has a slug field.', 400, 'URL_DERIVATION_FAILED');
		}

		// Validate URL (SSRF protection)
		if (!validateUrl(url, baseUrl)) {
			throw new AppError('Invalid URL derived from entry', 400, 'INVALID_URL');
		}

		// Fetch PageSpeed Insights
		logger.info('Fetching PageSpeed Insights', { url, device, entryId });
		const metrics = await fetchPageSpeedInsights(url, device);

		if (!metrics) {
			throw new AppError('Failed to fetch PageSpeed Insights. Check API key configuration.', 500, 'API_ERROR');
		}

		// Store result in database
		const result: Omit<PageSpeedResult, '_id' | 'createdAt' | 'updatedAt'> = {
			entryId,
			collectionId,
			tenantId: tenantId || 'default',
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
		// Re-throw AppError or SvelteKit errors
		if (err instanceof AppError) throw err;
		if (err && typeof err === 'object' && 'status' in err) throw err;

		logger.error('PageSpeed API error', { error: err });
		throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
	}
});
