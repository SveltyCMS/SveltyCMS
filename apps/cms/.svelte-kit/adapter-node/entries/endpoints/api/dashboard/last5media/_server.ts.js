import { error, json } from '@sveltejs/kit';
import { getPrivateSettingSync } from '../../../../../chunks/settingsService.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
import * as v from 'valibot';
const MediaItemSchema = v.object({
	name: v.string(),
	size: v.number(),
	modified: v.date(),
	type: v.string(),
	url: v.string()
});
const GET = async ({ locals }) => {
	const dbAdapter = locals.dbAdapter;
	const { user, tenantId } = locals;
	if (!user) {
		logger.warn('Unauthorized attempt to access media data');
		throw error(401, 'Unauthorized');
	}
	try {
		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		}
		if (!dbAdapter) {
			logger.error('Database adapter not available');
			throw error(500, 'Database connection unavailable');
		}
		if (!dbAdapter.media || !dbAdapter.media.files || !dbAdapter.media.files.getByFolder) {
			logger.warn('Media adapter not available, returning empty result');
			return json([]);
		}
		const result = await dbAdapter.media.files.getByFolder(void 0, {
			page: 1,
			pageSize: 5,
			sortField: 'updatedAt',
			sortDirection: 'desc'
		});
		if (!result.success) {
			logger.error('Failed to fetch media files from database', {
				error: result.error,
				requestedBy: user?._id,
				tenantId
			});
			return json([]);
		}
		if (!result.data || !result.data.items || !Array.isArray(result.data.items)) {
			logger.warn('No media items found or invalid response structure');
			return json([]);
		}
		let items = result.data.items;
		if (getPrivateSettingSync('MULTI_TENANT') && tenantId) {
			items = items.filter((file) => file.tenantId === tenantId);
		}
		const recentMedia = items.map((file) => {
			let url = file.path || '';
			url = url.replace(/^mediaFolder\//, '').replace(/^files\//, '');
			url = url.replace(/^\/+/, '');
			return {
				name: file.filename || 'Unknown',
				size: file.size || 0,
				modified: new Date(file.updatedAt),
				type: file.mimeType.split('/')[1] || 'unknown',
				url: `/files/${url}`
			};
		});
		const validatedData = v.parse(v.array(MediaItemSchema), recentMedia);
		logger.info('Recent media fetched successfully via database adapter', {
			count: validatedData.length,
			total: result.data.total,
			requestedBy: user?._id,
			tenantId
		});
		return json(validatedData);
	} catch (err) {
		if (err instanceof v.ValiError) {
			logger.error('Media data failed validation', { error: err.issues });
			throw error(500, 'Internal Server Error: Could not prepare media data.');
		}
		logger.error('Error fetching recent media:', err);
		throw error(500, 'An unexpected error occurred.');
	}
};
export { GET };
//# sourceMappingURL=_server.ts.js.map
