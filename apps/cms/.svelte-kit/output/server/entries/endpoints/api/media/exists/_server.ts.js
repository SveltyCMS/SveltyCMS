import { error, json } from '@sveltejs/kit';
import { getPrivateSettingSync } from '../../../../../chunks/settingsService.js';
import { f as fileExists } from '../../../../../chunks/mediaStorage.server.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
const GET = async ({ url, locals }) => {
	const { user, tenantId } = locals;
	if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
		throw error(400, 'Tenant could not be identified for this operation.');
	}
	try {
		const fileUrl = url.searchParams.get('url');
		if (!fileUrl) {
			throw error(400, 'URL parameter is required');
		}
		const exists = await fileExists(fileUrl);
		logger.debug('Media file existence check', {
			fileUrl,
			exists,
			userId: user?._id,
			tenantId
		});
		return json({ exists });
	} catch (err) {
		const message = `Error checking file existence: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { userId: user?._id, tenantId });
		throw error(500, message);
	}
};
export { GET };
//# sourceMappingURL=_server.ts.js.map
