import { redirect, error } from '@sveltejs/kit';
import { contentManager } from '../../../../chunks/ContentManager.js';
import { cacheService } from '../../../../chunks/CacheService.js';
import { m as modifyRequest } from '../../../../chunks/modifyRequest.js';
import { getPublicSettingSync, getPrivateSettingSync } from '../../../../chunks/settingsService.js';
import { l as logger } from '../../../../chunks/logger.server.js';
const load = async ({ locals, params, url }) => {
	const { user, tenantId, dbAdapter } = locals;
	const typedUser = user;
	const { language, collection } = params;
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
		await contentManager.initialize(tenantId);
		const isUUID = /^[a-f0-9]{32}$/i.test(collection || '');
		let currentCollection;
		if (isUUID) {
			logger.debug(`Loading collection by UUID: \x1B[33m${collection}\x1B[0m`);
			currentCollection = contentManager.getCollectionById(collection, tenantId);
			if (currentCollection && currentCollection.path) {
				const newPath = `/${language}${currentCollection.path}${url.search}`;
				logger.debug(`Redirecting UUID to canonical path: ${newPath}`);
				throw redirect(302, newPath);
			}
		} else {
			const collectionPath = `/${collection}`;
			logger.debug(`Loading collection by path: \x1B[34m${collectionPath}\x1B[0m`);
			currentCollection = contentManager.getCollection(collectionPath, tenantId);
		}
		if (!currentCollection) {
			if (collectionNameOnly === 'Collections') {
				const allCollections = await contentManager.getCollections(tenantId);
				if (allCollections.length > 0) {
					throw redirect(302, `/${language}${allCollections[0].path}`);
				} else {
					throw redirect(302, '/config/collectionbuilder');
				}
			}
			logger.warn(`Collection not found: ${collection}`, { tenantId, isUUID });
			throw error(404, `Collection not found: ${collection}`);
		}
		if (!isUUID && currentCollection.path && `/${collection}` !== currentCollection.path) {
			logger.warn(`Serving content from non-canonical path: /${collection}. Canonical is ${currentCollection.path}`);
		}
		const page = Number(url.searchParams.get('page') ?? 1);
		const pageSize = Number(url.searchParams.get('pageSize') ?? 10);
		const sortField = url.searchParams.get('sort') || '_createdAt';
		const sortOrder = url.searchParams.get('order') || 'desc';
		const sortParams = { field: sortField, direction: sortOrder };
		const editEntryId = url.searchParams.get('edit');
		const globalSearch = url.searchParams.get('search') || '';
		const filterParams = {};
		let forceEmpty = false;
		for (const [key, value] of url.searchParams.entries()) {
			if (key.startsWith('filter_')) {
				const filterKey = key.substring(7);
				if ((filterKey === 'createdAt' || filterKey === 'updatedAt') && value) {
					if (isNaN(Date.parse(value)) && !/^\d+$/.test(value)) {
						forceEmpty = true;
					}
				}
				filterParams[filterKey] = { contains: value };
			}
		}
		const cacheKey = `collection:${currentCollection._id}:page:${page}:size:${pageSize}:filter:${JSON.stringify(
			filterParams
		)}:search:${globalSearch}:sort:${JSON.stringify(sortParams)}:edit:${editEntryId || 'none'}:lang:${language}:tenant:${tenantId}`;
		const cachedData = await cacheService.get(cacheKey);
		if (cachedData) {
			logger.debug(`Cache HIT for key: \x1B[33m${cacheKey}\x1B[0m`);
			return cachedData;
		}
		logger.debug(`Cache MISS for key: \x1B[33m${cacheKey}\x1B[0m`);
		const collectionTableName = `collection_${currentCollection._id}`;
		const finalFilter = { ...filterParams };
		if (getPrivateSettingSync('MULTI_TENANT')) {
			finalFilter.tenantId = tenantId;
		}
		logger.debug(`[EntryList] Querying table: ${collectionTableName}`, { finalFilter, tenantId });
		if (editEntryId) {
			finalFilter._id = editEntryId;
		}
		if (!dbAdapter) {
			logger.error('Database adapter is not available.', { tenantId });
			throw error(500, 'Database adapter is not available.');
		}
		let query = dbAdapter.queryBuilder(collectionTableName).where(finalFilter);
		if (globalSearch) {
			const searchableFields = currentCollection.fields
				.map((field) => {
					const fieldObj = field;
					if (typeof fieldObj.name === 'string') {
						return fieldObj.name;
					}
					if (typeof fieldObj.path === 'string') {
						return fieldObj.path;
					}
					if (typeof fieldObj.key === 'string') {
						return fieldObj.key;
					}
					if (typeof fieldObj.db_fieldName === 'string') {
						return fieldObj.db_fieldName;
					}
					return null;
				})
				.filter((name) => name !== null);
			searchableFields.push('_id', 'status', 'createdBy', 'updatedBy');
			logger.debug(`[Global Search] Searching for "${globalSearch}" across fields: ${searchableFields.join(', ')}`);
			query = query.search(globalSearch, searchableFields);
		}
		query = query.sort(sortParams.field, sortParams.direction).paginate({ page, pageSize });
		let countQuery = dbAdapter.queryBuilder(collectionTableName).where(finalFilter);
		if (globalSearch) {
			const searchableFields = currentCollection.fields
				.map((field) => {
					const fieldObj = field;
					return fieldObj.name || fieldObj.path || fieldObj.key || fieldObj.db_fieldName;
				})
				.filter((name) => typeof name === 'string');
			searchableFields.push('_id', 'status', 'createdBy', 'updatedBy');
			countQuery = countQuery.search(globalSearch, searchableFields);
		}
		let entries = [];
		let totalItems = 0;
		if (!forceEmpty) {
			const [entriesResult, countResult] = await Promise.all([query.execute(), countQuery.count()]);
			if (!entriesResult.success || !countResult.success) {
				const dbError =
					(!entriesResult.success && 'error' in entriesResult ? entriesResult.error : void 0) ||
					(!countResult.success && 'error' in countResult ? countResult.error : void 0) ||
					'Unknown database error';
				const errStr = typeof dbError === 'object' ? JSON.stringify(dbError) : String(dbError);
				if (errStr.includes('Cast') || errStr.includes('convert')) {
					logger.warn('Invalid filter value caused DB error, returning empty result.', { error: dbError });
					entries = [];
					totalItems = 0;
				} else {
					logger.error('Failed to load collection entries.', { error: dbError });
					throw error(500, `Failed to load collection entries: ${errStr}`);
				}
			} else {
				entries = entriesResult.data || [];
				totalItems = countResult.data;
			}
		}
		if (entries.length > 0) {
			await modifyRequest({
				data: entries,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				fields: currentCollection.fields,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				collection: currentCollection,
				user: typedUser,
				type: 'GET',
				tenantId
			});
		}
		if (!editEntryId) {
			for (let i = 0; i < entries.length; i++) {
				const entry = entries[i];
				for (const field of currentCollection.fields) {
					const fieldName = field.db_fieldName || field.label;
					if (
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						field.translated && // eslint-disable-next-line @typescript-eslint/no-explicit-any
						entry[fieldName] && // eslint-disable-next-line @typescript-eslint/no-explicit-any
						typeof entry[fieldName] === 'object' && // eslint-disable-next-line @typescript-eslint/no-explicit-any
						!Array.isArray(entry[fieldName])
					) {
						const value = entry[fieldName][language];
						entry[fieldName] = value !== void 0 && value !== null && value !== '' ? value : '-';
					}
				}
			}
		}
		let revisionsMeta = [];
		if (editEntryId && currentCollection.revision) {
			try {
				const { getRevisions } = await import('../../../../chunks/RevisionService.js');
				const revisionsResult = await getRevisions({
					collection: currentCollection,
					entryId: editEntryId,
					tenantId: tenantId || '',
					dbAdapter,
					limit: 100
				});
				if (revisionsResult.success && revisionsResult.data) {
					revisionsMeta = revisionsResult.data || [];
				}
			} catch (err) {
				logger.warn('Failed to load revisions', { error: err, editEntryId });
			}
		}
		const collectionSchemaForClient = JSON.parse(JSON.stringify(currentCollection));
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
		try {
			await cacheService.set(cacheKey, returnData, 300);
		} catch (cacheError) {
			logger.warn('Failed to cache response', { error: cacheError });
		}
		return returnData;
	} catch (err) {
		if (err?.status >= 300 && err?.status < 400 && err?.location) {
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
export { load };
//# sourceMappingURL=_page.server.ts.js.map
