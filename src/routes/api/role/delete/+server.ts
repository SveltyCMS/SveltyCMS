/**
 * @file src/routes/api/role/delete/+server.ts
 * @description API endpoint for deleting a role from the CMS.
 *
 * This module provides functionality to:
 * - Delete a role in the CMS based on API input
 * - Validate the incoming role data
 * - Ensure proper logging and error handling during the role deletion process
 *
 * Features:
 * - Dynamic role deletion without manual file editing
 * - Data validation for incoming role data
 * - Error handling and logging for database operations
 *
 * Usage:
 * POST /api/role/create
 * Body: JSON object with 'roleId' and 'currentUserId'
 *
 * Note: This endpoint modifies a crucial configuration file.
 * Ensure proper access controls and input validation are in place.
 */

import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { initializationPromise, authAdapter } from '@src/databases/db';

// System Logs
import { logger } from '@utils/logger';

export const POST: RequestHandler = async ({ request, locals }) => {
	// Authorization check to ensure only admins can delete roles
	const user = locals.user;
	if (!user || !user.isAdmin) {
		logger.warn('Unauthorized attempt to delete a role');
		return json({ success: false, error: 'Unauthorized' }, { status: 403 });
	}

	try {
		await initializationPromise;
		const { roleId, currentUserId } = await request.json();

		// Validate roleId and currentUserId
		if (typeof roleId !== 'string' || typeof currentUserId !== 'string') {
			logger.warn('Invalid roleId or currentUserId provided');
			return json({ success: false, error: 'Invalid roleId or currentUserId' }, { status: 400 });
		}

		await authAdapter?.deleteRole(roleId, currentUserId);

		logger.info(`Role ${roleId} deleted successfully by user ${currentUserId}`);
		return json({ success: true }, { status: 200 });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Error deleting role:', { error: errorMessage });
		return json({ success: false, error: `Error deleting role: ${error.message}` }, { status: 500 });
	}
};
