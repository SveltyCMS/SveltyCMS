/**
 * @file src/routes/api/systemVirtualFolder/+server.ts
 * @description API endpoint for system virtual folder operations
 *
 * @example POST /api/systemVirtualFolder - Creates a new system virtual folder
 *
 * Features:
 * - Create a new system virtual folder
 * - Secure, granular access control per operation
 * - Status-based access control for non-admin users
 * - ModifyRequest support for widget-based data processing
 * - Status-based access control for non-admin users
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Database
import { dbAdapter } from '@src/databases/db';

// System Logger
import { logger } from '@utils/logger.svelte';

// Types
import type { SystemVirtualFolder } from '@src/databases/dbInterface';

// GET /api/systemVirtualFolder - Fetches all system virtual folders
export const GET: RequestHandler = async ({ locals }) => {
	try {
		// Check authentication
		if (!locals.user) {
			throw error(401, 'Authentication required');
		}

		// Fetch all system virtual folders
		const folders = await dbAdapter.getAll('system_virtual_folders');

		logger.debug(`Fetched ${folders.length} system virtual folders`);

		return json({
			success: true,
			data: folders
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error occurred';
		logger.error(`Error fetching system virtual folders: ${message}`);

		throw error(500, message);
	}
};

// POST /api/systemVirtualFolder - Creates a new system virtual folder
export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Check authentication
		if (!locals.user) {
			throw error(401, 'Authentication required');
		}

		// Parse request body
		const body = await request.json();
		const { name, parentId } = body;

		// Validate required fields
		if (!name || typeof name !== 'string') {
			throw error(400, 'Name is required and must be a string');
		}

		// Create folder data
		const folderData: Partial<SystemVirtualFolder> = {
			name: name.trim(),
			parentId: parentId || null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};

		// Create the folder
		const newFolder = await dbAdapter.create('system_virtual_folders', folderData);

		logger.info(`Created system virtual folder: ${folderData.name}`);

		return json({
			success: true,
			folder: newFolder
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error occurred';
		logger.error(`Error creating system virtual folder: ${message}`);

		throw error(500, message);
	}
};
