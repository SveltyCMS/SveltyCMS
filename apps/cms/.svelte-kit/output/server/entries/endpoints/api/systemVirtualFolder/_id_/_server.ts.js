import { error, json } from '@sveltejs/kit';
import { getPrivateSettingSync } from '../../../../../chunks/settingsService.js';
import { d as dbAdapter } from '../../../../../chunks/db.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
import { constructMediaUrl } from '../../../../../chunks/mediaUtils.js';
const GET = async ({ params, locals }) => {
	const { user, tenantId } = locals;
	const { id } = params;
	try {
		if (!user) {
			throw error(401, 'Authentication required');
		}
		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		}
		if (!dbAdapter) {
			throw error(500, 'Database adapter not available');
		}
		let currentFolder = null;
		let folders = [];
		let files = [];
		const tenantFilter = getPrivateSettingSync('MULTI_TENANT') ? { tenantId } : {};
		if (id === 'root') {
			const folderResult = await dbAdapter.systemVirtualFolder.getByParentId(null);
			folders = folderResult.success ? folderResult.data || [] : [];
			const fileQuery = { virtualFolderId: null, ...tenantFilter };
			const [imagesResult, documentsResult, audioResult, videosResult] = await Promise.all([
				dbAdapter.crud.findMany('media_images', fileQuery),
				dbAdapter.crud.findMany('media_documents', fileQuery),
				dbAdapter.crud.findMany('media_audio', fileQuery),
				dbAdapter.crud.findMany('media_videos', fileQuery)
			]);
			const images = imagesResult.success ? imagesResult.data || [] : [];
			const documents = documentsResult.success ? documentsResult.data || [] : [];
			const audio = audioResult.success ? audioResult.data || [] : [];
			const videos = videosResult.success ? videosResult.data || [] : [];
			files = [...images, ...documents, ...audio, ...videos];
		} else {
			const folderResult = await dbAdapter.systemVirtualFolder.getById(id);
			currentFolder = folderResult.success ? folderResult.data : null;
			if (!currentFolder) {
				throw error(404, 'Folder not found');
			}
			const subfolderResult = await dbAdapter.systemVirtualFolder.getByParentId(id);
			folders = subfolderResult.success ? subfolderResult.data || [] : [];
			const fileQuery = { virtualFolderId: id, ...tenantFilter };
			const [imagesResult, documentsResult, audioResult, videosResult] = await Promise.all([
				dbAdapter.crud.findMany('media_images', fileQuery),
				dbAdapter.crud.findMany('media_documents', fileQuery),
				dbAdapter.crud.findMany('media_audio', fileQuery),
				dbAdapter.crud.findMany('media_videos', fileQuery)
			]);
			const images = imagesResult.success ? imagesResult.data || [] : [];
			const documents = documentsResult.success ? documentsResult.data || [] : [];
			const audio = audioResult.success ? audioResult.data || [] : [];
			const videos = videosResult.success ? videosResult.data || [] : [];
			files = [...images, ...documents, ...audio, ...videos];
		}
		const processedFiles = files.map((file) => {
			try {
				const originalUrl = constructMediaUrl(file, 'original');
				const thumbnailUrl = constructMediaUrl(file, 'thumbnail');
				return {
					...file,
					url: originalUrl,
					thumbnail: {
						url: thumbnailUrl,
						width: file.thumbnailWidth || 200,
						height: file.thumbnailHeight || 200
					}
				};
			} catch (err) {
				logger.warn(`Failed to construct URL for file ${file.filename}: ${err}`);
				return {
					...file,
					url: '/Default_User.svg',
					thumbnail: {
						url: '/Default_User.svg',
						width: 200,
						height: 200
					}
				};
			}
		});
		logger.debug(`Fetched folder ${id}: ${processedFiles.length} files, ${folders.length} subfolders`, { tenantId });
		return json({
			success: true,
			data: {
				currentFolder,
				contents: {
					files: processedFiles,
					folders
				}
			}
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error occurred';
		logger.error(`Error fetching folder contents for ${id}: ${message}`, { tenantId });
		throw error(500, message);
	}
};
const PATCH = async ({ params, request, locals }) => {
	const { user, tenantId } = locals;
	const { id } = params;
	try {
		if (!user) {
			throw error(401, 'Authentication required');
		}
		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		}
		if (!dbAdapter) {
			throw error(500, 'Database adapter not available');
		}
		const body = await request.json();
		const { name } = body;
		if (!name || typeof name !== 'string') {
			throw error(400, 'Name is required and must be a string');
		}
		const currentResult = await dbAdapter.systemVirtualFolder.getById(id);
		if (!currentResult.success || !currentResult.data) {
			throw error(404, 'Folder not found');
		}
		const currentFolder = currentResult.data;
		let newPath = '';
		if (currentFolder.parentId) {
			const parentResult = await dbAdapter.systemVirtualFolder.getById(currentFolder.parentId);
			if (parentResult.success && parentResult.data) {
				newPath = `${parentResult.data.path}/${name.trim()}`;
			} else {
				throw error(400, 'Parent folder not found');
			}
		} else {
			newPath = `/${name.trim()}`;
		}
		const updateData = {
			name: name.trim(),
			path: newPath,
			updatedAt: /* @__PURE__ */ new Date().toISOString()
		};
		const result = await dbAdapter.systemVirtualFolder.update(id, updateData);
		if (!result.success) {
			logger.error('Failed to update folder', { error: result.error });
			throw error(500, result.error?.message || 'Failed to update folder');
		}
		logger.info(`Updated system virtual folder: ${name}`, { tenantId, folderId: id });
		return json({
			success: true,
			folder: result.data
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error occurred';
		logger.error(`Error updating system virtual folder: ${message}`, { tenantId, folderId: id });
		throw error(500, message);
	}
};
const DELETE = async ({ params, locals }) => {
	const { user, tenantId } = locals;
	const { id } = params;
	try {
		if (!user) {
			throw error(401, 'Authentication required');
		}
		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		}
		if (!dbAdapter) {
			throw error(500, 'Database adapter not available');
		}
		const allFoldersResult = await dbAdapter.systemVirtualFolder.getAll();
		if (allFoldersResult.success && allFoldersResult.data) {
			const hasChildren = allFoldersResult.data.some((f) => f.parentId === id);
			if (hasChildren) {
				throw error(400, 'Cannot delete folder with subfolders. Delete subfolders first.');
			}
		}
		const result = await dbAdapter.systemVirtualFolder.delete(id);
		if (!result.success) {
			logger.error('Failed to delete folder', { error: result.error });
			throw error(500, result.error?.message || 'Failed to delete folder');
		}
		logger.info(`Deleted system virtual folder`, { tenantId, folderId: id });
		return json({
			success: true
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error occurred';
		logger.error(`Error deleting system virtual folder: ${message}`, { tenantId, folderId: id });
		throw error(500, message);
	}
};
export { DELETE, GET, PATCH };
//# sourceMappingURL=_server.ts.js.map
