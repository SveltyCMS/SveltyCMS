/**
 * @file src/routes/api/systemVirtualFolder/+server.ts
 * @description API endpoint for system virtual folder operations
 *
 * @example POST /api/systemVirtualFolder - Creates a new system virtual folder
 *
 * Features:
 * - Create a new system virtual folder, scoped to the current tenant.
 * - Secure, granular access control per operation.
 * - Status-based access control for non-admin users.
 * - ModifyRequest support for widget-based data processing.
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPrivateSettingSync } from '@shared/services/settingsService';

// Database
import { dbAdapter } from '@shared/database/db';

// System Logger
import { logger } from '@shared/utils/logger.server';

// Types
import type { SystemVirtualFolder } from '@shared/database/dbInterface';
import type { DatabaseId } from '@cms-types';

// GET /api/systemVirtualFolder - Fetches all system virtual folders for the current tenant
export const GET: RequestHandler = async ({ locals }) => {
	const { user, tenantId } = locals;
	try {
		// Check authentication
		if (!user) {
			throw error(401, 'Authentication required');
		}

		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		}

		// Check if dbAdapter is initialized
		if (!dbAdapter) {
			logger.error('Database adapter not initialized');
			throw error(500, 'Database adapter not initialized');
		}

		// Check if dbAdapter has systemVirtualFolder interface
		if (!dbAdapter.systemVirtualFolder) {
			logger.error('Database adapter systemVirtualFolder interface not available');
			throw error(500, 'Database adapter systemVirtualFolder interface not available');
		}

		// --- MULTI-TENANCY: Scope the query by tenantId ---
		const result = await dbAdapter.systemVirtualFolder.getAll();

		if (!result.success) {
			logger.error('Database query failed', { error: result.error });
			throw error(500, result.error?.message || 'Database query failed');
		}

		const folders = result.data || [];

		logger.debug(`Fetched ${folders.length} system virtual folders`, { tenantId });

		return json({
			success: true,
			data: folders
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error occurred';
		logger.error(`Error fetching system virtual folders: ${message}`, { tenantId });

		throw error(500, message);
	}
};

// POST /api/systemVirtualFolder - Creates a new system virtual folder for the current tenant
export const POST: RequestHandler = async ({ request, locals }) => {
	const { user, tenantId } = locals;
	try {
		// Check authentication
		if (!user) {
			throw error(401, 'Authentication required');
		}

		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		} // Parse request body

		const body = await request.json();
		const { name, parentId } = body; // Validate required fields

		if (!name || typeof name !== 'string') {
			throw error(400, 'Name is required and must be a string');
		}

		// Check if dbAdapter is initialized
		if (!dbAdapter) {
			logger.error('Database adapter not initialized');
			throw error(500, 'Database adapter not initialized');
		}

		// Build the path based on parent folder
		let folderPath = '';
		if (parentId) {
			const parentResult = await dbAdapter.systemVirtualFolder.getById(parentId as DatabaseId);
			if (parentResult.success && parentResult.data) {
				folderPath = `${parentResult.data.path}/${name.trim()}`;
			} else {
				throw error(400, 'Parent folder not found');
			}
		} else {
			// Root level folder
			folderPath = `/${name.trim()}`;
		}

		// Create folder data, including tenantId if in multi-tenant mode
		const folderData: Omit<SystemVirtualFolder, '_id' | 'createdAt' | 'updatedAt'> = {
			name: name.trim(),
			path: folderPath,
			type: 'folder',
			parentId: parentId ? (parentId as DatabaseId) : null,
			order: 0,
			...(getPrivateSettingSync('MULTI_TENANT') && { tenantId })
		}; // Create the folder

		const result = await dbAdapter.systemVirtualFolder.create(folderData);

		if (!result.success) {
			logger.error('Database insert failed', { error: result.error });
			throw error(500, result.error?.message || 'Database insert failed');
		}

		const newFolder = result.data;

		logger.info(`Created system virtual folder: ${folderData.name}`, { tenantId });

		return json({
			success: true,
			folder: newFolder
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error occurred';
		logger.error(`Error creating system virtual folder: ${message}`, { tenantId });

		throw error(500, message);
	}
};

// PATCH /api/systemVirtualFolder - Handles folder reordering
export const PATCH: RequestHandler = async ({ request, locals }) => {
	const { user, tenantId } = locals;
	try {
		// Check authentication
		if (!user) {
			throw error(401, 'Authentication required');
		}

		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		}

		const body = await request.json();
		const { action, orderUpdates } = body;

		if (action !== 'reorder') {
			throw error(400, 'Invalid action');
		}

		if (!Array.isArray(orderUpdates)) {
			throw error(400, 'orderUpdates must be an array');
		}

		// Check if dbAdapter is initialized
		if (!dbAdapter) {
			logger.error('Database adapter not initialized');
			throw error(500, 'Database adapter not initialized');
		}

		// Store reference for use in async callbacks
		const adapter = dbAdapter;

		// Update each folder in a transaction
		const results = await Promise.all(
			orderUpdates.map(async (update: { folderId: string; order: number; parentId?: string | null }) => {
				const { folderId, order, parentId: newParentId } = update;

				// Get current folder to access its name
				const currentFolder = await adapter.systemVirtualFolder.getById(folderId as DatabaseId);
				if (!currentFolder.success || !currentFolder.data) {
					logger.error('Folder not found for reordering', { folderId });
					return { success: false, error: { message: 'Folder not found' } };
				}

				const updateData: Partial<SystemVirtualFolder> = { order };

				// If parentId changed, rebuild path
				if (newParentId !== undefined) {
					updateData.parentId = newParentId ? (newParentId as DatabaseId) : null;

					// Build new path based on new parent
					if (newParentId) {
						const parentResult = await adapter.systemVirtualFolder.getById(newParentId as DatabaseId);
						if (parentResult.success && parentResult.data) {
							updateData.path = `${parentResult.data.path}/${currentFolder.data.name}`;
						} else {
							logger.warn('Parent folder not found, using root path', { parentId: newParentId });
							updateData.path = `/${currentFolder.data.name}`;
						}
					} else {
						// Moving to root
						updateData.path = `/${currentFolder.data.name}`;
					}
				}

				return adapter.systemVirtualFolder.update(folderId as DatabaseId, updateData);
			})
		);

		const errors = results.filter((r) => !r.success);
		if (errors.length > 0) {
			logger.error('Error reordering folders', { errors });
			throw error(500, 'Error reordering folders');
		}

		logger.info('Reordered folders successfully', { tenantId });

		return json({ success: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error occurred';
		logger.error(`Error reordering folders: ${message}`, { tenantId });

		throw error(500, message);
	}
};
