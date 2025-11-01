/**
 * @file src/routes/(app)/[language]/[...collection]/+page.server.ts
 * @description Server-side loading for collection pages.
 *
 * This module handles all data loading for collection pages, including the collection schema,
 * paginated entries, and revision history. It leverages server-side caching to ensure fast
 * performance. All data is fetched on the server and passed to the page component,
 * eliminating client-side data fetching for collections.
 */
/**
 * @file src/routes/(app)/[language]/[...collection]/+page.server.ts
 * @description Server-side loading for collection pages. Refactored for SSR data fetching.
 */
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Core SveltyCMS services
import { contentManager } from '@src/content/ContentManager';
import { cacheService } from '@src/databases/CacheService';
import { modifyRequest } from '@src/routes/api/collections/modifyRequest';
import { getPublicSettingSync, getPrivateSettingSync } from '@src/services/settingsService';
import { logger } from '@utils/logger.server';

export const load: PageServerLoad = async ({ locals, params, url, fetch }) => {
	const { user, tenantId, dbAdapter } = locals;
	const { language, collection } = params;

	try {
		// =================================================================
		// 1. PRE-FLIGHT CHECKS & REDIRECTS (from original file)
		// =================================================================
		if (!user) {
			throw redirect(302, '/login');
		}

		const collectionNameOnly = collection?.split('/').pop();
		const systemPages = ['config', 'user', 'dashboard', 'imageEditor', 'email-previews'];
		if (collectionNameOnly && systemPages.includes(collectionNameOnly)) {
			throw redirect(302, `/${collectionNameOnly}${url.search}`);
		}

		const availableLanguages = getPublicSettingSync('AVAILABLE_CONTENT_LANGUAGES') || ['en'];
		if (user?.systemLanguage && user.systemLanguage !== language && availableLanguages.includes(user.systemLanguage)) {
			const newPath = url.pathname.replace(`/${language}/`, `/${user.systemLanguage}/`);
			throw redirect(302, newPath);
		}

		if (user.lastAuthMethod === 'token') {
			throw redirect(302, '/user');
		}

		// =================================================================
		// 2. GET COLLECTION SCHEMA
		// =================================================================
		const collectionPath = `/${collection}`;
		const currentCollection = contentManager.getCollection(collectionPath, tenantId);

		if (!currentCollection) {
			if (collectionNameOnly === 'Collections') {
				const allCollections = await contentManager.getCollections(tenantId);
				if (allCollections.length > 0) {
					throw redirect(302, `/${language}${allCollections[0].path}`);
				} else {
					throw redirect(302, '/dashboard');
				}
			}
			logger.warn(`Collection not found by path: ${collectionPath}`, { tenantId });
			throw error(404, `Collection not found: ${collection}`);
		}

		// =================================================================
		// 3. DEFINE CACHE KEY & CHECK CACHE
		// =================================================================
		const page = Number(url.searchParams.get('page') ?? 1);
		const pageSize = Number(url.searchParams.get('pageSize') ?? 10);
		const sortField = url.searchParams.get('sort') || '_createdAt';
		const sortOrder = url.searchParams.get('order') || 'desc';
		const sortParams = { field: sortField, direction: sortOrder as 'asc' | 'desc' };
		const mode = url.searchParams.get('mode') || 'view';

		const filterParams: Record<string, { contains: string }> = {};
		for (const [key, value] of url.searchParams.entries()) {
			if (key.startsWith('filter_')) {
				const filterKey = key.substring(7); // remove "filter_"
				filterParams[filterKey] = { contains: value }; // Assuming a 'contains' filter strategy
			}
		}

		const cacheKey = `collection:${currentCollection._id}:page:${page}:size:${pageSize}:filter:${JSON.stringify(
			filterParams
		)}:sort:${JSON.stringify(sortParams)}:mode:${mode}:tenant:${tenantId}`;

		const cachedData = await cacheService.get(cacheKey);
		if (cachedData) {
			logger.debug(`Cache HIT for key: \x1b[33m${cacheKey}\x1b[0m`);
			return cachedData;
		}
		logger.debug(`Cache MISS for key: \x1b[33m${cacheKey}\x1b[0m`);

		// =================================================================
		// 4. LOAD PAGINATED ENTRIES (DB QUERY)
		// =================================================================
		const collectionTableName = `collection_${currentCollection._id}`;

		const finalFilter: Record<string, unknown> = { ...filterParams };
		if (getPrivateSettingSync('MULTI_TENANT')) {
			finalFilter.tenantId = tenantId;
		}

		const query = dbAdapter
			.queryBuilder(collectionTableName)
			.where(finalFilter)
			.sort(sortParams.field, sortParams.direction)
			.paginate({ page, pageSize });

		const [entriesResult, countResult] = await Promise.all([query.execute(), dbAdapter.queryBuilder(collectionTableName).where(finalFilter).count()]);

		if (!entriesResult.success || !countResult.success) {
			const dbError = entriesResult.error || countResult.error || 'Unknown database error';
			logger.error('Failed to load collection entries.', { error: dbError });
			throw error(500, `Failed to load collection entries: ${dbError}`);
		}

		const entries = entriesResult.data;
		const totalItems = countResult.data;

		// =================================================================
		// 5. RUN MODIFYREQUEST (Enrich entries)
		// =================================================================
		if (entries.length > 0) {
			await modifyRequest({
				data: entries,
				fields: currentCollection.fields,
				collection: currentCollection,
				user,
				type: 'GET',
				tenantId
			});
		}

		// =================================================================
		// 6. LOAD REVISIONS (for Fields.svelte)
		// =================================================================
		let revisionsMeta = [];
		// Only load revisions if we're in edit mode and have an entry ID
		const entryId = url.searchParams.get('entry');
		if (mode === 'edit' && entryId && currentCollection.revision) {
			try {
				// Call the API endpoint internally using SvelteKit's fetch (auto-handles auth cookies)
				const revisionsUrl = `/api/collections/${currentCollection._id}/${entryId}/revisions?limit=100`;
				const response = await fetch(revisionsUrl);

				if (response.ok) {
					const result = await response.json();
					if (result.success && result.data) {
						revisionsMeta = result.data.revisions || [];
					}
				} else {
					logger.warn('Revisions API returned error', { status: response.status, entryId });
				}
			} catch (err) {
				logger.warn('Failed to load revisions', { error: err, entryId });
				// Don't fail the whole page load if revisions fail
			}
		}

		// =================================================================
		// 7. PREPARE FINAL DATA & SET CACHE
		// =================================================================

		// Strip all non-serializable data (functions, circular refs, etc.) from collection schema
		// This is necessary because widgets contain validation schemas with functions
		const collectionSchemaForClient = JSON.parse(JSON.stringify(currentCollection));

		const returnData = {
			theme: locals.theme,
			user: {
				_id: locals.user?._id,
				username: locals.user?.username,
				email: locals.user?.email,
				role: locals.user?.role,
				avatar: locals.user?.avatar,
				systemLanguage: locals.user?.systemLanguage
			},
			isAdmin: locals.isAdmin,
			hasManageUsersPermission: locals.hasManageUsersPermission,
			roles: locals.roles,
			siteName: getPublicSettingSync('SITE_NAME') || 'SveltyCMS',
			contentLanguage: language,
			collectionSchema: collectionSchemaForClient,
			entries: entries || [],
			pagination: {
				totalItems: totalItems || 0,
				pagesCount: Math.ceil((totalItems || 0) / pageSize),
				currentPage: page,
				pageSize: pageSize
			},
			revisions: revisionsMeta || []
		};

		try {
			await cacheService.set(cacheKey, returnData, 300);
		} catch (cacheError) {
			logger.warn('Failed to cache response', { error: cacheError });
			// Continue without caching
		}

		return returnData;
	} catch (err) {
		logger.error('Error loading collection page', {
			error: err,
			collection,
			language,
			url: url.pathname
		});
		throw err;
	}
};
