/**
 * @file src/routes/api/role/create/+server.ts
 * @description API endpoint for setting a role as an admin in the CMS.
 *
 * This module provides functionality to:
 * - Retrieve all roles from the database
 * - Set a specific role as an admin based on API input
 * - Ensure only one role can be set as an admin at a time
 * - Update the roles configuration in the database
 *
 * Features:
 * - Dynamic role update without manual file editing
 * - Error handling and logging for database operations
 *
 * Usage:
 * POST /api/role/create
 * Body: JSON object with 'roleId'
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
	// Authorization check (example, ensure you have proper authentication in place)
	const user = locals.user;
	if (!user || !user.isAdmin) {
		logger.warn('Unauthorized attempt to update roles');
		return json({ success: false, error: 'Unauthorized' }, { status: 403 });
	}

	try {
		await initializationPromise;
		const { roleId } = await request.json();

		// Validate roleId
		if (!roleId || typeof roleId !== 'string') {
			logger.warn('Invalid roleId provided');
			return json({ success: false, error: 'Invalid roleId' }, { status: 400 });
		}

		let roles = await authAdapter?.getAllRoles();

		if (!roles) {
			logger.error('Failed to retrieve roles from the database');
			return json({ success: false, error: 'Failed to retrieve roles' }, { status: 500 });
		}

		roles = roles.map((cur) => {
			if (cur._id === roleId) {
				return { ...cur, isAdmin: true };
			}
			if (cur.isAdmin) {
				return { ...cur, isAdmin: false };
			}
			return cur;
		});

		await authAdapter?.setAllRoles(roles);

		logger.info(`Role ${roleId} set as admin successfully`);
		return json({ success: true }, { status: 200 });
	} catch (error: any) {
		logger.error('Error updating role configuration:', error);
		return json({ success: false, error: `Error updating role configuration: ${error.message}` }, { status: 500 });
	}
};
