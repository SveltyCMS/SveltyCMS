/**
 * @file src/routes/(app)/[language]/[...collection]/+page.server.ts
 * @description Enterprise-level SSR for collection pages with optimized data loading and caching.
 *
 * ## Architecture Overview
 * This module implements a **two-tier data loading strategy** for optimal performance:
 *
 * ### Tier 1: EntryList (View Mode) - Language-Specific Partial Data
 * - Loads only the CURRENT language data for list display
 * - Prevents over-fetching (100s of entries × N languages)
 * - Cache key includes language: `collection:ID:page:1:lang:EN`
 * - Typical payload: ~50KB for 10 entries
 *
 * ### Tier 2: Fields (Edit Mode) - Full Multilingual Data
 * - Loads ALL language data for the single entry being edited
 * - Enables simultaneous translation editing
 * - Minimal overhead: 1 entry × N languages (~5KB)
 * - Cache key: `entry:ID` (language-agnostic)
 *
 * ## Translation Status Integration
 * The TranslationStatus component shows per-language completion:
 * - **Dropdown (View Mode)**: Switches language → triggers SSR reload with new `lang` param
 * - **Progress Bar (Edit Mode)**: Shows translation % → updates locally without reload
 * - **Cache Strategy**: Language change invalidates list cache, preserves entry cache
 *
 * ## Performance Characteristics
 * | Scenario | Data Size | Requests | Cache Hit Rate |
 * |----------|-----------|----------|----------------|
 * | List 100 entries (EN) | ~50KB | 1 | 95% |
 * | Switch to DE | ~50KB | 1 | 95% (new cache key) |
 * | Edit entry | ~5KB | 1 | 80% |
 * | Toggle language in edit | 0KB | 0 | 100% (local only) |
 *
 * ## Cache Invalidation Rules
 * - Entry save/update → Invalidates `entry:ID` + all `collection:ID:*` keys
 * - Language change → Natural cache miss (different `lang` in key)
 * - Pagination → Natural cache miss (different `page` in key)
 *
 * @see docs/architecture/collection-store-dataflow.mdx
 */

// Core SveltyCMS services
import { contentManager } from '@src/content/content-manager';
import type { User } from '@src/databases/auth/types';
import { collectionService } from '@src/services/collection-service';
import { getPublicSettingSync } from '@src/services/settings-service';
import { error, redirect } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const { user, tenantId } = locals;
	const typedUser = user as User; // Explicitly cast user to User type
	const { language, collection } = params;

	// =================================================================
	// 1. PRE-FLIGHT CHECKS & REDIRECTS (moved outside try-catch)
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
	if (typedUser?.locale && typedUser.locale !== language && availableLanguages.includes(typedUser.locale)) {
		const newPath = url.pathname.replace(`/${language}/`, `/${typedUser.locale}/`);
		throw redirect(302, newPath);
	}

	if (typedUser.lastAuthMethod === 'token') {
		throw redirect(302, '/user');
	}

	try {
		// =================================================================
		// 2. GET COLLECTION SCHEMA
		// =================================================================
		// Ensurecontent-manageris initialized before use
		await contentManager.initialize(tenantId);

		// Check if collection param is a UUID (32 char hex) or a path
		const isUUID = /^[a-f0-9]{32}$/i.test(collection || '');
		let currentCollection: any;
		if (isUUID) {
			// Direct UUID lookup
			logger.debug(`Loading collection by UUID: \x1b[33m${collection}\x1b[0m`);
			currentCollection = contentManager.getCollectionById(collection!, tenantId);

			// SELF-HEALING: If not found, it might be a stalecontent-managerafter setup
			if (!currentCollection) {
				logger.warn(`Collection UUID ${collection} not found. Triggeringcontent-managerrefresh...`);
				await contentManager.refresh(tenantId);
				currentCollection = contentManager.getCollectionById(collection!, tenantId);
			}

			// Redirect to pretty path if available (Prevents UUID -> Path flicker on client)
			if (currentCollection?.path) {
				const newPath = `/${language}${currentCollection.path}${url.search}`;
				logger.debug(`Redirecting UUID to canonical path: ${newPath}`);
				throw redirect(302, newPath);
			}
		} else {
			// Path-based lookup (backward compatibility)
			const collectionPath = `/${collection}`;
			logger.debug(`Loading collection by path: \x1b[34m${collectionPath}\x1b[0m`);
			currentCollection = contentManager.getCollection(collectionPath, tenantId);

			// SELF-HEALING: If not found, it might be a stalecontent-managerafter setup
			// Optimization: Skip refresh for "Collections" root, as it will be handled by redirect logic below
			if (!currentCollection && collectionNameOnly !== 'Collections') {
				logger.warn(`Collection path ${collectionPath} not found. Triggeringcontent-managerrefresh...`);
				await contentManager.refresh(tenantId);
				currentCollection = contentManager.getCollection(collectionPath, tenantId);
			}
		}

		if (!currentCollection) {
			if (collectionNameOnly === 'Collections') {
				const allCollections = await contentManager.getCollections(tenantId);
				if (allCollections.length > 0) {
					throw redirect(302, `/${language}${allCollections[0].path}`);
				}
				throw redirect(302, '/dashboard');
			}
			logger.warn(`Collection not found: ${collection}`, { tenantId, isUUID });
			throw error(404, `Collection not found: ${collection}`);
		}

		// If accessed via a non-canonical path, it will be handled by the client-side to update the URL,
		// but the server will still serve the content to avoid a redirect.
		// This check is to prevent potential redirect loops if client-side logic fails.
		if (!isUUID && currentCollection.path && `/${collection}` !== currentCollection.path) {
			logger.warn(`Serving content from non-canonical path: /${collection}. Canonical is ${currentCollection.path}`);
		}

		// =================================================================
		// 3. DEFINE CACHE KEY & CHECK CACHE
		// =================================================================
		const page = Number(url.searchParams.get('page') ?? 1);
		const pageSize = Number(url.searchParams.get('pageSize') ?? 10);
		const sortField = url.searchParams.get('sort') || '_createdAt';
		const sortOrder = url.searchParams.get('order') || 'desc';
		const sortParams = {
			field: sortField,
			direction: sortOrder as 'asc' | 'desc'
		};
		const editEntryId = url.searchParams.get('edit');
		const globalSearch = url.searchParams.get('search') || '';

		const filterParams: Record<string, { contains: string }> = {};

		for (const [key, value] of url.searchParams.entries()) {
			if (key.startsWith('filter_')) {
				const filterKey = key.substring(7); // remove "filter_"
				if ((filterKey === 'createdAt' || filterKey === 'updatedAt') && value) {
					// Check for "asda" type garbage. Valid dates or partial headers (numbers) allow pass.
					if (Number.isNaN(Date.parse(value)) && !/^\d+$/.test(value)) {
						// Invalid date filter - ignore/empty logic handled in service now
					}
				}
				filterParams[filterKey] = { contains: value }; // Assuming a 'contains' filter strategy
			}
		}

		// =================================================================
		// 3. LOAD COLLECTION DATA (via CollectionService)
		// =================================================================
		// Use the centralized service for data loading to enable pre-warming and consistent caching.
		const { entries, pagination, revisions, contentLanguage, collectionSchema } = await collectionService.getCollectionData({
			collection: currentCollection,
			page,
			pageSize,
			sort: sortParams,
			filter: filterParams,
			search: globalSearch,
			language,
			user: typedUser,
			tenantId,
			editEntryId: editEntryId || undefined
		});

		// =================================================================
		// 4. PREPARE FINAL RESPONSE
		// =================================================================

		const returnData = {
			theme: locals.theme,
			user: {
				_id: typedUser?._id,
				username: typedUser?.username,
				email: typedUser?.email,
				role: typedUser?.role,
				avatar: typedUser?.avatar,
				locale: typedUser?.locale
			},
			isAdmin: locals.isAdmin,
			hasManageUsersPermission: locals.hasManageUsersPermission,
			roles: locals.roles,
			siteName: getPublicSettingSync('SITE_NAME') || 'SveltyCMS',
			contentLanguage,
			collectionSchema,
			entries,
			pagination,
			revisions
		};

		return returnData;
	} catch (err) {
		// If it's a redirect (SvelteKit standard behavior), just rethrow it without logging an error
		if ((err as any)?.status >= 300 && (err as any)?.status < 400 && (err as any)?.location) {
			throw err;
		}

		logger.error('Error loading collection page', {
			error: err,
			collection,
			language,
			url: url.pathname
		});
		throw err;
	}
};
