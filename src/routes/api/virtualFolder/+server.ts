/**
 * @file src/routes/api/virtualFolder/+server.ts
 * @description API endpoint to create, read, update, and delete virtual folders and retrieve their contents.
 *
 * @method POST
 * @method GET
 * @method PATCH
 * @method DELETE
 *
 * @param {Object} request - The request object containing the following properties:
 *  - name: string (required for POST, optional for PATCH) - The name of the virtual folder to be created or updated.
 *  - parent: string (optional) - The ID of the parent folder.
 *  - folderId: string (required for PATCH, DELETE, optional for GET) - The ID of the folder to be updated, deleted, or retrieved.
 *
 * @returns {Object} JSON response containing:
 *  - success: boolean - Indicates whether the operation was successful.
 *  - data: object (optional) - Contains folder details, list of folders, or folder contents.
 *  - error: string (optional) - Error message if the operation fails.
 *  - ariaLabel: string (optional) - Accessibility label for the response.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dbAdapter } from '@src/databases/db';
import { publicEnv } from '@root/config/public';
import { logger } from '@utils/logger.svelte';
import { createDirectory, deleteDirectory } from '@utils/fileUploading';
import { VirtualFolderError } from '@src/databases/dbInterface';

interface FolderRequest {
	name?: string;
	parent?: string;
	folderId?: string;
}

const handleRequest = (handler: (params: { request?: Request; url?: URL }) => Promise<Response>) => {
	return async ({ request, url }: { request?: Request; url?: URL }) => {
		try {
			if (!dbAdapter) {
				throw new VirtualFolderError('Database adapter not initialized', 424, 'DB_NOT_INITIALIZED');
			}
			return await handler({ request, url });
		} catch (err) {
			const error = err instanceof VirtualFolderError ? err : new VirtualFolderError(err instanceof Error ? err.message : String(err), 500);
			logger.error(`VirtualFolderError: ${error.message}`);
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

export const GET: RequestHandler = handleRequest(async ({ url }) => {
	const folderId = url.searchParams.get('folderId');

	if (folderId) {
		const contents = await dbAdapter.systemVirtualFolder.getContents(folderId);
		return json({
			success: true,
			data: { contents: contents },
			ariaLabel: `Retrieved contents for folder ${folderId}`
		});
	}

	const folders = await dbAdapter.systemVirtualFolder.getAll();
	return json({
		success: true,
		data: { folders: folders },
		ariaLabel: 'Retrieved all virtual folders'
	});
});

export const POST: RequestHandler = handleRequest(async ({ request }) => {
	const { name, parent }: FolderRequest = await request.json();

	if (!name?.trim()) {
		throw new VirtualFolderError('Folder name is required and cannot be empty', 400, 'NAME_REQUIRED');
	}

	if (!/^[a-zA-Z0-9-_ ]+$/.test(name)) {
		throw new VirtualFolderError('Folder name contains invalid characters', 400, 'INVALID_NAME');
	}

	let parentPath = publicEnv.MEDIA_FOLDER;
	if (parent) {
		const parentFolder = await dbAdapter.crud.findOne('SystemVirtualFolder', { _id: parent });
		if (!parentFolder.success || !parentFolder.data) {
			throw new VirtualFolderError('Parent folder not found', 404, 'PARENT_NOT_FOUND');
		}
		parentPath = parentFolder.data.path;
	}

	const path = `${parentPath}/${name}`.replace(/\/+/g, '/');

	const exists = await dbAdapter.systemVirtualFolder.exists(path);
	if (exists.success && exists.data) {
		throw new VirtualFolderError('Folder already exists at this path', 409, 'FOLDER_EXISTS');
	}

	const result = await dbAdapter.systemVirtualFolder.create({
		name,
		parent,
		path,
		type: 'folder',
		order: 0
	});

	await createDirectory(result._id.toString());
	return json(
		{
			success: true,
			data: { folder: result },
			ariaLabel: `Created new folder: ${name}`
		},
		{ status: 201 }
	);
});

export const PATCH: RequestHandler = handleRequest(async ({ request }) => {
	const { folderId, name, parent }: FolderRequest = await request.json();

	if (!folderId) {
		throw new VirtualFolderError('Folder ID is required', 400, 'ID_REQUIRED');
	}

	if (name && !/^[a-zA-Z0-9-_ ]+$/.test(name)) {
		throw new VirtualFolderError('Folder name contains invalid characters', 400, 'INVALID_NAME');
	}

	const updateData = { name, parent };
	const result = await dbAdapter.systemVirtualFolder.update(folderId, updateData);
	if (!result) {
		throw new VirtualFolderError('Failed to update folder', 404, 'UPDATE_FAILED');
	}

	await deleteDirectory(folderId);
	await createDirectory(result._id.toString());
	return json({
		success: true,
		data: { folder: result },
		ariaLabel: `Updated folder: ${result.name}`
	});
});

export const DELETE: RequestHandler = handleRequest(async ({ request }) => {
	const { folderId }: FolderRequest = await request.json();

	if (!folderId) {
		throw new VirtualFolderError('Folder ID is required', 400, 'ID_REQUIRED');
	}

	const result = await dbAdapter.systemVirtualFolder.delete(folderId);
	if (!result) {
		throw new VirtualFolderError('Failed to delete folder', 404, 'DELETE_FAILED');
	}

	await deleteDirectory(folderId);
	return json({
		success: true,
		ariaLabel: `Deleted folder ${folderId}`
	});
});
