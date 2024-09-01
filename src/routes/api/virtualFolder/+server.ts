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
 *  - name: string (required) - The name of the virtual folder to be created or updated.
 *  - parent: string (optional) - The ID of the parent folder.
 *  - folderId: string (required for PATCH, DELETE) - The ID of the folder to be updated or deleted.
 *
 * @returns {Object} JSON response containing:
 *  - success: boolean - Indicates whether the operation was successful.
 *  - folder/folders: object (optional) - Contains folder details and its contents if the operation was successful.
 *  - error: string (optional) - Error message if the operation fails.
 *
 * @throws {Error} 500 - Returns a 500 status code with an error message if the operation fails.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dbAdapter } from '@src/databases/db';

// System Logger
import logger from '@src/utils/logger';

// POST: Create a new virtual folder
export const POST: RequestHandler = async ({ request }) => {
	try {
		const { name, parent, path } = await request.json();

		// Validate request data
		if (!name) {
			return json({ success: false, error: 'Folder name is required' }, { status: 400 });
		}

		const result = await dbAdapter.createVirtualFolder({ name, parent, path });
		return json({ success: true, folder: result });
	} catch (error) {
		logger.error('Error creating folder:', error);
		return json({ success: false, error: 'Failed to create folder' }, { status: 500 });
	}
};

// GET: Retrieve all virtual folders
export const GET: RequestHandler = async () => {
	try {
		const folders = await dbAdapter.getVirtualFolders();
		if (!folders || folders.length === 0) {
			logger.info('No virtual folders found.');
			return json({ success: true, folders: [] }); // Return an empty list
		}
		return json({ success: true, folders });
	} catch (error) {
		logger.error('Error fetching folders:', error);
		return json({ success: false, error: 'Failed to fetch folders' }, { status: 500 });
	}
};

// PATCH: Update an existing virtual folder
export const PATCH: RequestHandler = async ({ request }) => {
	try {
		const { folderId, name, parent } = await request.json();

		// Validate request data
		if (!folderId) {
			return json({ success: false, error: 'Folder ID is required' }, { status: 400 });
		}

		const success = await dbAdapter.updateVirtualFolder(folderId, name, parent);
		if (!success) {
			return json({ success: false, error: 'Folder update failed' }, { status: 404 });
		}

		const updatedFolder = await dbAdapter.getVirtualFolderById(folderId);
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

		// Validate request data
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
