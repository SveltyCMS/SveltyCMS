/**
 * @file src/routes/api/virtualFolder/[folderId]/+server.ts
 * @description API endpoint to manage a specific virtual folder and its contents, including subfolders and media files.
 *
 * @method GET
 * @method POST
 * @method PATCH
 * @method DELETE
 *
 * @param {Object} request - The request object containing the following properties:
 *  - folderId: string (required) - The ID of the virtual folder to manage.
 *  - name: string (required for POST and PATCH) - The name of the folder to create or update.
 *  - parent: string (optional for PATCH) - The ID of the new parent folder (for moving).
 *
 * @returns {Object} JSON response containing:
 *  - success: boolean - Indicates whether the operation was successful.
 *  - contents: object (optional) - Contains folder details and its contents (for GET).
 *  - folder: object (optional) - Contains updated folder details (for PATCH and POST).
 *  - error: string (optional) - Error message if the operation fails.
 *
 * @throws {Error} 500 - Returns a 500 status code with an error message if an operation fails.
 * @throws {Error} 404 - Returns a 404 status code if a folder is not found during update or delete operations.
 * @throws {Error} 400 - Returns a 400 status code with an error message if required parameters are missing.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dbAdapter } from '@src/databases/db';
import logger from '@src/utils/logger';

// GET: Retrieve the contents of a specific virtual folder, including subfolders and media files
export const GET: RequestHandler = async ({ params }) => {
	const { folderId } = params;

	try {
		const contents = await dbAdapter.getVirtualFolderContents(folderId);
		return json({ success: true, contents });
	} catch (error) {
		logger.error('Error fetching folder contents:', error);
		return json({ success: false, error: 'Failed to fetch folder contents' }, { status: 500 });
	}
};

// POST: Create a subfolder within the specified virtual folder
export const POST: RequestHandler = async ({ params, request }) => {
	const { folderId } = params;

	try {
		const { name } = await request.json();

		// Validate request data
		if (!name) {
			return json({ success: false, error: 'Folder name is required' }, { status: 400 });
		}

		const newFolder = await dbAdapter.createVirtualFolder({ name, parent: folderId });
		return json({ success: true, folder: newFolder });
	} catch (error) {
		logger.error('Error creating subfolder:', error);
		return json({ success: false, error: 'Failed to create subfolder' }, { status: 500 });
	}
};

// PATCH: Update a specific virtual folder's details
export const PATCH: RequestHandler = async ({ params, request }) => {
	const { folderId } = params;

	try {
		const { name, parent } = await request.json();

		// Validate request data
		if (!name) {
			return json({ success: false, error: 'Folder name is required' }, { status: 400 });
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

// DELETE: Delete a specific virtual folder and its contents, including subfolders
export const DELETE: RequestHandler = async ({ params }) => {
	const { folderId } = params;

	try {
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
