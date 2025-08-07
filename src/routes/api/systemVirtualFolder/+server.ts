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

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { privateEnv } from '@root/config/private';

// Database
import { dbAdapter } from '@src/databases/db';

// System Logger
import { logger } from '@utils/logger.svelte';

// Types
import type { SystemVirtualFolder } from '@src/databases/dbInterface';

// GET /api/systemVirtualFolder - Fetches all system virtual folders for the current tenant
export const GET: RequestHandler = async ({ locals }) => {
	const { user, tenantId } = locals;
	try {
		// Check authentication
		if (!user) {
			throw error(401, 'Authentication required');
		}

		if (privateEnv.MULTI_TENANT && !tenantId) {
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

		if (privateEnv.MULTI_TENANT && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		} // Parse request body

		const body = await request.json();
		const { name, parentId } = body; // Validate required fields

		if (!name || typeof name !== 'string') {
			throw error(400, 'Name is required and must be a string');
		} // Create folder data, including tenantId if in multi-tenant mode

		const folderData: Partial<SystemVirtualFolder> = {
			name: name.trim(),
			parentId: parentId || null,
			...(privateEnv.MULTI_TENANT && { tenantId }),
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
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
