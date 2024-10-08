/**
 * @file src/routes/api/role/create/+server.ts
 * @description API endpoint for creating a new role in the CMS.
 *
 * This module provides functionality to:
 * - Create a new role in the CMS based on API input
 * - Validate the incoming role data
 * - Ensure proper logging and error handling during the role creation process
 *
 * Features:
 * - Dynamic role creation without manual file editing
 * - Data validation for incoming role data
 * - Error handling and logging for database operations
 *
 * Usage:
 * POST /api/role/create
 * Body: JSON object with 'roleData' and 'currentUserId'
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
	// Authorization check to ensure only admins can create roles
	const user = locals.user;
	if (!user || !user.isAdmin) {
		logger.warn('Unauthorized attempt to create a role');
		return json({ success: false, error: 'Unauthorized' }, { status: 403 });
	}

	try {
		await initializationPromise;
		const { roleData, currentUserId } = await request.json();

		// Validate role data
		if (!validateRoleData(roleData) || typeof currentUserId !== 'string') {
			logger.warn('Invalid role data or currentUserId provided');
			return json({ success: false, error: 'Invalid role data or currentUserId' }, { status: 400 });
		}

		await authAdapter?.createRole(roleData, currentUserId);

		logger.info(`Role ${roleData._id} created successfully by user ${currentUserId}`);
		return json({ success: true }, { status: 200 });
	} catch (error: any) {
		logger.error('Error creating role:', error);
		return json({ success: false, error: `Error creating role: ${error.message}` }, { status: 500 });
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
