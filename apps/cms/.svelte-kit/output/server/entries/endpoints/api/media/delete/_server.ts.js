import { error, json } from '@sveltejs/kit';
import { getPrivateSettingSync } from '../../../../../chunks/settingsService.js';
import { d as deleteFile } from '../../../../../chunks/mediaStorage.server.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
const DELETE = async ({ request, locals }) => {
	const { user, tenantId } = locals;
	if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
		throw error(400, 'Tenant could not be identified for this operation.');
	}
	try {
		const { url } = await request.json();
		if (!url) {
			throw error(400, 'URL is required');
		}
		await deleteFile(url);
		logger.info('File deleted successfully', {
			url,
			user: user?.email || 'unknown',
			tenantId
		});
		return json({ success: true });
	} catch (err) {
		const message = `Error deleting file: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { user: user?.email || 'unknown', tenantId });
		throw error(500, message);
	}
};
export { DELETE };
//# sourceMappingURL=_server.ts.js.map
