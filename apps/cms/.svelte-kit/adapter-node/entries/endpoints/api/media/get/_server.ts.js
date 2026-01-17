import { error } from '@sveltejs/kit';
import { getPrivateSettingSync } from '../../../../../chunks/settingsService.js';
import { g as getFile } from '../../../../../chunks/mediaStorage.server.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
const GET = async ({ url, locals }) => {
	const { user, tenantId } = locals;
	if (!user) {
		throw error(401, 'Unauthorized');
	}
	if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
		throw error(400, 'Tenant could not be identified for this operation.');
	}
	try {
		const fileUrl = url.searchParams.get('url');
		if (!fileUrl) {
			throw error(400, 'URL parameter is required');
		}
		const buffer = await getFile(fileUrl);
		logger.debug('Media file retrieved successfully', {
			fileUrl,
			fileSize: buffer.length,
			userId: user?._id,
			tenantId
		});
		return new Response(new Uint8Array(buffer), {
			headers: {
				'Content-Type': 'application/octet-stream',
				'Content-Disposition': `attachment; filename="${fileUrl.split('/').pop()}"`,
				'Content-Length': buffer.length.toString()
			}
		});
	} catch (err) {
		const message = `Error retrieving file: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, {
			fileUrl: url.searchParams.get('url'),
			userId: user?._id,
			tenantId
		});
		throw error(500, message);
	}
};
export { GET };
//# sourceMappingURL=_server.ts.js.map
