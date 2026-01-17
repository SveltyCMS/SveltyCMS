import { getPrivateSettingSync } from '../../../../../chunks/settingsService.js';
import { error, json } from '@sveltejs/kit';
import { v4 } from 'uuid';
import { contentManager } from '../../../../../chunks/ContentManager.js';
import { d as dbAdapter } from '../../../../../chunks/db.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
import * as v from 'valibot';
import { n as nowISODateString } from '../../../../../chunks/dateUtils.js';
const QuerySchema = v.object({
	limit: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(20)), 5)
});
const ContentItemSchema = v.object({
	id: v.string(),
	title: v.string(),
	collection: v.string(),
	createdAt: v.string(),
	// ISODateString
	createdBy: v.string(),
	status: v.string()
});
const GET = async ({ locals, url }) => {
	const { user, tenantId } = locals;
	try {
		if (!user) {
			logger.warn('Unauthorized attempt to access recent content data');
			throw error(401, 'Unauthorized');
		}
		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		}
		const query = v.parse(QuerySchema, {
			limit: Number(url.searchParams.get('limit')) || void 0
		});
		let allCollections;
		try {
			allCollections = await contentManager.getCollections();
		} catch (err) {
			logger.error('Failed to get collections:', err);
			throw error(500, 'Could not access collections');
		}
		if (!allCollections || Object.keys(allCollections).length === 0) {
			logger.info('No collections found, returning empty result');
			return json([]);
		}
		const adapter = dbAdapter;
		if (!adapter) {
			logger.error('Database adapter not available');
			throw error(500, 'Database connection unavailable');
		}
		const collectionsEntries = Object.entries(allCollections);
		const resolveTimestamp = (e) => e.createdAt || e.created || e.date;
		const queryPromises = collectionsEntries.map(async ([collectionId, collection]) => {
			try {
				const collectionName = `collection_${collection._id}`;
				const filter = getPrivateSettingSync('MULTI_TENANT') ? { tenantId } : {};
				const result = await adapter.crud.findMany(collectionName, filter, {
					limit: query.limit,
					fields: ['_id', 'title', 'name', 'label', 'createdAt', 'updatedAt', 'created', 'date', 'createdBy', 'author', 'creator', 'status', 'state']
				});
				if (result.success && Array.isArray(result.data)) {
					return result.data.map((entry) => ({
						...entry,
						collectionName: collection.name || collection.label || 'Unknown Collection',
						collectionId
					}));
				}
				return [];
			} catch (err) {
				logger.warn(`Failed to query collection ${collection.name}:`, err);
				return [];
			}
		});
		const results = await Promise.all(queryPromises);
		const allEntries = results.flat();
		allEntries.sort((a, b) => {
			const tsA = resolveTimestamp(a);
			const tsB = resolveTimestamp(b);
			return new Date(tsB || 0).getTime() - new Date(tsA || 0).getTime();
		});
		const limitedEntries = allEntries.slice(0, query.limit);
		const userIds = [...new Set(limitedEntries.map((entry) => entry.createdBy || entry.author || entry.creator).filter(Boolean))];
		const userLookup = /* @__PURE__ */ new Map();
		if (userIds.length > 0) {
			try {
				const userResult = await adapter.crud.findByIds('auth_users', userIds, {
					fields: ['_id', 'username', 'email', 'firstName', 'lastName']
				});
				if (userResult.success && userResult.data) {
					for (const u of userResult.data) {
						let displayName = u.username;
						if (!displayName && (u.firstName || u.lastName)) {
							displayName = [u.firstName, u.lastName].filter(Boolean).join(' ');
						}
						if (!displayName) {
							displayName = u.email?.split('@')[0] || 'Unknown';
						}
						userLookup.set(String(u._id), displayName);
					}
				}
			} catch (err) {
				logger.warn('Failed to lookup usernames for content:', err);
			}
		}
		const recentContent = limitedEntries.map((entry) => {
			const userId = entry.createdBy || entry.author || entry.creator || 'Unknown';
			const username = userLookup.get(String(userId)) || 'Unknown';
			const ts = resolveTimestamp(entry);
			const iso = ts ? new Date(ts).toISOString() : nowISODateString();
			return {
				id: String(entry._id ?? entry.id ?? v4()),
				title: entry.title || entry.name || entry.label || 'Untitled',
				collection: entry.collectionName,
				createdAt: iso,
				createdBy: username,
				status: entry.status || entry.state || 'publish'
			};
		});
		const validatedData = v.parse(v.array(ContentItemSchema), recentContent);
		logger.info('Recent content fetched efficiently', {
			collectionsQueried: collectionsEntries.length,
			totalCandidates: allEntries.length,
			finalCount: validatedData.length,
			requestedBy: user?._id,
			tenantId
		});
		return json(validatedData);
	} catch (err) {
		if (err instanceof v.ValiError) {
			logger.error('Content data failed validation', { error: err.issues });
			throw error(500, 'Internal Server Error: Could not prepare content data.');
		}
		logger.error('Error fetching recent content:', err);
		throw error(500, 'An unexpected error occurred.');
	}
};
export { GET };
//# sourceMappingURL=_server.ts.js.map
