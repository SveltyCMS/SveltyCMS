/**
 * @file src/routes/api/virtualFolder/[folderId]/+server.ts
 * @description API endpoint to manage virtual folders and their contents within a media gallery system.
 *
 * Features:
 * - GET: Retrieve contents of a specific folder
 * - POST: Create a new subfolder within a specified folder
 * - PATCH: Update folder details (name, parent)
 * - DELETE: Remove a folder and its contents
 *
 * Usage:
 * - Use 'root' as folderId to interact with the root folder
 * - Ensure dbAdapter is properly initialized before using this endpoint
 * - Handle ARIA labels in frontend for improved accessibility
 */

import { publicEnv } from '@root/config/public';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dbAdapter } from '../../../../databases/db';
import {
	type FolderContents,
	type FolderResponse,
	type VirtualFolderUpdateData,
	type SystemVirtualFolder,
	VirtualFolderError
} from '@root/src/databases/dbInterface';

// System Logger
import { logger } from '@utils/logger.svelte';

// Utility function to validate database connection
function validateDb(): void {
	if (!dbAdapter) {
		throw new VirtualFolderError('Database adapter not initialized', 424, 'DB_NOT_INITIALIZED');
	}
}

// Utility function to format folder response
function formatFolderResponse(folder: SystemVirtualFolder, action: string = ''): FolderResponse {
	return {
		id: folder._id,
		name: folder.name,
		path: folder.path,
		ariaLabel: action ? `${action} folder: ${folder.name}` : `Folder: ${folder.name}`
	};
}

// Retrieve or create the root folder
async function getRootFolder(): Promise<SystemVirtualFolder> {
	validateDb();

	const rootFolder = await dbAdapter.findOne('SystemVirtualFolder', {
		name: publicEnv.MEDIA_FOLDER,
		parent: null
	});

	if (rootFolder) return rootFolder;

	const newRootFolder = await dbAdapter.createVirtualFolder({
		name: publicEnv.MEDIA_FOLDER,
		parent: null,
		path: publicEnv.MEDIA_FOLDER
	});

	if (!newRootFolder) {
		throw new VirtualFolderError('Failed to create root folder', 500, 'ROOT_CREATION_FAILED');
	}

	return newRootFolder;
}

// Recursively update paths of child folders
async function updateChildPaths(folderId: string, newParentPath: string): Promise<void> {
	validateDb();

	const children = await dbAdapter.findMany('SystemVirtualFolder', { parent: folderId });

	await Promise.all(
		children.map(async (child) => {
			const newPath = `${newParentPath}/${child.name}`;
			await dbAdapter.updateVirtualFolder(child._id, { path: newPath });
			await updateChildPaths(child._id, newPath);
		})
	);
};

// Error handler wrapper for request handlers
const handleRequest = (handler: (params: { folderId: string }, data?: Record<string, unknown>) => Promise<Response>) => {
	return async ({ params, request }: { params: { folderId: string }; request?: Request }) => {
		try {
			if (!dbAdapter) {
				throw new VirtualFolderError('Database adapter not initialized', 424, 'DB_NOT_INITIALIZED');
			}
			const data = request ? await request.json() : undefined;
			return await handler(params, data);
		} catch (err) {
			const error = err instanceof VirtualFolderError ? err :
				new VirtualFolderError(err instanceof Error ? err.message : String(err), 500);
			logger.error(`VirtualFolderError: ${error.message}`);
			return json({
				success: false,
				error: error.message,
				ariaLabel: `Error: ${error.message}`
			}, { status: error.status });
		}
	};
};

// GET: Retrieve folder contents
export const GET: RequestHandler = handleRequest(async ({ folderId }) => {
	const folder = folderId === 'root' ? await getRootFolder() :
		await dbAdapter.findOne('SystemVirtualFolder', { _id: folderId });

	if (!folder) {
		throw new VirtualFolderError('Folder not found', 404, 'FOLDER_NOT_FOUND');
	}

	const folderContents = (await dbAdapter.getVirtualFolderContents(folder._id.toString())) || { subfolders: [], mediaFiles: [] };
	const contents: FolderContents = {
		subfolders: Array.isArray(folderContents.subfolders) ? folderContents.subfolders : [],
		mediaFiles: Array.isArray(folderContents.mediaFiles) ? folderContents.mediaFiles : []
	};

	return json({
		success: true,
		data: {
			contents,
			folder: formatFolderResponse(folder)
		},
		ariaLabel: `Retrieved contents for folder ${folder.name}`
	});
});

// POST: Create a new subfolder
export const POST: RequestHandler = handleRequest(async ({ folderId }, data) => {
	const { name } = data;
	if (!name) {
		throw new VirtualFolderError('Folder name is required', 400, 'NAME_REQUIRED');
	}

	const parentFolder = folderId === 'root' ? await getRootFolder() :
		await dbAdapter.findOne('SystemVirtualFolder', { _id: folderId });

	if (!parentFolder) {
		throw new VirtualFolderError('Parent folder not found', 404, 'PARENT_NOT_FOUND');
	}

	const newFolder = await dbAdapter.createVirtualFolder({
		name,
		parent: parentFolder._id,
		path: `${parentFolder.path}/${name}`
	});

	logger.info(`Subfolder created: ${name} under folderId ${parentFolder._id}`);

	return json({
		success: true,
		data: { folder: formatFolderResponse(newFolder, 'New') },
		ariaLabel: `Created new subfolder: ${name}`
	}, { status: 201 });
});

// PATCH: Update folder details
export const PATCH: RequestHandler = handleRequest(async ({ folderId }, data) => {
	const { name, parent } = data;
	if (!name) {
		throw new VirtualFolderError('Folder name is required', 400, 'NAME_REQUIRED');
	}

	const folder = folderId === 'root' ? await getRootFolder() :
		await dbAdapter.findOne('SystemVirtualFolder', { _id: folderId });

	if (!folder) {
		throw new VirtualFolderError('Folder not found', 404, 'FOLDER_NOT_FOUND');
	}

	const newParent = parent ?
		(parent === 'root' ? await getRootFolder() :
			await dbAdapter.findOne('SystemVirtualFolder', { _id: parent })) : null;

	if (parent && !newParent) {
		throw new VirtualFolderError('New parent folder not found', 404, 'PARENT_NOT_FOUND');
	}

	const updateData: VirtualFolderUpdateData = {
		name,
		...(newParent && {
			parent: newParent._id,
			path: `${newParent.path}/${name}`
		}),
		...(!newParent && {
			path: `${folder.path.split('/').slice(0, -1).join('/')}/${name}`
		})
	};

	const updatedFolder = await dbAdapter.updateVirtualFolder(folder._id, updateData);
	if (newParent) {
		await updateChildPaths(folder._id, updatedFolder.path);
	}

	logger.info(`Folder with ID ${folder._id} updated successfully`);

	return json({
		success: true,
		data: { folder: formatFolderResponse(updatedFolder, 'Updated') },
		ariaLabel: `Updated folder: ${updatedFolder.name}`
	});
});

// DELETE: Remove a folder and its contents
export const DELETE: RequestHandler = handleRequest(async ({ folderId }) => {
	if (folderId === 'root') {
		throw new VirtualFolderError('Cannot delete root folder', 400, 'ROOT_DELETE_FORBIDDEN');
	}

	const folder = await dbAdapter.findOne('SystemVirtualFolder', { _id: folderId });
	if (!folder) {
		throw new VirtualFolderError('Folder not found', 404, 'FOLDER_NOT_FOUND');
	}

	const success = await dbAdapter.deleteVirtualFolder(folderId);
	if (!success) {
		throw new VirtualFolderError('Folder deletion failed', 500, 'DELETE_FAILED');
	}

	logger.info(`Folder with ID ${folderId} deleted successfully`);

	return json({
		success: true,
		message: `Folder "${folder.name}" deleted successfully`,
		ariaLabel: `Deleted folder: ${folder.name}`
	});
});
