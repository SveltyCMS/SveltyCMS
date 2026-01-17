import { getPrivateSettingSync } from '../../../../chunks/settingsService.js';
import { error, json } from '@sveltejs/kit';
import { d as dbAdapter } from '../../../../chunks/db.js';
import { contentManager } from '../../../../chunks/ContentManager.js';
import { m as modifyRequest } from '../../../../chunks/modifyRequest.js';
import { l as logger } from '../../../../chunks/logger.server.js';
const GET = async ({ locals, url }) => {
	const start = performance.now();
	const { user, tenantId } = locals;
	if (!user) {
		throw error(401, 'Unauthorized');
	}
	try {
		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		}
		const searchQuery = url.searchParams.get('q') || '';
		const collectionsParam = url.searchParams.get('collections');
		const page = Number(url.searchParams.get('page') ?? 1);
		const limit = Number(url.searchParams.get('limit') ?? 25);
		const sortField = url.searchParams.get('sortField') || 'updatedAt';
		const sortDirection = url.searchParams.get('sortDirection') || 'desc';
		const filterParam = url.searchParams.get('filter');
		const statusFilter = url.searchParams.get('status');
		let collectionsToSearch = [];
		if (collectionsParam) {
			collectionsToSearch = collectionsParam.split(',').map((c) => c.trim());
		} else {
			const allCollections = await contentManager.getCollections(tenantId);
			collectionsToSearch = allCollections.map((c) => c._id).filter((id) => id !== void 0);
		}
		let additionalFilter = {};
		if (filterParam) {
			try {
				additionalFilter = JSON.parse(filterParam);
			} catch {
				throw error(400, 'Invalid filter parameter');
			}
		}
		const baseFilter = getPrivateSettingSync('MULTI_TENANT') ? { tenantId } : {};
		if (additionalFilter) {
			Object.assign(baseFilter, additionalFilter);
		}
		const isAdmin = locals.isAdmin || false;
		if (!isAdmin) {
			baseFilter.status = statusFilter || 'published';
		} else if (statusFilter) {
			baseFilter.status = statusFilter;
		}
		const searchResults = [];
		let totalResults = 0;
		if (!dbAdapter) {
			logger.error('Database adapter not initialized');
			throw error(500, 'Database not initialized');
		}
		const searchPromises = collectionsToSearch.map(async (collectionId) => {
			const collection = await contentManager.getCollectionById(collectionId, tenantId);
			if (!collection) return [];
			try {
				const searchFilter = { ...baseFilter };
				const collectionName = `collection_${collection._id}`;
				if (!dbAdapter) throw new Error('Database adapter not initialized');
				const result = await dbAdapter.crud.findMany(collectionName, searchFilter, {
					limit: Math.min(limit, 100)
				});
				if (result.success && result.data) {
					let items = Array.isArray(result.data) ? result.data : [];
					if (searchQuery) {
						const lowerQuery = searchQuery.toLowerCase();
						items = items.filter((item) => {
							const searchableFields = ['title', 'content', 'description', 'name'];
							return searchableFields.some((field) => {
								const value = item[field];
								return typeof value === 'string' && value.toLowerCase().includes(lowerQuery);
							});
						});
					}
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
							const errMsg = modifyError instanceof Error ? modifyError.message : String(modifyError);
							logger.warn(`ModifyRequest failed for collection ${collectionId}: ${errMsg}`);
						}
					}
					return items.map((item) => ({
						...item,
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
		if (sortField && searchResults.length > 0) {
			searchResults.sort((a, b) => {
				const aRecord = a;
				const bRecord = b;
				const aVal = aRecord[sortField];
				const bVal = bRecord[sortField];
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
		if (e && typeof e === 'object' && 'status' in e) throw e;
		const duration = performance.now() - start;
		const errMsg = e instanceof Error ? e.message : String(e);
		logger.error(`Search failed: ${errMsg} in ${duration.toFixed(2)}ms`);
		throw error(500, 'Internal Server Error');
	}
};
export { GET };
//# sourceMappingURL=_server.ts.js.map
