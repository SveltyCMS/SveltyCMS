/**
 * @file src/routes/api/role/create/+server.ts
 * @description API endpoint for updating the CMS configuration file.
 *
 * This module provides functionality to:
 * - Update the collections configuration file based on API input
 * - Validate and transform incoming configuration data
 * - Compare new configuration with existing to avoid unnecessary updates
 * - Handle file operations for reading and writing the config file
 *
 * Features:
 * - Dynamic configuration update without manual file editing
 * - Data transformation from API format to config file format
 * - Hash-based comparison to prevent redundant file writes
 * - Error handling and logging for file operations
 *
 * Usage:
 * POST /api/role/create
 * Body: JSON array of category objects with collections
 *
 * Note: This endpoint modifies a crucial configuration file.
 * Ensure proper access controls and input validation are in place.
 */

import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

// System Logs
import { initializationPromise, authAdapter } from '@src/databases/db';
import logger from '@src/utils/logger';

export const POST: RequestHandler = async ({ request }) => {
	try {
		await initializationPromise;
		const { roleData, currentUserId } = await request.json();
		await authAdapter?.createRole(roleData, currentUserId);
		console.log(roleData, currentUserId);
		return json({ sucess: true }, { status: 200 });
	} catch (error: any) {
		console.log(error);
		logger.error('Error updating config file:', error);
		return new Response(`Error updating config file: ${error.message}`, { status: 500 });
	}
};
