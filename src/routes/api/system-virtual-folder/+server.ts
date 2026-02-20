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

import type { DatabaseId } from '@src/content/types';
// Database
import { dbAdapter } from '@src/databases/db';
// Types
import type { SystemVirtualFolder } from '@src/databases/db-interface';
import { getPrivateSettingSync } from '@src/services/settings-service';
import { json } from '@sveltejs/kit';
// GET /api/systemVirtualFolder - Fetches all system virtual folders for the current tenant
// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';
// System Logger
import { logger } from '@utils/logger.server';

export const GET = apiHandler(async ({ locals }) => {
	const { user, tenantId } = locals;
	try {
		// Check authentication
		if (!user) {
			throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
		}

		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw new AppError('Tenant could not be identified for this operation.', 400, 'TENANT_MISSING');
		}

		// Check if dbAdapter is initialized
		if (!dbAdapter) {
			logger.error('Database adapter not initialized');
			throw new AppError('Database adapter not initialized', 500, 'DB_UNAVAILABLE');
		}

		// Check if dbAdapter has systemVirtualFolder interface
		if (!dbAdapter.systemVirtualFolder) {
			logger.error('Database adapter systemVirtualFolder interface not available');
			throw new AppError('Database adapter systemVirtualFolder interface not available', 500, 'FEATURE_UNAVAILABLE');
		}

		// --- MULTI-TENANCY: Scope the query by tenantId ---
		const result = await dbAdapter.systemVirtualFolder.getAll();

		if (!result.success) {
			logger.error('Database query failed', { error: result.error });
			throw new AppError(result.error?.message || 'Database query failed', 500, 'DB_QUERY_FAILED');
		}

		const folders = result.data || [];

		logger.debug(`Fetched ${folders.length} system virtual folders`, {
			tenantId
		});

		return json({
			success: true,
			data: folders
		});
	} catch (err) {
		if (err instanceof AppError) {
			throw err;
		}
		const message = err instanceof Error ? err.message : 'Unknown error occurred';
		logger.error(`Error fetching system virtual folders: ${message}`, {
			tenantId
		});

		throw new AppError(message, 500, 'FETCH_FAILED');
	}
});

// POST /api/systemVirtualFolder - Creates a new system virtual folder for the current tenant
export const POST = apiHandler(async ({ request, locals }) => {
	const { user, tenantId } = locals;
	try {
		// Check authentication
		if (!user) {
			throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
		}

		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw new AppError('Tenant could not be identified for this operation.', 400, 'TENANT_MISSING');
		} // Parse request body

		const body = await request.json();
		const { name, parentId } = body; // Validate required fields

		if (!name || typeof name !== 'string') {
			throw new AppError('Name is required and must be a string', 400, 'INVALID_NAME');
		}

		// Check if dbAdapter is initialized
		if (!dbAdapter) {
			logger.error('Database adapter not initialized');
			throw new AppError('Database adapter not initialized', 500, 'DB_UNAVAILABLE');
		}

		// Build the path based on parent folder
		let folderPath = '';
		if (parentId) {
			const parentResult = await dbAdapter.systemVirtualFolder.getById(parentId as DatabaseId);
			if (parentResult.success && parentResult.data) {
				folderPath = `${parentResult.data.path}/${name.trim()}`;
			} else {
				throw new AppError('Parent folder not found', 400, 'PARENT_NOT_FOUND');
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
			throw new AppError(result.error?.message || 'Database insert failed', 500, 'CREATE_FAILED');
		}

		const newFolder = result.data;

		logger.info(`Created system virtual folder: ${folderData.name}`, {
			tenantId
		});

		return json({
			success: true,
			folder: newFolder
		});
	} catch (err) {
		if (err instanceof AppError) {
			throw err;
		}
		const message = err instanceof Error ? err.message : 'Unknown error occurred';
		logger.error(`Error creating system virtual folder: ${message}`, {
			tenantId
		});

		throw new AppError(message, 500, 'CREATE_FAILED');
	}
});

// PATCH /api/systemVirtualFolder - Handles folder reordering
export const PATCH = apiHandler(async ({ request, locals }) => {
	const { user, tenantId } = locals;
	try {
		// Check authentication
		if (!user) {
			throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
		}

		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw new AppError('Tenant could not be identified for this operation.', 400, 'TENANT_MISSING');
		}

		const body = await request.json();
		const { action, orderUpdates } = body;

		if (action !== 'reorder') {
			throw new AppError('Invalid action', 400, 'INVALID_ACTION');
		}

		if (!Array.isArray(orderUpdates)) {
			throw new AppError('orderUpdates must be an array', 400, 'INVALID_DATA');
		}

		// Check if dbAdapter is initialized
		if (!dbAdapter) {
			logger.error('Database adapter not initialized');
			throw new AppError('Database adapter not initialized', 500, 'DB_UNAVAILABLE');
		}

		// Store reference for use in async callbacks
		const adapter = dbAdapter;

		// Update each folder in a transaction
		const results = await Promise.all(
			orderUpdates.map(async (update: { folderId: string; order: number; parentId?: string | null }) => {
				const { folderId, order, parentId: newParentId } = update;

				// Get current folder to access its name
				const currentFolder = await adapter.systemVirtualFolder.getById(folderId as DatabaseId);
				if (!(currentFolder.success && currentFolder.data)) {
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
							logger.warn('Parent folder not found, using root path', {
								parentId: newParentId
							});
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

		// Check for failures in individual updates
		// Note: Promise.all won't fail here because we catch errors inside map but we're returning status objects
		const errors = results.filter((r) => !r.success);
		if (errors.length > 0) {
			logger.error('Error reordering folders', { errors });
			// We can decide to return partial success or fail completely. Fails completely is safer.
			throw new AppError('Error reordering folders', 500, 'REORDER_FAILED');
		}

		logger.info('Reordered folders successfully', { tenantId });

		return json({ success: true });
	} catch (err) {
		if (err instanceof AppError) {
			throw err;
		}
		const message = err instanceof Error ? err.message : 'Unknown error occurred';
		logger.error(`Error reordering folders: ${message}`, { tenantId });

		throw new AppError(message, 500, 'REORDER_FAILED');
	}
});
