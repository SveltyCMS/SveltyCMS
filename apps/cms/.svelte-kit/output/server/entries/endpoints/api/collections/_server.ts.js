import { g as getErrorMessage } from '../../../../chunks/errorHandling.js';
import { getPrivateSettingSync } from '../../../../chunks/settingsService.js';
import { error, json } from '@sveltejs/kit';
import { contentManager } from '../../../../chunks/ContentManager.js';
import { r as replaceTokens } from '../../../../chunks/engine.js';
import { l as logger } from '../../../../chunks/logger.server.js';
const GET = async ({ locals, url }) => {
	const start = performance.now();
	const { tenantId } = locals;
	if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
		logger.error('List collections attempt failed: Tenant ID is missing in a multi-tenant setup.');
		throw error(400, 'Could not identify the tenant for this request.');
	}
	try {
		const includeFields = url.searchParams.get('includeFields') === 'true';
		const includeStats = url.searchParams.get('includeStats') === 'true';
		const allCollections = await contentManager.getCollections(tenantId);
		const accessibleCollections = [];
		for (const collection of allCollections) {
			const collectionInfo = {
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
			if (includeFields) {
				collectionInfo.fields = collection.fields;
			}
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
			const tokenContext = {
				user: locals.user || void 0
			};
			if (collectionInfo.description && collectionInfo.description.includes('{{')) {
				collectionInfo.description = await replaceTokens(collectionInfo.description, tokenContext);
			}
			if (collectionInfo.label && collectionInfo.label.includes('{{')) {
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
		throw error(500, 'Internal Server Error');
	}
};
export { GET };
//# sourceMappingURL=_server.ts.js.map
