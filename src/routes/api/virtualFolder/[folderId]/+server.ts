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
import type { SystemVirtualFolder } from '@src/databases/dbInterface';
import { dbAdapter } from '@src/databases/db';

import { 
    type FolderContents, 
    type VirtualFolderUpdateData,
    type FolderResponse,
    VirtualFolderError 
} from '@src/types/virtualFolder';

// System Logger
import { logger } from '@utils/logger';

// Utility function to validate database connection
function validateDb(): void {
    if (!dbAdapter) {
        throw new VirtualFolderError('Database adapter is not initialized', 500, 'DB_NOT_INITIALIZED');
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
    
    await Promise.all(children.map(async (child) => {
        const newPath = `${newParentPath}/${child.name}`;
        await dbAdapter.updateVirtualFolder(child._id, {
            path: newPath,
            parent: folderId
        });
        await updateChildPaths(child._id, newPath);
    }));
}

// Error handler wrapper for request handlers
const handleRequest = (handler: (params: any, data?: any) => Promise<Response>) => {
    return async ({ params, request }: { params: any, request?: Request }) => {
        try {
            validateDb();
            return await handler(params, request ? await request.json() : undefined);
        } catch (err) {
            const error = err as Error;
            const status = err instanceof VirtualFolderError ? err.status : 500;
            logger.error(`${error.name}: ${error.message}`);
            return json({ success: false, error: error.message }, { status });
        }
    };
};

// GET: Retrieve folder contents
export const GET: RequestHandler = handleRequest(async ({ folderId }) => {
    const folder = folderId === 'root' 
        ? await getRootFolder() 
        : await dbAdapter.findOne('SystemVirtualFolder', { _id: folderId });

    if (!folder) {
        throw new VirtualFolderError('Folder not found', 404, 'FOLDER_NOT_FOUND');
    }

    const folderContents = await dbAdapter.getVirtualFolderContents(folder._id.toString()) || { subfolders: [], mediaFiles: [] };
    const contents: FolderContents = {
        subfolders: Array.isArray(folderContents.subfolders) ? folderContents.subfolders : [],
        mediaFiles: Array.isArray(folderContents.mediaFiles) ? folderContents.mediaFiles : []
    };

    return json({
        success: true,
        contents,
        folder: formatFolderResponse(folder)
    });
});

// POST: Create a new subfolder
export const POST: RequestHandler = handleRequest(async ({ folderId }, data) => {
    const { name } = data;
    if (!name) {
        throw new VirtualFolderError('Folder name is required', 400, 'NAME_REQUIRED');
    }

    const parentFolder = folderId === 'root' 
        ? await getRootFolder() 
        : await dbAdapter.findOne('SystemVirtualFolder', { _id: folderId });

    if (!parentFolder) {
        throw new VirtualFolderError('Parent folder not found', 404, 'PARENT_NOT_FOUND');
    }

    const newPath = `${parentFolder.path}/${name}`;
    const newFolder = await dbAdapter.createVirtualFolder({
        name,
        parent: parentFolder._id,
        path: newPath
    });

    logger.info(`Subfolder created: ${name} under folderId ${parentFolder._id}`);

    return json(
        {
            success: true,
            folder: formatFolderResponse(newFolder, 'New')
        },
        { status: 201 }
    );
});

// PATCH: Update folder details
export const PATCH: RequestHandler = handleRequest(async ({ folderId }, data) => {
    const { name, parent } = data;
    if (!name) {
        throw new VirtualFolderError('Folder name is required', 400, 'NAME_REQUIRED');
    }

    const folder = folderId === 'root' 
        ? await getRootFolder() 
        : await dbAdapter.findOne('SystemVirtualFolder', { _id: folderId });

    if (!folder) {
        throw new VirtualFolderError('Folder not found', 404, 'FOLDER_NOT_FOUND');
    }

    let newParent: SystemVirtualFolder | null = null;
    if (parent) {
        newParent = parent === 'root' 
            ? await getRootFolder() 
            : await dbAdapter.findOne('SystemVirtualFolder', { _id: parent });
        
        if (!newParent) {
            throw new VirtualFolderError('New parent folder not found', 404, 'PARENT_NOT_FOUND');
        }
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
        folder: formatFolderResponse(updatedFolder, 'Updated')
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
