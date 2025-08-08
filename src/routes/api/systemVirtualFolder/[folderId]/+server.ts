/**
 * @file src/routes/api/systemVirtualFolder/[folderId]/+server.ts
 * @description API endpoint for specific system virtual folder operations
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { privateEnv } from '@root/config/private';

// Database
import { dbAdapter } from '@src/databases/db';

// System Logger
import { logger } from '@utils/logger.svelte';

// Media Utils
import { constructMediaUrl } from '@utils/media/mediaUtils';

// Types
import type { SystemVirtualFolder } from '@src/databases/dbInterface';

// GET /api/systemVirtualFolder/[folderId] - Fetches contents of a specific virtual folder
export const GET: RequestHandler = async ({ params, locals }) => {
	const { user, tenantId } = locals;
	try {
		// Check authentication
		if (!user) {
			throw error(401, 'Authentication required');
		}

		if (privateEnv.MULTI_TENANT && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		}

		const { folderId } = params;

		let currentFolder: SystemVirtualFolder | null = null;
		let folders: SystemVirtualFolder[] = [];
		let files: any[] = [];

		const tenantFilter = privateEnv.MULTI_TENANT ? { tenantId } : {};

		if (folderId === 'root') {
			// Root folder - get top-level folders and files, scoped by tenant
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
			// Specific folder - ensure it belongs to the current tenant
			const folderResult = await dbAdapter.systemVirtualFolder.getById(folderId);
			currentFolder = folderResult.success ? folderResult.data : null;

			if (!currentFolder) {
				throw error(404, 'Folder not found');
			} // Get subfolders and files, scoped by tenant

			const subfolderResult = await dbAdapter.systemVirtualFolder.getByParentId(folderId);
			folders = subfolderResult.success ? subfolderResult.data || [] : [];

			const fileQuery = { virtualFolderId: folderId, ...tenantFilter };
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
		} // Process files with URL construction

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

		logger.debug(`Fetched folder ${folderId}: ${processedFiles.length} files, ${folders.length} subfolders`, { tenantId });

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
		logger.error(`Error fetching folder contents for ${params.folderId}: ${message}`, { tenantId });

		throw error(500, message);
	}
};
