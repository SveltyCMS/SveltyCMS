import { error, json } from '@sveltejs/kit';
import { getPrivateSettingSync } from '../../../../../chunks/settingsService.js';
import { a as auth } from '../../../../../chunks/db.js';
import { m as moveMediaToTrash } from '../../../../../chunks/mediaStorage.server.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
const POST = async ({ request, locals }) => {
	const { user, tenantId } = locals;
	if (!auth) {
		logger.error('Auth service is not initialized');
		throw error(500, 'Auth service not available');
	}
	if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
		throw error(400, 'Tenant could not be identified for this operation.');
	}
	try {
		const { url, contentTypes } = await request.json();
		if (!url || !contentTypes) {
			throw error(400, 'URL and collection types are required');
		}
		await moveMediaToTrash(url);
		logger.info('Media file moved to trash successfully', { url, userId: user?._id, tenantId });
		return json({ success: true });
	} catch (err) {
		const message = `Error moving file to trash: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { tenantId });
		throw error(500, message);
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
