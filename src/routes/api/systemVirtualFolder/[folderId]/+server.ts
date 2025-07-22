/**
 * @file src/routes/api/systemVirtualFolder/[folderId]/+server.ts
 * @description API endpoint for specific system virtual folder operations
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

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
	try {
		// Check authentication
		if (!locals.user) {
			throw error(401, 'Authentication required');
		}

		const { folderId } = params;

		let currentFolder: SystemVirtualFolder | null = null;
		let folders: SystemVirtualFolder[] = [];
		let files: any[] = [];

		if (folderId === 'root') {
			// Root folder - get top-level folders and files
			folders = await dbAdapter.getAll('system_virtual_folders', { parentId: null });

			// Get media files in root
			const [images, documents, audio, videos] = await Promise.all([
				dbAdapter.getAll('media_images', { virtualFolderId: null }),
				dbAdapter.getAll('media_documents', { virtualFolderId: null }),
				dbAdapter.getAll('media_audio', { virtualFolderId: null }),
				dbAdapter.getAll('media_videos', { virtualFolderId: null })
			]);

			files = [...images, ...documents, ...audio, ...videos];
		} else {
			// Specific folder
			currentFolder = await dbAdapter.getOneById('system_virtual_folders', folderId);

			if (!currentFolder) {
				throw error(404, 'Folder not found');
			}

			// Get subfolders
			folders = await dbAdapter.getAll('system_virtual_folders', { parentId: folderId });

			// Get media files in this folder
			const [images, documents, audio, videos] = await Promise.all([
				dbAdapter.getAll('media_images', { virtualFolderId: folderId }),
				dbAdapter.getAll('media_documents', { virtualFolderId: folderId }),
				dbAdapter.getAll('media_audio', { virtualFolderId: folderId }),
				dbAdapter.getAll('media_videos', { virtualFolderId: folderId })
			]);

			files = [...images, ...documents, ...audio, ...videos];
		}

		// Process files with URL construction
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

		logger.debug(`Fetched folder ${folderId}: ${processedFiles.length} files, ${folders.length} subfolders`);

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
		logger.error(`Error fetching folder contents for ${params.folderId}: ${message}`);

		throw error(500, message);
	}
};
