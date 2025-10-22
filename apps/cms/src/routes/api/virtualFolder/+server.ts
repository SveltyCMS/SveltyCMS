/**
 * @file src/routes/api/virtual-folders/+server.ts
 * @description API endpoint for virtual folder operations, now multi-tenant aware.
 * @description Handles virtual folder CRUD operations.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPrivateSettingSync } from '@src/services/settingsService';

// Database
// import { dbAdapter } from '@src/databases/db';

// Permission checking

// System Logger
import { logger } from '@utils/logger.svelte';

// Types
import type { SystemVirtualFolder } from '@src/databases/dbInterface';

// GET: List all virtual folders for the current tenant
export const GET: RequestHandler = async ({ locals }) => {
	const dbAdapter = locals.dbAdapter;
	const { user, tenantId } = locals;
	try {
		// Authentication is handled by hooks.server.ts
		if (!user) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		if (!dbAdapter) {
			throw error(503, 'Service Unavailable: Database service is not properly initialized');
		}

		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		}

		const filter = getPrivateSettingSync('MULTI_TENANT') ? { tenantId } : {};
		const result = await dbAdapter.crud.findMany('system_virtual_folders', filter);
		if (!result.success) {
			throw error(500, result.error?.message || 'Failed to fetch virtual folders');
		}
		const folders = result.data;

		return json({
			success: true,
			data: folders,
			message: `Found ${folders.length} virtual folders.`
		});
	} catch (err) {
		logger.error('Error fetching virtual folders:', { error: err, tenantId });
		return json(
			{
				success: false,
				error: 'Failed to fetch virtual folders'
			},
			{ status: 500 }
		);
	}
};

// POST: Create a new virtual folder for the current tenant
export const POST: RequestHandler = async ({ request, locals }) => {
	const dbAdapter = locals.dbAdapter;
	const { user, tenantId } = locals;
	try {
		// Authentication is handled by hooks.server.ts
		if (!user) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		if (!dbAdapter) {
			throw error(503, 'Service Unavailable: Database service is not properly initialized');
		}

		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		}

		const data = await request.json();
		const { name, parentId } = data;

		if (!name || typeof name !== 'string') {
			throw error(400, 'Name is required and must be a string');
		}

		const folderData: Partial<SystemVirtualFolder> = {
			name: name.trim(),
			parentId: parentId || null,
			...(getPrivateSettingSync('MULTI_TENANT') && { tenantId }),
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};

		const result = await dbAdapter.crud.insert('system_virtual_folders', folderData);
		if (!result.success) {
			throw error(500, result.error?.message || 'Failed to create virtual folder');
		}
		const newFolder = result.data;

		return json(
			{
				success: true,
				message: 'Virtual folder created successfully',
				data: newFolder
			},
			{ status: 201 }
		);
	} catch (err) {
		logger.error('Error creating virtual folder:', { error: err, tenantId });
		return json(
			{
				success: false,
				error: 'Failed to create virtual folder'
			},
			{ status: 500 }
		);
	}
};
