/**
 * @file src/routes/(app)/config/assessManagement/+page.server.ts
 * @description Server-side logic for Assess Management page authentication and authorization.
 */

import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Auth
import { auth, authAdapter, initializationPromise } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import { checkUserPermission, type PermissionConfig } from '@src/auth/permissionCheck';
import { PermissionAction } from '@root/config/permissions';

// System Logs
import logger from '@src/utils/logger';
import { writable } from 'svelte/store';

export const load: PageServerLoad = async ({ cookies }) => {
	logger.debug('Starting load function for assess management page');

	try {
		// Wait for the initialization promise to resolve
		await initializationPromise;
		logger.debug('Initialization complete.');

		if (!auth || !authAdapter) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error: Auth system not initialized');
		}

		// Secure this page with session cookie
		const session_id = cookies.get(SESSION_COOKIE_NAME);
		logger.debug(`Session ID retrieved: ${session_id}`);

		if (!session_id) {
			logger.warn('No session ID found, redirecting to login');
			throw redirect(302, '/login');
		}

		// Validate the session and retrieve the associated user
		const user = await auth.validateSession({ session_id });
		logger.debug(`Session validation result: ${user ? 'Valid' : 'Invalid'}`);

		if (!user) {
			logger.warn(`Invalid session for session_id: ${session_id}`);
			throw redirect(302, '/login');
		}

		logger.debug(`User session validated successfully for user: ${user._id}`);

		// Make sure the user's role is correctly loaded
		const userRole = user.role;
		if (!userRole) {
			logger.warn(`User role is missing for user ${user.email}`);
			throw error(403, 'User role is missing');
		}

		// Check user permission for Assess Management
		logger.debug('Checking user permission for assess management');

		const permissionConfig: PermissionConfig = {
			contextId: 'config/assessManagement',
			requiredRole: 'admin',
			action: PermissionAction.READ, // Correctly set the action using PermissionAction enum
			contextType: 'system'
		};

		// Always allow access for admins
		if (userRole.toLowerCase() === 'admin') {
			logger.debug(`User ${user._id} has admin access to Assess Management`);
		} else {
			// Check user permission for non-admin roles
			const permissionResult = await checkUserPermission(user, permissionConfig);
			if (!permissionResult.hasPermission) {
				logger.warn(`User ${user._id} does not have permission to access Assess Management`);
				throw error(403, "You don't have permission to access this page");
			}
		}

		// Fetch roles and permissions in parallel
		logger.debug('Fetching roles and permissions...');
		const [roles, permissions] = await Promise.all([authAdapter.getAllRoles(), authAdapter.getAllPermissions()]);

		logger.debug(`Roles fetched: ${roles.length}`);
		roles.forEach((role) => logger.debug(`Role: ${JSON.stringify(role)}`));

		logger.debug(`Permissions fetched: ${permissions.length}`);
		permissions.forEach((permission) => logger.debug(`Permission: ${JSON.stringify(permission)}`));

		// Prepare data to return to the client
		return {
			user: {
				_id: user._id.toString(),
				email: user.email,
				role: user.role
			},
			roles,
			permissions
		};
	} catch (err) {
		logger.error('Error in access management load function:', err);

		// Handle redirects separately
		if (err instanceof redirect) {
			throw err;
		} else if (err instanceof Error) {
			throw error(500, `Internal Server Error: ${err.message}`);
		} else {
			throw error(500, 'An unexpected error occurred');
		}
	}
};
