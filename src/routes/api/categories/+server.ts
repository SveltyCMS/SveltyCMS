/**
 * @file src/routes/api/categories/+server.ts
 * @description Unified API endpoint for category management
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { collectionManager } from '@src/collections/CollectionManager';
import type { CollectionData } from '@src/collections/types';
import { v4 as uuidv4 } from 'uuid';
import { dbAdapter } from '@src/databases/db';
import type { SystemVirtualFolder } from '@src/databases/dbInterface';

// System Logger
import { logger } from '@utils/logger.svelte';


export const GET: RequestHandler = async () => {
    try {
        // Directly from database
        const virtualFolders = await dbAdapter.getVirtualFolders();
        const categories = virtualFolders.reduce((acc, folder) => {
            acc[folder.path] = {
                id: folder._id.toString(),
                name: folder.name,
                icon: folder.icon,
                subcategories: {},
                isCollection: false
            };
            return acc;
        }, {} as Record<string, CollectionData>)
        return json({
            success: true,
            categories
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error in GET /api/categories:', errorMessage);
        return json({ error: 'Failed to fetch categories' }, { status: 500 });
    }
};
export const POST: RequestHandler = async ({ request }) => {
    try {
        // Check if this is a save action
        const data = await request.json();
        const isSaveAction = data?.save === true;
        if (!isSaveAction) {
            return json({
                success: true,
                message: 'No action taken - save flag not set'
            });
        }
        const virtualFolders = await dbAdapter.getVirtualFolders();
        const virtualFolderMap = new Map(virtualFolders.map(folder => [folder.path, folder]));
        // Process directory structure while preserving existing IDs
        const newCategories = await processDirectory(data?.path, virtualFolderMap);
        // update data on database
        const virtualFolderPromises = Object.values(newCategories).map(async (category) => {
            const existingFolder = virtualFolderMap.get(category.path)
            if (existingFolder) {
                await dbAdapter.updateVirtualFolder(existingFolder._id.toString(), {
                    name: category.name,
                    icon: category.icon,
                    order: category.order
                })
            } else {
                await dbAdapter.createVirtualFolder({ name: category.name, path: category.path, icon: category.icon, order: category.order })
            }
        })
        await Promise.all(virtualFolderPromises);
        // Update collections to reflect the changes
        await collectionManager.updateCollections(true);
        logger.info('Categories updated successfully');
        return json({
            success: true,
            message: 'Categories updated successfully',
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error in POST /api/categories:', errorMessage);
        return json({ error: 'Failed to update categories' }, { status: 500 });
    }
};
export const PUT: RequestHandler = async ({ request }) => {
    try {
        const { categoryId, updates } = await request.json();
        const virtualFolders = await dbAdapter.getVirtualFolders();
        const virtualFolderMap = new Map(virtualFolders.map(folder => [folder._id.toString(), folder]));
        // Find the folder to update
        const folderToUpdate = virtualFolderMap.get(categoryId);
        if (!folderToUpdate) {
            return json({ error: 'Category not found' }, { status: 404 });
        }
        await dbAdapter.updateVirtualFolder(folderToUpdate._id.toString(), updates);
        // Update collections to reflect the changes
        await collectionManager.updateCollections(true);
        logger.info(`Category ${categoryId} updated successfully`);
        return json({
            success: true,
            message: 'Category updated successfully',
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error in PUT /api/categories:', errorMessage);
        return json({ error: 'Failed to update category' }, { status: 500 });
    }
};
// Process directory structure into categories while preserving existing IDs
async function processDirectory(dirPath: string | undefined, existingFolders: Map<string, SystemVirtualFolder> = new Map()): Promise<Record<string, CollectionData>> {
    if (!dirPath) return {};
    const categories: Record<string, CollectionData> = {};
    const items = await import('fs').then(fs => fs.promises.readdir(dirPath));

    // First pass: Process directories (categories)
    for (const item of items) {
        if (item === '.DS_Store') continue;
        const fullPath = path.join(dirPath, item);
        const stats = await import('fs').then(fs => fs.promises.stat(fullPath));

        // Only process directories as categories
        if (stats.isDirectory()) {
            const categoryName = item;
            const existingFolder = existingFolders.get(fullPath);
            const subcategories = await processDirectory(fullPath, existingFolders);
            categories[fullPath] = {
                id: existingFolder?._id.toString() || uuidv4(),
                path: fullPath,
                name: categoryName.replace(/([A-Z])/g, ' $1').trim(),
                icon: existingFolder?.icon || 'bi:folder',
                order: existingFolder?.order || 999,
                isCollection: false,
                ...(Object.keys(subcategories).length > 0 && { subcategories })
            };
        }
    }
    // Second pass: Process .ts files (collections)
    for (const item of items) {
        if (!item.endsWith('.ts')) continue;
        const collectionTypes = path.parse(item).name;
        const existingFolder = existingFolders.get(path.join(dirPath, item));

        categories[path.join(dirPath, item)] = {
            id: existingFolder?._id.toString() || uuidv4(),
            path: path.join(dirPath, item),
            name: collectionTypes.replace(/([A-Z])/g, ' $1').trim(),
            icon: existingFolder?.icon || 'bi:file-text',
            isCollection: true,
            order: existingFolder?.order || 999
        };
    }
    return categories;
}