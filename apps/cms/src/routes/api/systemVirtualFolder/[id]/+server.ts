/**
 * @file src/routes/api/systemVirtualFolder/[id]/+server.ts
 * @description API endpoint for individual system virtual folder operations
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPrivateSettingSync } from '@src/services/settingsService';
import { dbAdapter } from '@src/databases/db';
import { logger } from '@utils/logger.server';
import type { SystemVirtualFolder } from '@src/databases/dbInterface';
import { constructMediaUrl } from '@utils/media/mediaUtils';
import type { ISODateString } from '@src/content/types';

type MediaDoc = {
	_id?: string;
	filename?: string;
	virtualFolderId?: string | null;
	thumbnailWidth?: number;
	thumbnailHeight?: number;
	[key: string]: unknown;
};

// GET /api/systemVirtualFolder/[id] - Fetches contents of a specific virtual folder
export const GET: RequestHandler = async ({ params, locals }) => {
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

		let currentFolder: SystemVirtualFolder | null = null;
		let folders: SystemVirtualFolder[] = [];
		let files: MediaDoc[] = [];

		const tenantFilter = getPrivateSettingSync('MULTI_TENANT') ? { tenantId } : {};

		if (id === 'root') {
			// Root folder - get top-level folders and files
			const folderResult = await dbAdapter.systemVirtualFolder.getByParentId(null);
			folders = folderResult.success ? folderResult.data || [] : [];

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const fileQuery = { virtualFolderId: null, ...tenantFilter } as any;
			const [imagesResult, documentsResult, audioResult, videosResult] = await Promise.all([
				dbAdapter.crud.findMany('media_images', fileQuery),
				dbAdapter.crud.findMany('media_documents', fileQuery),
				dbAdapter.crud.findMany('media_audio', fileQuery),
				dbAdapter.crud.findMany('media_videos', fileQuery)
			]);
			const images = imagesResult.success ? ((imagesResult.data || []) as unknown as MediaDoc[]) : [];
			const documents = documentsResult.success ? ((documentsResult.data || []) as unknown as MediaDoc[]) : [];
			const audio = audioResult.success ? ((audioResult.data || []) as unknown as MediaDoc[]) : [];
			const videos = videosResult.success ? ((videosResult.data || []) as unknown as MediaDoc[]) : [];
			files = [...images, ...documents, ...audio, ...videos];
		} else {
			// Specific folder
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const folderResult = await dbAdapter.systemVirtualFolder.getById(id as any);
			currentFolder = folderResult.success ? folderResult.data : null;

			if (!currentFolder) {
				throw error(404, 'Folder not found');
			}

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const subfolderResult = await dbAdapter.systemVirtualFolder.getByParentId(id as any);
			folders = subfolderResult.success ? subfolderResult.data || [] : [];

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const fileQuery = { virtualFolderId: id, ...tenantFilter } as any;
			const [imagesResult, documentsResult, audioResult, videosResult] = await Promise.all([
				dbAdapter.crud.findMany('media_images', fileQuery),
				dbAdapter.crud.findMany('media_documents', fileQuery),
				dbAdapter.crud.findMany('media_audio', fileQuery),
				dbAdapter.crud.findMany('media_videos', fileQuery)
			]);
			const images = imagesResult.success ? ((imagesResult.data || []) as unknown as MediaDoc[]) : [];
			const documents = documentsResult.success ? ((documentsResult.data || []) as unknown as MediaDoc[]) : [];
			const audio = audioResult.success ? ((audioResult.data || []) as unknown as MediaDoc[]) : [];
			const videos = videosResult.success ? ((videosResult.data || []) as unknown as MediaDoc[]) : [];
			files = [...images, ...documents, ...audio, ...videos];
		}

		// Process files with URL construction
		const processedFiles = files.map((file) => {
			try {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const originalUrl = constructMediaUrl(file as any, 'original');
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const thumbnailUrl = constructMediaUrl(file as any, 'thumbnail');
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

// PATCH /api/systemVirtualFolder/[id] - Update a folder
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
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

		// Get the current folder to update its path
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const currentResult = await dbAdapter.systemVirtualFolder.getById(id as any);
		if (!currentResult.success || !currentResult.data) {
			throw error(404, 'Folder not found');
		}

		const currentFolder = currentResult.data;

		// Build new path
		let newPath = '';
		if (currentFolder.parentId) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const parentResult = await dbAdapter.systemVirtualFolder.getById(currentFolder.parentId as any);
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
			updatedAt: new Date().toISOString() as ISODateString
		};

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await dbAdapter.systemVirtualFolder.update(id as any, updateData);

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

// DELETE /api/systemVirtualFolder/[id] - Delete a folder
export const DELETE: RequestHandler = async ({ params, locals }) => {
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

		// Check if folder has children
		const allFoldersResult = await dbAdapter.systemVirtualFolder.getAll();
		if (allFoldersResult.success && allFoldersResult.data) {
			const hasChildren = allFoldersResult.data.some((f: SystemVirtualFolder) => f.parentId === id);
			if (hasChildren) {
				throw error(400, 'Cannot delete folder with subfolders. Delete subfolders first.');
			}
		}

		// Check if folder has media files
		// TODO: Add media file check when media is properly linked to folders

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await dbAdapter.systemVirtualFolder.delete(id as any);

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
