/**
 * @file src/routes/api/role/update/+server.ts
 * @description API endpoint for updating a role in the CMS.
 *
 * This module provides functionality to:
 * - Update an existing role in the CMS based on API input
 * - Validate the incoming role data
 * - Ensure proper logging and error handling during the role update process
 *
 * Features:
 * - Dynamic role update without manual file editing
 * - Data validation for incoming role data
 * - Error handling and logging for database operations
 *
 * Usage:
 * POST /api/role/update
 * Body: JSON object with 'currentRoleId', 'roleData', and 'currentUserId'
 *
 * Note: This endpoint modifies a crucial configuration file.
 * Ensure proper access controls and input validation are in place.
 */

import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { initializationPromise, authAdapter } from '@src/databases/db';

// System Logs
import { logger } from '@src/utils/logger';

export const POST: RequestHandler = async ({ request, locals }) => {
	// Authorization check to ensure only admins can update roles
	const user = locals.user;
	if (!user || !user.isAdmin) {
		logger.warn('Unauthorized attempt to update a role');
		return json({ success: false, error: 'Unauthorized' }, { status: 403 });
	}

	try {
		await initializationPromise;
		const { currentRoleId, roleData, currentUserId } = await request.json();

		// Validate input data
		if (typeof currentRoleId !== 'string' || !validateRoleData(roleData) || typeof currentUserId !== 'string') {
			logger.warn('Invalid currentRoleId, roleData, or currentUserId provided');
			return json({ success: false, error: 'Invalid input data' }, { status: 400 });
		}

		await authAdapter?.updateRole(currentRoleId, roleData, currentUserId);

		logger.info(`Role ${currentRoleId} updated successfully by user ${currentUserId}`);
		return json({ success: true }, { status: 200 });
	} catch (error: any) {
		logger.error('Error updating role:', error);
		return json({ success: false, error: `Error updating role: ${error.message}` }, { status: 500 });
	}
};

// Function to validate the structure of roleData
function validateRoleData(roleData: any): boolean {
	return (
		typeof roleData === 'object' &&
		typeof roleData._id === 'string' &&
		typeof roleData.name === 'string' &&
		Array.isArray(roleData.permissions) &&
		roleData.permissions.every((perm: any) => typeof perm === 'string') &&
		(roleData.isAdmin === undefined || typeof roleData.isAdmin === 'boolean') &&
		(roleData.description === undefined || typeof roleData.description === 'string')
	);
}
