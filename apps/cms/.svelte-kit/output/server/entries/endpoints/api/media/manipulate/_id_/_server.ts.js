import { json } from '@sveltejs/kit';
import { d as dbAdapter } from '../../../../../../chunks/db.js';
import { M as MediaService } from '../../../../../../chunks/MediaService.server.js';
import { l as logger } from '../../../../../../chunks/logger.server.js';
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
const POST = async ({ request, params, locals }) => {
	const { user, tenantId } = locals;
	const { id } = params;
	if (!user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}
	if (!id) {
		return json({ success: false, error: 'Media ID not specified' }, { status: 400 });
	}
	try {
		const manipulations = await request.json();
		if (!manipulations || typeof manipulations !== 'object') {
			return json({ success: false, error: 'Invalid manipulation data' }, { status: 400 });
		}
		const mediaService = getMediaService();
		await mediaService.updateMedia(id, manipulations);
		if (!locals.user) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}
		const updatedMedia = await mediaService.getMedia(id, locals.user, locals.roles);
		return json({
			success: true,
			data: updatedMedia
		});
	} catch (err) {
		const message = `Error manipulating media: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { mediaId: id, tenantId });
		return json({ success: false, error: message }, { status: 500 });
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
