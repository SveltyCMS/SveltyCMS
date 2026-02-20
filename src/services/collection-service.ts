/**
 * @file src/services/collection-service.ts
 * @description Service for retrieving and caching collection data.
 * Centralizes logic previously found in +page.server.ts to enable pre-warming and consistent caching.
 */

import type { CollectionEntry, FieldDefinition, RevisionData, Schema } from '@src/content/types';
import type { User } from '@src/databases/auth/types';
import { cacheService } from '@src/databases/cache-service';
import type { IDBAdapter } from '@src/databases/db-interface';
import { modifyRequest } from '@src/routes/api/collections/modify-request';
import { getPrivateSettingSync } from '@src/services/settings-service';
import { error } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';

// Helper to get dbAdapter safely via dynamic import to avoid circular dep issues
const getDbAdapter = async () => (await import('@src/databases/db')).dbAdapter as IDBAdapter;

interface CollectionDataParams {
	bypassCache?: boolean;
	collection: Schema;
	editEntryId?: string;
	filter?: Record<string, unknown>;
	language: string;
	page?: number;
	pageSize?: number;
	search?: string;
	sort?: { field: string; direction: 'asc' | 'desc' };
	tenantId?: string;
	user: User;
}

export class CollectionService {
	private static instance: CollectionService;

	private constructor() {}

	public static getInstance(): collectionService {
		if (!CollectionService.instance) {
			CollectionService.instance = new CollectionService();
		}
		return CollectionService.instance;
	}

	/**
	 * Retrieves collection data with caching, modifyRequest, and pagination.
	 */
	public async getCollectionData(params: CollectionDataParams): Promise<{
		contentLanguage: string;
		collectionSchema: Schema;
		entries: CollectionEntry[];
		pagination: {
			totalItems: number;
			pagesCount: number;
			currentPage: number;
			pageSize: number;
		};
		revisions: RevisionData[];
	}> {
		const {
			collection,
			page = 1,
			pageSize = 10,
			sort = { field: '_createdAt', direction: 'desc' },
			filter = {},
			search = '',
			language,
			user,
			tenantId,
			editEntryId,
			bypassCache = false
		} = params;

		// 1. Define Cache Key
		const cacheKey = `collection:${collection._id}:page:${page}:size:${pageSize}:filter:${JSON.stringify(
			filter
		)}:search:${search}:sort:${JSON.stringify(sort)}:edit:${editEntryId || 'none'}:lang:${language}:tenant:${tenantId}:user:${user._id}`;

		if (!bypassCache) {
			const cachedData = await cacheService.get(cacheKey);
			if (cachedData) {
				logger.debug(`Cache HIT for key: \x1b[33m${cacheKey}\x1b[0m`);
				return cachedData as {
					contentLanguage: string;
					collectionSchema: Schema;
					entries: CollectionEntry[];
					pagination: {
						totalItems: number;
						pagesCount: number;
						currentPage: number;
						pageSize: number;
					};
					revisions: RevisionData[];
				};
			}
			logger.debug(`Cache MISS for key: \x1b[33m${cacheKey}\x1b[0m`);
		}

		// 2. Load Paginated Entries (DB Query)
		const dbAdapter = await getDbAdapter();
		if (!dbAdapter) {
			throw error(500, 'Database adapter is not available.');
		}

		const collectionTableName = `collection_${collection._id}`;
		const finalFilter: Record<string, unknown> = { ...filter };
		if (getPrivateSettingSync('MULTI_TENANT')) {
			finalFilter.tenantId = tenantId;
		}

		if (editEntryId) {
			finalFilter._id = editEntryId;
		}

		logger.debug(`[CollectionService] Querying table: ${collectionTableName}`, {
			finalFilter,
			tenantId
		});

		let query = dbAdapter.queryBuilder(collectionTableName).where(finalFilter);

		// Add global search
		if (search) {
			const searchableFields = collection.fields
				.map((field: FieldDefinition) => {
					const fieldObj = field as Record<string, unknown>;
					return (fieldObj.name || fieldObj.path || fieldObj.key || fieldObj.db_fieldName) as string | null;
				})
				.filter((name): name is string => typeof name === 'string');

			searchableFields.push('_id', 'status', 'createdBy', 'updatedBy');
			query = query.search(search, searchableFields as any);
		}

		// Sort and Paginate
		query = query.sort(sort.field as any, sort.direction).paginate({ page, pageSize });

		// Count Query
		let countQuery = dbAdapter.queryBuilder(collectionTableName).where(finalFilter);
		if (search) {
			const searchableFields = collection.fields
				.map((field: FieldDefinition) => {
					const fieldObj = field as Record<string, unknown>;
					return (fieldObj.name || fieldObj.path || fieldObj.key || fieldObj.db_fieldName) as string | null;
				})
				.filter((name): name is string => typeof name === 'string');
			searchableFields.push('_id', 'status', 'createdBy', 'updatedBy');
			countQuery = countQuery.search(search, searchableFields as any);
		}

		// Execute
		let entries: CollectionEntry[] = [];
		let totalItems = 0;

		const [entriesResult, countResult] = await Promise.all([query.execute(), countQuery.count()]);

		if (entriesResult.success && countResult.success) {
			entries = (entriesResult.data || []) as unknown as CollectionEntry[];
			totalItems = countResult.data as number;
		} else {
			logger.error('Failed to load collection entries', {
				entriesResult,
				countResult
			});
			// Fallback to empty
		}

		// 3. Run modify-request
		if (entries.length > 0) {
			await modifyRequest({
				data: entries,
				fields: collection.fields as any, // Fields has complex union, leaving cast for now but minimizing surface
				collection: collection as any,
				user,
				type: 'GET',
				tenantId
			});
		}

		// 4. Language Projection (View Mode)
		if (!editEntryId) {
			for (let i = 0; i < entries.length; i++) {
				const entry = entries[i] as any;
				for (const field of collection.fields as any[]) {
					const f = field as any;
					const fieldName = f.db_fieldName || f.label;
					if (f.translated && entry[fieldName] && typeof entry[fieldName] === 'object' && !Array.isArray(entry[fieldName])) {
						const value = entry[fieldName][language];
						entry[fieldName] = value !== undefined && value !== null && value !== '' ? value : '-';
					}
				}
			}
		}

		// 5. Plugin SSR Hooks
		const pluginData: Record<string, Record<string, unknown>> = {};
		if (!editEntryId && entries.length > 0) {
			try {
				const { pluginRegistry } = await import('@src/plugins');
				const hooks = await pluginRegistry.getSSRHooks(collection._id as string, tenantId, collection);

				if (hooks.length > 0) {
					logger.debug('Running plugin SSR hooks', {
						collectionId: collection._id,
						hooksCount: hooks.length,
						entriesCount: entries.length
					});

					const pluginContext = {
						user,
						tenantId: tenantId || 'default',
						language,
						dbAdapter,
						collectionSchema: collection
					};

					// Run all plugin hooks and collect their data
					const allPluginData = await Promise.all(hooks.map((hook) => hook(pluginContext, entries)));

					// Merge plugin data by entry ID
					for (const hookData of allPluginData) {
						for (const entryData of hookData) {
							if (!pluginData[entryData.entryId]) {
								pluginData[entryData.entryId] = {};
							}
							Object.assign(pluginData[entryData.entryId], entryData.data);
						}
					}

					// Attach plugin data to entries
					entries = entries.map((entry) => {
						const pData = pluginData[entry._id as string];
						if (pData) {
							return { ...entry, pluginData: pData };
						}
						return entry;
					});

					logger.debug('Plugin SSR hooks completed', {
						entriesWithData: Object.keys(pluginData).length
					});
				}
			} catch (err) {
				logger.warn('Failed to run plugin SSR hooks', { error: err });
				// Don't fail page load if plugins fail
			}
		}

		// 6. Revisions (For Edit Mode)
		let revisionsMeta: RevisionData[] = [];
		if (editEntryId && collection.revision) {
			try {
				const { getRevisions } = await import('@src/services/revision-service');
				const revisionsResult = await getRevisions({
					collectionId: collection._id as string,
					entryId: editEntryId,
					tenantId: tenantId || '',
					dbAdapter,
					limit: 100
				});
				if (revisionsResult.success && 'data' in revisionsResult) {
					revisionsMeta = ((revisionsResult.data as any).items || []) as RevisionData[];
				}
			} catch (e) {
				logger.warn('Failed to load revisions', e);
			}
		}

		// 7. Prepare Return Data
		const collectionSchemaForClient = JSON.parse(JSON.stringify(collection));

		const returnData = {
			contentLanguage: language,
			collectionSchema: collectionSchemaForClient,
			entries: entries || [],
			pagination: {
				totalItems: totalItems || 0,
				pagesCount: Math.ceil((totalItems || 0) / pageSize),
				currentPage: page,
				pageSize
			},
			revisions: revisionsMeta || []
		};

		// 8. Cache It
		try {
			await cacheService.set(cacheKey, returnData, 300);
		} catch (e) {
			logger.warn('Failed to cache collection data', e);
		}

		return returnData;
	}
}

export const collectionService = CollectionService.getInstance();
