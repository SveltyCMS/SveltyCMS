import { error, json } from '@sveltejs/kit';
import { getPrivateSettingSync } from '../../../../../chunks/settingsService.js';
import { M as MediaService } from '../../../../../chunks/MediaService.server.js';
import { d as dbAdapter } from '../../../../../chunks/db.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
function getMediaService() {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	try {
		const service = new MediaService(dbAdapter);
		return service;
	} catch (err) {
		const message = `Failed to initialize MediaService: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw new Error(message);
	}
}
const POST = async ({ request, locals }) => {
	const { user, tenantId } = locals;
	if (!user) {
		logger.warn('Unauthorized: No user session found during remote media save');
		throw error(401, 'Unauthorized');
	}
	if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
		logger.error('Tenant ID is missing in a multi-tenant setup.');
		throw error(400, 'Could not identify the tenant for this operation.');
	}
	try {
		const { fileUrl, access = 'public', basePath } = await request.json();
		if (!fileUrl) {
			throw error(400, 'File URL is required');
		}
		const validAccess = ['public', 'private', 'protected'].includes(access) ? access : 'public';
		const mediaBasePath = tenantId || basePath || 'global';
		const mediaService = getMediaService();
		const result = await mediaService.saveRemoteMedia(fileUrl, user._id.toString(), validAccess, mediaBasePath);
		logger.info('Remote media saved successfully', { fileUrl, userId: user._id, tenantId, access: validAccess });
		return json({ success: true, media: result });
	} catch (err) {
		const message = `Error saving remote media: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { userId: user._id, tenantId });
		throw error(500, message);
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
