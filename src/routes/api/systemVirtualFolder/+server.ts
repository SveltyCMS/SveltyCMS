/**
 * @file src/routes/api/systemVirtualFolder/+server.ts
 * @description API endpoint to create and list all virtual folders.
 * This endpoint handles collection-level operations.
 *
 * @method GET - List all virtual folders, or get contents of a specific folder by ID.
 * @method POST - Create a new virtual folder.
 * @method PATCH - Update a folder's details (name, parent).
 * @method DELETE - Delete a folder.
 *
 * @returns {Object} JSON response.
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import path from 'path';
import { dbAdapter } from '@src/databases/db';
import { logger } from '@utils/logger.svelte';
import { createDirectory, deleteDirectory } from '@utils/fileUploading';
import {
	SystemVirtualFolderError,
	isDatabaseError,
	type DatabaseResult,
	type DatabaseId,
	type SystemVirtualFolder
} from '@src/databases/dbInterface';

interface FolderRequest {
	name?: string;
	parentId?: DatabaseId; // Changed from parent
	folderId?: DatabaseId;
}

// Utility function to unwrap the DatabaseResult or throw an error
async function unwrapDbResult<T>(resultPromise: Promise<DatabaseResult<T>>): Promise<T> {
	const result = await resultPromise;
	if (result.success) {
		return result.data;
	}
	// If it's a database error, re-throw it with more context
	if (isDatabaseError(result.error)) {
		logger.error(`Database Operation Failed: ${result.error.message}`, result.error.details);
		throw new SystemVirtualFolderError(result.error.message, result.error.statusCode || 500, result.error.code);
	}
	// Fallback for unexpected error shapes
	throw new SystemVirtualFolderError('An unknown database error occurred', 500, 'UNKNOWN_DB_ERROR');
}

/**
 * Recursively builds the full relative path for a folder.
 * @param folderId The ID of the folder to get the path for.
 * @returns The relative path from the media root (e.g., "folderA/folderB").
 */
async function getFolderPath(folderId: DatabaseId | null): Promise<string> {
	if (!folderId) {
		return ''; // Root path is the base media folder
	}

	const folder = await unwrapDbResult(dbAdapter.systemVirtualFolder.getById(folderId));

	// Check if folder exists and has required properties
	if (!folder) {
		logger.warn(`Folder with ID ${folderId} not found`);
		return '';
	}

	// Return the stored path directly instead of reconstructing it
	if (!folder.path) {
		logger.warn(`Folder with ID ${folderId} has no path property`, folder);
		return '';
	}

	// Return the path as stored in the database
	return folder.path;
}

// Error handler wrapper for request handlers
const handleRequest = (handler: (params: { request: Request; url: URL }) => Promise<Response>): RequestHandler => {
	return async ({ request, url }) => {
		try {
			if (!dbAdapter) {
				throw new SystemVirtualFolderError('Database adapter not initialized', 503, 'DB_NOT_INITIALIZED');
			}
			if (!dbAdapter.systemVirtualFolder) {
				throw new SystemVirtualFolderError(
					'Virtual folder functionality is not available for this database adapter',
					503,
					'VIRTUAL_FOLDERS_NOT_SUPPORTED'
				);
			}
			return await handler({ request, url });
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
					code: error.code || 'UNKNOWN_ERROR',
					ariaLabel: `Error: ${error.message}`
				},
				{ status: error.status }
			);
		}
	};
};

export const GET: RequestHandler = handleRequest(async () => {
	// The 'folderId' parameter is no longer used here, as we fetch all folders
	// and let the client build the hierarchy. This simplifies the API and
	// aligns with the media gallery's implementation.
	const allFolders = await unwrapDbResult(dbAdapter.systemVirtualFolder.getAll());
	return json({ success: true, data: allFolders });
});

export const POST: RequestHandler = handleRequest(async ({ request }) => {
	const { name, parentId }: FolderRequest = await request.json();
	const trimmedName = name?.trim();

	// Handle string "null" and convert to actual null
	const actualParentId = parentId === null || parentId === 'null' || parentId === undefined ? null : parentId;

	logger.debug(`Creating folder: name="${trimmedName}", parentId="${actualParentId}"`);

	if (!trimmedName) {
		throw new SystemVirtualFolderError('Folder name is required', 400, 'VALIDATION_ERROR');
	}

	// Check for duplicate folder name within the same parent
	const siblings = await unwrapDbResult(dbAdapter.systemVirtualFolder.getByParentId(actualParentId));
	if (siblings.some((f) => f.name.toLowerCase() === trimmedName.toLowerCase())) {
		throw new SystemVirtualFolderError(
			`A folder named "${trimmedName}" already exists in this location.`,
			409, // Conflict
			'DUPLICATE_FOLDER_NAME'
		);
	}

	// Generate a unique folder ID for the path
	const { v4: uuidv4 } = await import('uuid');
	const folderId = uuidv4().replace(/-/g, '');
	logger.debug(`Generated folderId: "${folderId}"`);

	// Validate the generated ID
	if (!folderId || typeof folderId !== 'string' || folderId.length === 0) {
		logger.error(`Invalid folderId generated: "${folderId}"`);
		throw new SystemVirtualFolderError('Failed to generate valid folder ID', 500, 'INVALID_ID_GENERATION');
	}

	// Get the full relative path of the parent directory.
	const parentPath = await getFolderPath(actualParentId);
	logger.debug(`Parent path resolved to: "${parentPath}"`);

	// The physical path for the new directory, using UUID for uniqueness
	let newRelativePath: string;
	if (parentPath && parentPath.trim()) {
		newRelativePath = path.join(parentPath, folderId);
	} else {
		newRelativePath = folderId;
	}
	logger.debug(`New relative path with UUID: "${newRelativePath}"`);
	logger.debug(`folderId: "${folderId}", parentPath: "${parentPath}", typeof newRelativePath: ${typeof newRelativePath}`);

	// Validate that we have a valid path before proceeding
	if (!newRelativePath || typeof newRelativePath !== 'string') {
		logger.error(`Invalid relative path generated: "${newRelativePath}", parentPath: "${parentPath}", folderId: "${folderId}"`);
		throw new SystemVirtualFolderError('Failed to generate valid folder path', 500, 'INVALID_PATH_GENERATION');
	}

	logger.debug(`About to call createDirectory with: "${newRelativePath}"`);
	// Create the physical directory on the filesystem.
	await createDirectory(newRelativePath);

	// Create the virtual folder entry in the database.
	const newFolder = await unwrapDbResult(
		dbAdapter.systemVirtualFolder.create({
			name: trimmedName,
			path: newRelativePath,
			parentId: actualParentId,
			order: 0,
			type: 'folder'
		})
	);

	return json({ success: true, folder: newFolder }, { status: 201 });
});

/**
 * @description Handles updating a virtual folder's metadata or reordering folders.
 * Updates can include changing the folder's name, moving it to a different parent folder, or updating order.
 */
export const PATCH: RequestHandler = handleRequest(async ({ request }) => {
	const requestBody = await request.json();

	// Handle bulk reordering
	if (requestBody.action === 'reorder' && requestBody.parentId !== undefined && requestBody.orderUpdates) {
		const { parentId, orderUpdates } = requestBody;

		// Convert string "null" to actual null
		const actualParentId = parentId === null || parentId === 'null' || parentId === undefined ? null : parentId;

		logger.debug(`Reordering folders for parent: ${actualParentId}`, orderUpdates);

		// Update each folder's order and potentially parentId
		const updatePromises = orderUpdates.map(async (update: { folderId: string; order: number; parentId?: string | null }) => {
			const updateData: Partial<SystemVirtualFolder> = { order: update.order };

			// Handle parentId updates for drag & drop operations
			if (update.parentId !== undefined) {
				const actualUpdateParentId = update.parentId === null || update.parentId === 'null' ? null : update.parentId;
				updateData.parentId = actualUpdateParentId;

				// If moving to a different parent, we need to update the path
				const folder = await unwrapDbResult(dbAdapter.systemVirtualFolder.getById(update.folderId));
				if (folder) {
					// Extract the folder's UUID from its current path (last segment)
					const folderUuid = folder.path.split('/').pop() || folder._id;

					// Generate new path based on new parent
					if (actualUpdateParentId) {
						const newParentPath = await getFolderPath(actualUpdateParentId);
						updateData.path = newParentPath ? `${newParentPath}/${folderUuid}` : folderUuid;
					} else {
						// Moving to root level
						updateData.path = folderUuid;
					}

					logger.debug(`Updating folder ${update.folderId} path from "${folder.path}" to "${updateData.path}"`);

					// TODO: Consider moving the physical directory if needed
					// This would require filesystem operations to move the actual folder
				}
			}

			return dbAdapter.systemVirtualFolder.update(update.folderId, updateData);
		});

		await Promise.all(updatePromises);

		return json({
			success: true,
			message: 'Folder order updated successfully',
			ariaLabel: 'Folder order updated successfully'
		});
	}

	// Handle single folder updates
	const { folderId, name, parentId, order }: { folderId: DatabaseId; name?: string; parentId?: DatabaseId; order?: number } = requestBody;

	if (!folderId) {
		throw new SystemVirtualFolderError('Folder ID is required for an update', 400, 'MISSING_FOLDER_ID');
	}

	const updateData: Partial<SystemVirtualFolder> = {};
	if (name) updateData.name = name;
	if (parentId !== undefined) updateData.parentId = parentId;
	if (order !== undefined) updateData.order = order;

	if (Object.keys(updateData).length === 0) {
		throw new SystemVirtualFolderError('No update data provided', 400, 'NO_UPDATE_DATA');
	}

	const updatedFolder = await unwrapDbResult(dbAdapter.systemVirtualFolder.update(folderId, updateData));

	return json({
		success: true,
		data: updatedFolder,
		ariaLabel: `Folder updated successfully`
	});
});

export const DELETE: RequestHandler = handleRequest(async ({ request }) => {
	const { folderId }: { folderId: DatabaseId } = await request.json();

	if (!folderId) {
		throw new SystemVirtualFolderError('Folder ID is required for deletion', 400, 'MISSING_FOLDER_ID');
	}

	const folderToDelete = await unwrapDbResult(dbAdapter.systemVirtualFolder.getById(folderId));
	if (!folderToDelete) {
		throw new SystemVirtualFolderError('Folder to delete not found', 404, 'FOLDER_NOT_FOUND');
	}

	await deleteDirectory(folderToDelete.path);
	await unwrapDbResult(dbAdapter.systemVirtualFolder.delete(folderId));

	return json({
		success: true,
		message: 'Folder deleted successfully',
		ariaLabel: 'Folder and its contents have been deleted'
	});
});
