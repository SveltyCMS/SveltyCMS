/**
 * @file src/routes/api/search/+server.ts
 * @description API endpoint for searching across collections
 *
 * @example: GET /api/search?q=searchterm&collections=posts,pages&limit=10
 *
 * Features:
 * * Cross-collection search functionality, scoped to the current tenant
 * * Full-text search capabilities
 * * Advanced filtering and sorting
 * * Permission-aware results
 * * Performance optimized with QueryBuilder
 */
import { privateEnv } from '@root/config/private';

import { json, error, type RequestHandler } from '@sveltejs/kit';

// Auth
import { roles } from '@root/config/roles';

// Databases & Api
import { dbAdapter } from '@src/databases/db';
import { contentManager } from '@src/content/ContentManager';
import { modifyRequest } from '@api/collections/modifyRequest';

// System Logger
import { logger } from '@utils/logger.svelte';

// GET: Advanced search across collections
export const GET: RequestHandler = async ({ locals, url }) => {
	const start = performance.now();
	const { user, tenantId } = locals;

	if (!user) {
		throw error(401, 'Unauthorized');
	}

	try {
		if (privateEnv.MULTI_TENANT && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		} // Parse query parameters

		const searchQuery = url.searchParams.get('q') || '';
		const collectionsParam = url.searchParams.get('collections');
		const page = Number(url.searchParams.get('page') ?? 1);
		const limit = Number(url.searchParams.get('limit') ?? 25);
		const sortField = url.searchParams.get('sortField') || 'updatedAt';
		const sortDirection = (url.searchParams.get('sortDirection') as 'asc' | 'desc') || 'desc';
		const filterParam = url.searchParams.get('filter');
		const statusFilter = url.searchParams.get('status');
		// Parse collections to search
		let collectionsToSearch: string[] = [];
		if (collectionsParam) {
			collectionsToSearch = collectionsParam.split(',').map((c) => c.trim());
		} else {
			// If no collections specified, search all collections within the tenant (hooks already validated access)
			const { collections: allCollections } = await contentManager.getCollectionData(tenantId);
			collectionsToSearch = Object.keys(allCollections);
		}
		// Parse additional filters
		let additionalFilter = {};
		if (filterParam) {
			try {
				additionalFilter = JSON.parse(filterParam);
			} catch {
				throw error(400, 'Invalid filter parameter');
			}
		}

		// --- MULTI-TENANCY: Scope all filters by tenantId ---
		const baseFilter: { status?: string; tenantId?: string } = privateEnv.MULTI_TENANT ? { tenantId } : {};
		if (additionalFilter) {
			Object.assign(baseFilter, additionalFilter);
		}
		// Add status filtering for non-admin users
		const userRole = roles.find((role) => role._id === user.role);
		const isAdmin = userRole?.isAdmin === true;
		if (!isAdmin) {
			baseFilter.status = statusFilter || 'published';
		} else if (statusFilter) {
			baseFilter.status = statusFilter;
		}

		const searchResults = [];
		let totalResults = 0;
		// Search across all specified collections
		for (const collectionId of collectionsToSearch) {
			const collection = await contentManager.getCollectionById(collectionId, tenantId);
			if (!collection) continue;

			try {
				// Build search filter
				let searchFilter = { ...baseFilter };

				if (searchQuery) {
					// Create text search filter
					searchFilter = {
						...searchFilter,
						$or: [
							{ title: { $regex: searchQuery, $options: 'i' } },
							{ content: { $regex: searchQuery, $options: 'i' } },
							{ description: { $regex: searchQuery, $options: 'i' } },
							{ name: { $regex: searchQuery, $options: 'i' } }
						]
					};
				}

				// Use QueryBuilder for efficient searching			const collectionName = `collection_${collection._id}`;
				const query = dbAdapter
					.queryBuilder(collectionName)
					.where(searchFilter)
					.sort(sortField, sortDirection)
					.paginate({ page, pageSize: Math.min(limit, 100) }); // Cap individual collection results

				const result = await query.execute();

				if (result.success && result.data) {
					const items = Array.isArray(result.data.items) ? result.data.items : Array.isArray(result.data) ? result.data : [];
					// Apply modifyRequest for widget processing
					if (items.length > 0) {
						try {
							await modifyRequest({
								data: items,
								fields: collection.fields,
								collection,
								user,
								type: 'GET',
								tenantId
							});
						} catch (modifyError) {
							logger.warn(`ModifyRequest failed for collection ${collectionId}: ${modifyError.message}`);
						}
					}
					// Add collection context to results
					const processedItems = items.map((item) => ({
						...item,
						_collection: {
							id: collection._id,
							name: collection.name,
							label: collection.label
						}
					}));

					searchResults.push(...processedItems);
					totalResults += result.data.total || items.length;
				}
			} catch (collectionError) {
				logger.warn(`Search failed for collection ${collectionId}: ${collectionError.message}`);
			}
		}
		// Sort combined results
		if (sortField && searchResults.length > 0) {
			searchResults.sort((a, b) => {
				const aVal = a[sortField];
				const bVal = b[sortField];

				if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
				if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
				return 0;
			});
		}
		// Apply pagination to combined results
		const startIndex = (page - 1) * limit;
		const paginatedResults = searchResults.slice(startIndex, startIndex + limit);

		const duration = performance.now() - start;
		logger.info(`Search completed: ${paginatedResults.length}/${totalResults} results in ${duration.toFixed(2)}ms`, { tenantId });

		return json({
			success: true,
			data: {
				items: paginatedResults,
				total: totalResults,
				page,
				pageSize: limit,
				totalPages: Math.ceil(totalResults / limit),
				collectionsSearched: collectionsToSearch.length,
				query: searchQuery
			},
			performance: { duration }
		});
	} catch (e) {
		if (e.status) throw e; // Re-throw SvelteKit errors

		const duration = performance.now() - start;
		logger.error(`Search failed: ${e.message} in ${duration.toFixed(2)}ms`);
		throw error(500, 'Internal Server Error');
	}
};
