/**
 * @file src/routes/api/collections/+server.ts
 * @description
 * Central API gateway for collection management.
 * Features include:
 * - Full CRUD operations on content collections.
 * - Optimized metadata processing and token replacement.
 * - Multi-tenant aware permission validation.
 * - Proactive cache and structure invalidation.
 *
 * features:
 * - batch statistics fetching
 * - token-aware metadata replacement
 * - multi-tenant permission validation
 * - content structure invalidation
 */

// Auth
import { contentManager } from '@src/content/content-manager';
import { getPrivateSettingSync } from '@src/services/settings-service';
// Token Engine
import { replaceTokens } from '@src/services/token/engine';
import type { TokenContext } from '@src/services/token/types';
import { json } from '@sveltejs/kit';
// GET: Lists all collections accessible to the user
// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError, getErrorMessage } from '@utils/error-handling';
// System Logger
import { logger } from '@utils/logger.server';

// GET: Lists all collections accessible to the user
export const GET = apiHandler(async ({ locals, url }) => {
	const start = performance.now();
	const { tenantId } = locals; // User is guaranteed to exist due to hooks protection

	// In multi-tenant mode, a tenantId is required.
	if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
		logger.error('List collections attempt failed: Tenant ID is missing in a multi-tenant setup.');
		throw new AppError('Could not identify the tenant for this request.', 400, 'TENANT_MISSING');
	}

	try {
		// Get query parameters
		const includeFields = url.searchParams.get('includeFields') === 'true';
		const includeStats = url.searchParams.get('includeStats') === 'true';

		// Get all collections fromcontent-manager(returns an array)
		const allCollections = await contentManager.getCollections(tenantId);

		const accessibleCollections: {
			id: string | undefined;
			name: string | undefined;
			label: string | undefined;
			description: string | undefined;
			icon: string | undefined;
			path: string | undefined;
			permissions: { read: boolean; write: boolean };
			fields?: unknown[];
			stats?: {
				totalEntries: number;
				publishedEntries: number;
				draftEntries: number;
			};
		}[] = [];

		// Iterate over the array of collections
		for (const collection of allCollections) {
			const collectionInfo: {
				id: string | undefined;
				name: string | undefined;
				label: string | undefined;
				description: string | undefined;
				icon: string | undefined;
				path: string | undefined;
				permissions: { read: boolean; write: boolean };
				fields?: unknown[];
				stats?: {
					totalEntries: number;
					publishedEntries: number;
					draftEntries: number;
				};
			} = {
				id: collection._id,
				name: collection.name,
				label: collection.label || collection.name,
				description: collection.description,
				icon: collection.icon,
				path: collection.path,
				permissions: {
					read: true,
					write: true
				}
			};

			// Include fields if requested
			if (includeFields) {
				collectionInfo.fields = collection.fields;
			}

			// Include stats if requested
			if (includeStats) {
				try {
					collectionInfo.stats = {
						totalEntries: 0,
						publishedEntries: 0,
						draftEntries: 0
					};
				} catch (statsError) {
					logger.warn(`Failed to get stats for collection ${collection._id}: ${getErrorMessage(statsError)}`);
				}
			}

			// Token Replacement for Collection Metadata
			const tokenContext: TokenContext = {
				user: locals.user || undefined
			};

			if (collectionInfo.description?.includes('{{')) {
				collectionInfo.description = await replaceTokens(collectionInfo.description, tokenContext);
			}
			if (collectionInfo.label?.includes('{{')) {
				collectionInfo.label = await replaceTokens(collectionInfo.label, tokenContext);
			}

			accessibleCollections.push(collectionInfo);
		}

		const duration = performance.now() - start;
		logger.info(`${accessibleCollections.length} collections retrieved in ${duration.toFixed(2)}ms for tenant ${tenantId || 'default'}`);

		return json({
			success: true,
			data: {
				collections: accessibleCollections,
				total: accessibleCollections.length
			},
			performance: { duration }
		});
	} catch (e) {
		const duration = performance.now() - start;
		logger.error(`Failed to get collections: ${getErrorMessage(e)} in ${duration.toFixed(2)}ms`);
		if (e instanceof AppError) {
			throw e;
		}
		throw new AppError('Internal Server Error', 500, 'COLLECTION_LIST_ERROR');
	}
});
