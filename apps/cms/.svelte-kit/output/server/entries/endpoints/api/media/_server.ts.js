import { error, json } from '@sveltejs/kit';
import { getPrivateSettingSync } from '../../../../chunks/settingsService.js';
import { d as dbAdapter } from '../../../../chunks/db.js';
import { l as logger } from '../../../../chunks/logger.server.js';
import * as v from 'valibot';
const QuerySchema = v.object({
	limit: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(50)), 5)
});
const GET = async ({ locals, url }) => {
	const { user, tenantId } = locals;
	try {
		if (!user) {
			throw error(401, 'Unauthorized');
		}
		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		}
		const query = v.parse(QuerySchema, {
			limit: Number(url.searchParams.get('limit')) || void 0
		});
		if (!dbAdapter) {
			logger.error('Database adapter not available');
			throw error(500, 'Database connection unavailable');
		}
		const result = await dbAdapter.media.files.getByFolder(void 0, {
			page: 1,
			pageSize: query.limit,
			sortField: 'updatedAt',
			sortDirection: 'desc'
		});
		if (!result.success) {
			logger.error('Failed to fetch media files from database', {
				error: result.error,
				requestedBy: user?._id,
				tenantId
			});
			throw error(500, 'Failed to retrieve media files');
		}
		const mediaFiles = result.data.items.map((file) => {
			const normalizePath = (p) => {
				let path = p.replace(/^mediaFolder\//, '').replace(/^files\//, '');
				path = path.replace(/^\/+/, '');
				return `/files/${path}`;
			};
			const thumbnails = file.thumbnails
				? Object.entries(file.thumbnails).reduce((acc, [key, val]) => {
						if (val) {
							acc[key] = { ...val, url: normalizePath(val.url) };
						}
						return acc;
					}, {})
				: void 0;
			return {
				...file,
				url: normalizePath(file.path),
				thumbnails
			};
		});
		logger.info('Media files fetched successfully via database adapter', {
			count: mediaFiles.length,
			total: result.data.total,
			requestedBy: user?._id,
			tenantId
		});
		return json(mediaFiles);
	} catch (err) {
		const httpError = err;
		const status = httpError.status || 500;
		const message = httpError.body?.message || httpError.message || 'Internal Server Error';
		logger.error('Error fetching media files:', { error: message, status, tenantId: locals.tenantId });
		throw error(status, message);
	}
};
export { GET };
//# sourceMappingURL=_server.ts.js.map
