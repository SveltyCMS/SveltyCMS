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

import { error, json } from '@sveltejs/kit';
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

		if (!dbAdapter?.systemVirtualFolder) {
			throw error(500, 'Virtual folder adapter not available');
		}

		// Fetch all system virtual folders via adapter API
		const vfResult = await dbAdapter.systemVirtualFolder.getAll();
		if (!vfResult.success) {
			const details = vfResult.error instanceof Error ? vfResult.error.message : String(vfResult.error);
			throw error(500, `Failed to fetch system virtual folders: ${details}`);
		}
		const folders = vfResult.data;

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

		if (!dbAdapter?.systemVirtualFolder) {
			throw error(500, 'Virtual folder adapter not available');
		}

		// Create the folder via adapter
		const createRes = await dbAdapter.systemVirtualFolder.create(folderData as any);
		if (!createRes.success) {
			const details = createRes.error instanceof Error ? createRes.error.message : String(createRes.error);
			throw error(500, `Failed to create system virtual folder: ${details}`);
		}
		const newFolder = createRes.data;

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
