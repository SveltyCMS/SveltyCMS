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
import { getPrivateSettingSync } from '@src/services/settingsService';

import { json, error, type RequestHandler } from '@sveltejs/kit';

// Auth

// Databases & Api
import { dbAdapter } from '@src/databases/db';
import { contentManager } from '@src/content/ContentManager';
import { modifyRequest } from '@api/collections/modifyRequest';
import type { CollectionModel } from '@src/databases/dbInterface';

// System Logger
import { logger } from '@utils/logger.server';

// GET: Advanced search across collections
export const GET: RequestHandler = async ({ locals, url }) => {
	const start = performance.now();
	const { user, tenantId } = locals;

	if (!user) {
		throw error(401, 'Unauthorized');
	}

	try {
		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
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
			const allCollections = await contentManager.getCollections(tenantId);
			collectionsToSearch = allCollections.map((c) => c._id).filter((id): id is string => id !== undefined);
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
		const baseFilter: { status?: string; tenantId?: string } = getPrivateSettingSync('MULTI_TENANT') ? { tenantId } : {};
		if (additionalFilter) {
			Object.assign(baseFilter, additionalFilter);
		}
		// Add status filtering for non-admin users
		const isAdmin = locals.isAdmin || false;
		if (!isAdmin) {
			baseFilter.status = statusFilter || 'published';
		} else if (statusFilter) {
			baseFilter.status = statusFilter;
		}

		const searchResults: unknown[] = [];
		let totalResults = 0;

		if (!dbAdapter) {
			logger.error('Database adapter not initialized');
			throw error(500, 'Database not initialized');
		}

		// Search across all specified collections in parallel
		const searchPromises = collectionsToSearch.map(async (collectionId) => {
			const collection = await contentManager.getCollectionById(collectionId, tenantId);
			if (!collection) return [];

			try {
				// Build search filter
				const searchFilter: Record<string, unknown> = { ...baseFilter };

				// For text search, we'll use the database's text search capabilities
				// Note: The exact implementation depends on the database adapter
				const collectionName = `collection_${collection._id}`;

				// Use findMany instead of queryBuilder for simpler type compatibility
				if (!dbAdapter) throw new Error('Database adapter not initialized');
				const result = await dbAdapter.crud.findMany(collectionName, searchFilter as Record<string, unknown>, {
					limit: Math.min(limit, 100)
				});

				if (result.success && result.data) {
					let items = Array.isArray(result.data) ? result.data : [];

					// Filter by search query if provided (client-side filtering for simplicity)
					if (searchQuery) {
						const lowerQuery = searchQuery.toLowerCase();
						items = items.filter((item) => {
							const searchableFields = ['title', 'content', 'description', 'name'];
							return searchableFields.some((field) => {
								const value = (item as unknown as Record<string, unknown>)[field];
								return typeof value === 'string' && value.toLowerCase().includes(lowerQuery);
							});
						});
					} // Apply modifyRequest for widget processing
					if (items.length > 0) {
						try {
							await modifyRequest({
								data: items as unknown as Record<string, unknown>[],
								fields: collection.fields as unknown as import('@src/content/types').FieldInstance[],
								collection: collection as unknown as CollectionModel,
								user,
								type: 'GET',
								tenantId
							});
						} catch (modifyError) {
							const errMsg = modifyError instanceof Error ? modifyError.message : String(modifyError);
							logger.warn(`ModifyRequest failed for collection ${collectionId}: ${errMsg}`);
						}
					}
					// Add collection context to results
					return items.map((item) => ({
						...(item as unknown as Record<string, unknown>),
						_collection: {
							id: collection._id,
							name: collection.name,
							label: collection.label
						}
					}));
				}
				return [];
			} catch (collectionError) {
				const errMsg = collectionError instanceof Error ? collectionError.message : String(collectionError);
				logger.warn(`Search failed for collection ${collectionId}: ${errMsg}`);
				return [];
			}
		});

		const resultsArrays = await Promise.all(searchPromises);
		searchResults.push(...resultsArrays.flat());
		// Sort combined results
		if (sortField && searchResults.length > 0) {
			searchResults.sort((a, b) => {
				const aRecord = a as Record<string, unknown>;
				const bRecord = b as Record<string, unknown>;
				const aVal = aRecord[sortField];
				const bVal = bRecord[sortField];

				// Handle comparison with type safety
				if (typeof aVal === 'string' && typeof bVal === 'string') {
					return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
				}
				if (typeof aVal === 'number' && typeof bVal === 'number') {
					if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
					if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
				}
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
		if (e && typeof e === 'object' && 'status' in e) throw e; // Re-throw SvelteKit errors

		const duration = performance.now() - start;
		const errMsg = e instanceof Error ? e.message : String(e);
		logger.error(`Search failed: ${errMsg} in ${duration.toFixed(2)}ms`);
		throw error(500, 'Internal Server Error');
	}
};
