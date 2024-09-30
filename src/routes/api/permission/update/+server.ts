/**
 * @file src/routes/api/role/create/+server.ts
 * @description API endpoint for creating or updating roles in the CMS.
 *
 * This module provides functionality to:
 * - Update the roles configuration file based on API input
 * - Validate and transform incoming roles data
 * - Handle file operations for saving roles configuration
 *
 * Features:
 * - Dynamic role creation or update without manual file editing
 * - Data transformation from API format to config file format
 * - Error handling and logging for file operations
 *
 * Usage:
 * POST /api/role/create
 * Body: JSON array of role objects
 *
 * Note: This endpoint modifies a crucial configuration file.
 * Ensure proper access controls and input validation are in place.
 */

import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

// Authorization
import { initializationPromise, authAdapter } from '@src/databases/db';

// System Logger
import logger from '@src/utils/logger';

export const POST: RequestHandler = async ({ request, locals }) => {
	// Authorization check (example, ensure you have proper authentication in place)
	const user = locals.user;
	if (!user || !user.isAdmin) {
		logger.warn('Unauthorized attempt to create/update roles');
		return json({ success: false, error: 'Unauthorized' }, { status: 403 });
	}

	try {
		await initializationPromise;

		const { roles } = await request.json();

		// Validate roles data
		if (!Array.isArray(roles) || !roles.every(validateRole)) {
			logger.warn('Invalid role data provided');
			return json({ success: false, error: 'Invalid role data' }, { status: 400 });
		}

		await authAdapter?.setAllRoles(roles);

		logger.info('Roles updated successfully');
		return json({ success: true }, { status: 200 });
	} catch (error: any) {
		logger.error('Error creating/updating roles:', error);
		return json({ success: false, error: `Error creating/updating roles: ${error.message}` }, { status: 500 });
	}
};

// Validates the structure of a role object
function validateRole(role: any): boolean {
	return (
		typeof role._id === 'string' &&
		typeof role.name === 'string' &&
		Array.isArray(role.permissions) &&
		role.permissions.every((perm: any) => typeof perm === 'string') &&
		(role.isAdmin === undefined || typeof role.isAdmin === 'boolean') &&
		(role.description === undefined || typeof role.description === 'string')
	);
}
