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
 *  - folder/folders/contents: object (optional) - Contains folder details, list of folders, or folder contents if the operation was successful.
 *  - error: string (optional) - Error message if the operation fails.
 *
 * @throws {Error} 500 - Returns a 500 status code with an error message if the operation fails.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dbAdapter } from '@src/databases/db';
import { publicEnv } from '@root/config/public';

// System Logger
import { logger } from '@utils/logger';

// GET: Retrieve all virtual folders or contents of a specific folder
export const GET: RequestHandler = async ({ url }) => {
	const folderId = url.searchParams.get('folderId');

	try {
		if (folderId) {
			// Fetch contents of a specific folder
			const contents = await dbAdapter.getVirtualFolderContents(folderId);
			return json({ success: true, contents });
		} else {
			// Fetch all virtual folders
			const folders = await dbAdapter.getVirtualFolders();
			return json({ success: true, folders });
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err); // Ensure message is a string
		logger.error('Error fetching folders:', message); // Log the error
		return json({ success: false, error: 'Failed to fetch folders or contents' }, { status: 500 });
	}
};

// POST: Create a new virtual folder
export const POST: RequestHandler = async ({ request }) => {
	try {
		const { name, parent } = await request.json();

		if (!name) {
			return json({ success: false, error: 'Folder name is required' }, { status: 400 });
		}

		let parentPath = '';
		if (parent) {
			const parentFolder = await dbAdapter.findOne('VirtualFolder', { _id: parent });
			if (!parentFolder) {
				return json({ success: false, error: 'Parent folder not found' }, { status: 404 });
			}
			parentPath = parentFolder.path;
		} else {
			parentPath = publicEnv.MEDIA_FOLDER;
		}

		const path = `${parentPath}/${name}`;
		const result = await dbAdapter.createVirtualFolder({ name, parent, path });
		return json({ success: true, folder: result });
	} catch (error) {
		logger.error('Error creating folder:', error);
		return json({ success: false, error: 'Failed to create folder' }, { status: 500 });
	}
};

// PATCH: Update an existing virtual folder
export const PATCH: RequestHandler = async ({ request }) => {
	try {
		const { folderId, name, parent } = await request.json();

		if (!folderId) {
			return json({ success: false, error: 'Folder ID is required' }, { status: 400 });
		}

		const updateData: { name?: string; parent?: string | null } = {};
		if (name) updateData.name = name;
		if (parent !== undefined) updateData.parent = parent;

		const updatedFolder = await dbAdapter.updateVirtualFolder(folderId, updateData);
		if (!updatedFolder) {
			return json({ success: false, error: 'Folder update failed' }, { status: 404 });
		}

		return json({ success: true, folder: updatedFolder });
	} catch (error) {
		logger.error('Error updating folder:', error);
		return json({ success: false, error: 'Failed to update folder' }, { status: 500 });
	}
};

// DELETE: Delete an existing virtual folder
export const DELETE: RequestHandler = async ({ request }) => {
	try {
		const { folderId } = await request.json();

		if (!folderId) {
			return json({ success: false, error: 'Folder ID is required' }, { status: 400 });
		}

		const success = await dbAdapter.deleteVirtualFolder(folderId);
		if (!success) {
			return json({ success: false, error: 'Folder deletion failed' }, { status: 404 });
		}

		return json({ success: true });
	} catch (error) {
		logger.error('Error deleting folder:', error);
		return json({ success: false, error: 'Failed to delete folder' }, { status: 500 });
	}
};
