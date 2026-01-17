import { json, error } from '@sveltejs/kit';
import { getPrivateSettingSync } from '../../../../../chunks/settingsService.js';
import { d as dbAdapter } from '../../../../../chunks/db.js';
import { e as extractMetadata, M as MediaService } from '../../../../../chunks/MediaService.server.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
function getMediaService() {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	try {
		const service = new MediaService(dbAdapter);
		logger.info('MediaService initialized successfully');
		return service;
	} catch (err) {
		const message = `Failed to initialize MediaService: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw new Error(message);
	}
}
const POST = async ({ request, locals }) => {
	const { user, tenantId } = locals;
	try {
		const formData = await request.formData();
		const processType = formData.get('processType');
		if (!processType || typeof processType !== 'string') {
			logger.warn('No process type specified', { tenantId });
			return json({ success: false, error: 'Process type not specified' }, { status: 400 });
		}
		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		}
		switch (processType) {
			case 'metadata':
				break;
			case 'save':
				break;
			case 'delete':
				break;
			default:
				throw error(400, `Unsupported process type: ${processType}`);
		}
		const mediaService = getMediaService();
		let result;
		switch (processType) {
			case 'metadata': {
				const file = formData.get('file');
				if (!file || !(file instanceof File)) {
					return json({ success: false, error: 'No valid file received' }, { status: 400 });
				}
				const buffer = Buffer.from(await file.arrayBuffer());
				const metadata = await extractMetadata(buffer);
				result = { success: true, data: metadata };
				break;
			}
			case 'save': {
				const files = formData.getAll('files');
				if (files.length === 0 || !files.every((f) => f instanceof File)) {
					return json({ success: false, error: 'No valid files received' }, { status: 400 });
				}
				if (!user) {
					throw error(401, 'User not authenticated');
				}
				const access = 'private';
				const watermarkOptionsString = formData.get('watermarkOptions');
				let watermarkOptions;
				if (watermarkOptionsString) {
					try {
						watermarkOptions = JSON.parse(watermarkOptionsString);
					} catch (e) {
						logger.warn('Could not parse watermark options', { options: watermarkOptionsString });
					}
				}
				const results = [];
				for (const file of files) {
					if (file instanceof File) {
						if (!file.name || typeof file.name !== 'string') {
							results.push({ fileName: 'unknown', success: false, error: 'Invalid file name' });
							continue;
						}
						try {
							const saveResult = await mediaService.saveMedia(file, user._id.toString(), access, tenantId, watermarkOptions);
							const savedItem = saveResult;
							results.push({
								fileName: file.name,
								success: true,
								data: savedItem
							});
							logger.info(`Successfully saved file: ${file.name}`, {
								userId: user._id,
								fileSize: file.size,
								tenantId,
								thumbnails: Object.keys(savedItem.thumbnails ?? {})
							});
						} catch (err) {
							const errorMsg = err instanceof Error ? err.message : String(err);
							logger.error(`Error saving file ${file.name}:`, { error: errorMsg, tenantId });
							results.push({ fileName: file.name, success: false, error: errorMsg });
						}
					}
				}
				result = { success: true, data: results };
				break;
			}
			case 'delete': {
				const mediaId = formData.get('mediaId');
				if (!mediaId || typeof mediaId !== 'string') {
					return json({ success: false, error: 'Invalid media ID' }, { status: 400 });
				}
				await mediaService.deleteMedia(mediaId);
				result = { success: true };
				break;
			}
			default:
				throw error(400, `Unsupported process type: ${processType}`);
		}
		return json({
			success: true,
			data: result
		});
	} catch (err) {
		const message = `Error processing media: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { tenantId });
		return json({ success: false, error: message }, { status: 500 });
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
