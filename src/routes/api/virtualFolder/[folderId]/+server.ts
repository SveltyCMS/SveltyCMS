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
import { logger } from '@src/utils/logger';
import { publicEnv } from '@root/config/public';

// Interface representing a Virtual Folder
interface VirtualFolder {
	_id: string;
	name: string;
	parent?: string | null;
	path: string;
}

export const GET: RequestHandler = async ({ params }) => {
	let { folderId } = params;

	try {
		// Handle 'root' as a special case by fetching the root folder based on MEDIA_FOLDER from config
		if (folderId === 'root') {
			const rootFolder = await dbAdapter.findOne<VirtualFolder>('VirtualFolder', {
				name: publicEnv.MEDIA_FOLDER,
				parent: null
			});

			if (!rootFolder) {
				logger.error('Root virtual folder not found');
				return json({ success: false, error: 'Root folder does not exist' }, { status: 500 });
			}

			folderId = rootFolder._id.toString();
		}

		// Fetch the contents of the folder (subfolders and mediaFiles)
		const contents = await dbAdapter.getVirtualFolderContents(folderId);

		// Validate the structure of contents
		if (!contents || typeof contents !== 'object' || !Array.isArray(contents.subfolders) || !Array.isArray(contents.mediaFiles)) {
			logger.warn('Invalid contents structure received:', contents);
			return json({ success: true, contents: { subfolders: [], mediaFiles: [] } }, { status: 200 });
		}

		return json({ success: true, contents }, { status: 200 });
	} catch (error) {
		logger.error(`Error fetching folder contents for folderId ${folderId}:`, error);
		return json({ success: false, error: 'Failed to fetch folder contents' }, { status: 500 });
	}
};

// POST: Create a subfolder within the specified virtual folder
export const POST: RequestHandler = async ({ params, request }) => {
	let { folderId } = params;

	try {
		const { name } = await request.json();

		// Validate request data
		if (!name) {
			logger.warn('Folder name is missing in POST request');
			return json({ success: false, error: 'Folder name is required' }, { status: 400 });
		}

		// Determine the parent folder's path
		let parentPath = '';

		if (folderId === 'root') {
			// Fetch the root folder
			const rootFolder = await dbAdapter.findOne<VirtualFolder>('VirtualFolder', {
				name: publicEnv.MEDIA_FOLDER,
				parent: null
			});

			if (!rootFolder) {
				logger.error('Root virtual folder not found');
				return json({ success: false, error: 'Root folder does not exist' }, { status: 500 });
			}

			folderId = rootFolder._id.toString();
			parentPath = rootFolder.path;
		} else {
			// Fetch the parent folder to get its path
			const parentFolder = await dbAdapter.findOne<VirtualFolder>('VirtualFolder', {
				_id: folderId
			});

			if (!parentFolder) {
				logger.error(`Parent folder with ID ${folderId} not found`);
				return json({ success: false, error: 'Parent folder not found' }, { status: 404 });
			}

			parentPath = parentFolder.path;
		}

		// Construct the path for the new folder
		const newPath = `${parentPath}/${name}`;

		// Create the new virtual folder
		const newFolderData = {
			name,
			parent: folderId,
			path: newPath
		};

		const newFolder = await dbAdapter.createVirtualFolder(newFolderData);

		logger.info(`Subfolder created: ${name} under folderId ${folderId}`);

		return json({ success: true, folder: newFolder }, { status: 201 });
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
			logger.warn('Folder name is missing in PATCH request');
			return json({ success: false, error: 'Folder name is required' }, { status: 400 });
		}

		// If parent is being updated, handle 'root' or validate new parent
		let updatedParent = parent;

		if (parent) {
			if (parent === 'root') {
				// Fetch the root folder
				const rootFolder = await dbAdapter.findOne<VirtualFolder>('VirtualFolder', {
					name: publicEnv.MEDIA_FOLDER,
					parent: null
				});

				if (!rootFolder) {
					logger.error('Root virtual folder not found');
					return json({ success: false, error: 'Root folder does not exist' }, { status: 500 });
				}

				updatedParent = rootFolder._id.toString();
			} else {
				// Validate the new parent folder
				const newParentFolder = await dbAdapter.findOne<VirtualFolder>('VirtualFolder', {
					_id: parent
				});

				if (!newParentFolder) {
					logger.error(`New parent folder with ID ${parent} not found`);
					return json({ success: false, error: 'New parent folder not found' }, { status: 404 });
				}
			}
		}

		// Update the virtual folder's name and parent
		const updateData = {
			name,
			parent: updatedParent || null // If parent is undefined, set to null
		};

		const updatedFolder = await dbAdapter.updateVirtualFolder(folderId, updateData);

		if (!updatedFolder) {
			logger.warn(`Failed to update folder with ID ${folderId}`);
			return json({ success: false, error: 'Folder update failed' }, { status: 404 });
		}

		// Reconstruct the path based on the new parent
		let newPath = '';

		if (updatedFolder.parent) {
			const parentFolder = await dbAdapter.findOne<VirtualFolder>('VirtualFolder', {
				_id: updatedFolder.parent
			});

			if (!parentFolder) {
				logger.error(`Parent folder with ID ${updatedFolder.parent} not found`);
				return json({ success: false, error: 'Parent folder not found' }, { status: 404 });
			}

			newPath = `${parentFolder.path}/${updatedFolder.name}`;
		} else {
			// If parent is null, it's the root folder
			newPath = publicEnv.MEDIA_FOLDER;
		}

		// Update the path of the current folder
		await dbAdapter.updateVirtualFolder(folderId, { path: newPath });

		// For simplicity, this example does not handle recursive path updates

		logger.info(`Folder with ID ${folderId} updated successfully`);

		// Fetch the updated folder details
		const refreshedFolder = await dbAdapter.findOne<VirtualFolder>('VirtualFolder', {
			_id: folderId
		});

		return json({ success: true, folder: refreshedFolder }, { status: 200 });
	} catch (error) {
		logger.error('Error updating folder:', error);
		return json({ success: false, error: 'Failed to update folder' }, { status: 500 });
	}
};

// DELETE: Delete a specific virtual folder and its contents, including subfolders
export const DELETE: RequestHandler = async ({ params }) => {
	const { folderId } = params;

	try {
		// Attempt to delete the virtual folder
		const success = await dbAdapter.deleteVirtualFolder(folderId);

		if (!success) {
			logger.warn(`Folder deletion failed for folderId ${folderId}`);
			return json({ success: false, error: 'Folder deletion failed' }, { status: 404 });
		}

		logger.info(`Folder with ID ${folderId} deleted successfully`);
		return json({ success: true }, { status: 200 });
	} catch (error) {
		logger.error('Error deleting folder:', error);
		return json({ success: false, error: 'Failed to delete folder' }, { status: 500 });
	}
};
