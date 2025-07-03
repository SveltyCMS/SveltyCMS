/**
 * @file src/routes/api/systemVirtualFolder/[folderId]/+server.ts
 * @description API endpoint to manage a specific virtual folder and its contents.
 *
 * @method GET - Retrieve contents of the folder.
 * @method POST - Create a new subfolder within this folder.
 * @method PATCH - Update the folder's details (name, parentId).
 * @method DELETE - Remove the folder.
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import path from 'path';
import { dbAdapter } from '@src/databases/db';
import { publicEnv } from '@root/config/public';
import { logger } from '@utils/logger.svelte';
import { createDirectory } from '@utils/fileUploading';
import { SystemVirtualFolderError, isDatabaseError, type DatabaseResult, type DatabaseId, type MediaFolder } from '@src/databases/dbInterface';

// Utility to unwrap DatabaseResult or throw a consistent error
async function unwrapDbResult<T>(resultPromise: Promise<DatabaseResult<T>>): Promise<T> {
	const result = await resultPromise;
	if (result.success) {
		return result.data;
	}
	if (isDatabaseError(result.error)) {
		logger.error(`Database Operation Failed: ${result.error.message}`, result.error.details);
		throw new SystemVirtualFolderError(result.error.message, result.error.statusCode || 500, result.error.code);
	}
	throw new SystemVirtualFolderError('An unknown database error occurred', 500, 'UNKNOWN_DB_ERROR');
}

// Gets the root folder, creating it if it doesn't exist.
async function getOrCreateRootFolder(): Promise<MediaFolder> {
	const allFolders = await unwrapDbResult(dbAdapter.systemVirtualFolder.getAll());
	const rootFolder = allFolders.find((f) => !f.parentId && f.name === publicEnv.MEDIA_FOLDER);

	if (rootFolder) {
		return rootFolder;
	}

	logger.info(`Root folder '${publicEnv.MEDIA_FOLDER}' not found. Creating it...`);
	const newRoot = await unwrapDbResult(
		dbAdapter.systemVirtualFolder.create({
			name: publicEnv.MEDIA_FOLDER,
			path: publicEnv.MEDIA_FOLDER,
			parentId: undefined,
			order: 0
		})
	);
	return newRoot;
}

// Finds a folder by ID, handling the 'root' case.
async function findFolder(folderId: string): Promise<MediaFolder | null> {
	if (folderId === 'root') {
		return getOrCreateRootFolder();
	}
	return unwrapDbResult(dbAdapter.systemVirtualFolder.getById(folderId as DatabaseId));
}

// Recursively update paths of child folders when a parent is moved.
async function updateChildPaths(folderId: DatabaseId, newParentPath: string): Promise<void> {
	const allFolders = await unwrapDbResult(dbAdapter.systemVirtualFolder.getAll());
	const children = allFolders.filter((f) => f.parentId === folderId);

	for (const child of children) {
		const newPath = `${newParentPath}/${child.name}`;
		await unwrapDbResult(dbAdapter.systemVirtualFolder.update(child._id, { path: newPath }));
		await updateChildPaths(child._id, newPath);
	}
}

// Wrapper to handle errors consistently across all request handlers.
const handleRequest = (handler: (event: { request: Request; params: { folderId: string } }) => Promise<Response>): RequestHandler => {
	return async ({ request, params }) => {
		try {
			if (!dbAdapter?.systemVirtualFolder) {
				throw new SystemVirtualFolderError('Virtual folder functionality is not available', 503, 'VIRTUAL_FOLDERS_NOT_SUPPORTED');
			}
			return await handler({ request, params: params as { folderId: string } });
		} catch (err) {
			const error =
				err instanceof SystemVirtualFolderError
					? err
					: new SystemVirtualFolderError(err instanceof Error ? err.message : String(err), 500, 'UNHANDLED_SERVER_ERROR');
			logger.error(`SystemVirtualFolderError: ${error.message}`, {
				code: error.code,
				status: error.status
			});
			return json(
				{
					success: false,
					error: error.message,
					code: error.code,
					ariaLabel: `Error: ${error.message}`
				},
				{ status: error.status }
			);
		}
	};
};

// GET: Retrieve folder contents (subfolders and files)
export const GET: RequestHandler = handleRequest(async ({ params }) => {
	const { folderId } = params;
	const folder = await findFolder(folderId);
	if (!folder) {
		throw new SystemVirtualFolderError('Folder not found', 404, 'FOLDER_NOT_FOUND');
	}

	const contents = await unwrapDbResult(dbAdapter.systemVirtualFolder.getContents(folder.path));

	return json({
		success: true,
		data: {
			folder,
			contents
		},
		ariaLabel: `Retrieved contents for folder ${folder.name}`
	});
});

// POST: Create a new subfolder
export const POST: RequestHandler = handleRequest(async ({ request, params }) => {
	const { folderId: parentFolderId } = params;
	const { name } = await request.json();

	if (!name || typeof name !== 'string') {
		throw new SystemVirtualFolderError('Folder name is required', 400, 'NAME_REQUIRED');
	}

	const parentFolder = await findFolder(parentFolderId);
	if (!parentFolder) {
		throw new SystemVirtualFolderError('Parent folder not found', 404, 'PARENT_NOT_FOUND');
	}

	if (typeof parentFolder.path !== 'string' || !parentFolder.path) {
		throw new SystemVirtualFolderError('Parent folder path is invalid', 500, 'INVALID_PARENT_PATH');
	}

	const newPath = path.join(parentFolder.path, name);
	const existing = await unwrapDbResult(dbAdapter.systemVirtualFolder.exists(newPath));
	if (existing) {
		throw new SystemVirtualFolderError(`Folder '${name}' already exists here`, 409, 'FOLDER_EXISTS');
	}

	await createDirectory(newPath);

	const newFolder = await unwrapDbResult(
		dbAdapter.systemVirtualFolder.create({
			name,
			path: newPath,
			parentId: parentFolder._id,
			order: 0 // Default order
		})
	);

	logger.info(`Subfolder created: ${name} under folderId ${parentFolder._id}`);
	return json(
		{
			success: true,
			data: newFolder,
			ariaLabel: `Created new subfolder: ${name}`
		},
		{ status: 201 }
	);
});

// PATCH: Update folder details (name or parent)
export const PATCH: RequestHandler = handleRequest(async ({ request, params }) => {
	const { folderId } = params;
	const { name, parentId: newParentId }: { name?: string; parentId?: DatabaseId } = await request.json();

	if (!name && !newParentId) {
		throw new SystemVirtualFolderError('Either name or parentId must be provided', 400, 'NO_UPDATE_DATA');
	}

	const folderToUpdate = await findFolder(folderId);
	if (!folderToUpdate) {
		throw new SystemVirtualFolderError('Folder to update not found', 404, 'FOLDER_NOT_FOUND');
	}

	if (typeof folderToUpdate.path !== 'string' || !folderToUpdate.path) {
		throw new SystemVirtualFolderError('Folder to update path is invalid', 500, 'INVALID_PATH');
	}

	const updateData: Partial<MediaFolder> = {};
	let parentHasChanged = false;
	let newPath: string | undefined;

	if (newParentId && newParentId !== folderToUpdate.parentId) {
		const newParentFolder = await findFolder(newParentId as string);
		if (!newParentFolder) {
			throw new SystemVirtualFolderError('New parent folder not found', 404, 'PARENT_NOT_FOUND');
		}
		if (typeof newParentFolder.path !== 'string' || !newParentFolder.path) {
			throw new SystemVirtualFolderError('New parent folder path is invalid', 500, 'INVALID_PARENT_PATH');
		}
		parentHasChanged = true;
		updateData.parentId = newParentId;
		newPath = path.join(newParentFolder.path, name || folderToUpdate.name);
		updateData.path = newPath;
	}

	if (name && name !== folderToUpdate.name) {
		updateData.name = name;
		if (!parentHasChanged) {
			const parentPath = path.dirname(folderToUpdate.path);
			newPath = path.join(parentPath, name);
			updateData.path = newPath;
		}
	}

	// TODO: Rename physical directory from folderToUpdate.path to newPath

	const updatedFolder = await unwrapDbResult(dbAdapter.systemVirtualFolder.update(folderToUpdate._id, updateData));

	if (parentHasChanged && updatedFolder.path) {
		await updateChildPaths(folderToUpdate._id, updatedFolder.path);
	}

	logger.info(`Folder with ID ${folderId} updated successfully`);
	return json({
		success: true,
		data: updatedFolder,
		ariaLabel: `Updated folder: ${updatedFolder.name}`
	});
});

// DELETE: Remove a folder
export const DELETE: RequestHandler = handleRequest(async ({ params }) => {
	const { folderId } = params;
	if (folderId === 'root') {
		throw new SystemVirtualFolderError('Cannot delete the root folder', 400, 'ROOT_DELETE_FORBIDDEN');
	}

	const folderToDelete = await findFolder(folderId);
	if (!folderToDelete) {
		// If it doesn't exist, the desired state is achieved.
		return json({
			success: true,
			message: 'Folder not found, nothing to delete.',
			ariaLabel: 'Folder not found'
		});
	}

	// Note: This performs a soft delete based on the interface.
	// The adapter implementation should handle cascading logic if necessary (e.g., deleting files within).
	await unwrapDbResult(dbAdapter.systemVirtualFolder.delete(folderToDelete._id));

	logger.info(`Folder with ID ${folderId} deleted successfully`);
	return json({
		success: true,
		message: `Folder "${folderToDelete.name}" deleted successfully`,
		ariaLabel: `Deleted folder: ${folderToDelete.name}`
	});
});
