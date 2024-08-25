/**
 * @file src/routes/(app)/config/AccessManagement/+page.server.ts
 * @description Server-side logic for Access Management page authentication and authorization.
 *
 * Handles session validation, user authentication, and role-based access control for the Access Management page.
 * Redirects unauthenticated users to the login page and restricts access based on user permissions.
 *
 * Responsibilities:
 * - Checks for a valid session cookie.
 * - Validates the user's session using the authentication service.
 * - Checks user permissions using RBAC middleware.
 * - Returns user data if authentication and authorization are successful.
 * - Handles session expiration, invalid session cases, and insufficient permissions.
 */
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Auth
import { auth, authAdapter } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import { checkUserPermission, type PermissionConfig } from '@src/auth/permissionCheck';

// System Logs
import logger from '@src/utils/logger';

export const load: PageServerLoad = async ({ cookies }) => {
	logger.debug('Starting load function for access management page');

	if (!auth || !authAdapter) {
		logger.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error: Auth system not initialized');
	}

	logger.debug('Auth adapter methods:', Object.keys(authAdapter));

	// Secure this page with session cookie
	const session_id = cookies.get(SESSION_COOKIE_NAME);

	if (!session_id) {
		logger.warn('No session ID found, redirecting to login');
		throw redirect(302, `/login`);
	}

	try {
		// Validate the session and retrieve the associated user
		const user = await auth.validateSession({ session_id });

		if (!user) {
			logger.warn(`Invalid session for session_id: ${session_id}`);
			throw redirect(302, `/login`);
		}

		logger.debug(`User session validated successfully for user: ${user._id}`);
		logger.debug('User details:', user);

		// Check user permission
		logger.debug('Checking user permission for access management');
		const permissionConfig: PermissionConfig = {
			contextId: 'config/accessManagement',
			requiredRole: 'admin',
			action: 'read',
			contextType: 'system'
		};

		let hasPermission;
		try {
			hasPermission = await checkUserPermission(user, permissionConfig);
			logger.debug(`User permission check result: ${hasPermission}`);
		} catch (permError) {
			logger.error('Error checking user permission:', permError);
			hasPermission = false;
		}

		if (!hasPermission) {
			logger.warn(`User ${user._id} does not have permission to access Access Management`);
			throw error(403, "You don't have permission to access this page");
		}

		// Fetch roles and permissions
		let roles = [];
		let permissions = [];

		logger.debug('Attempting to fetch roles');
		if (typeof authAdapter.getAllRoles === 'function') {
			try {
				roles = await authAdapter.getAllRoles();
				console.log('Raw roles data:', roles);
				console.log(`Fetched ${roles.length} roles`);
				console.table(roles);
			} catch (roleError) {
				logger.error('Error fetching roles:', roleError);
			}
		} else {
			logger.warn('getAllRoles method is not available on authAdapter');
		}

		logger.debug('Attempting to fetch permissions');
		if (typeof authAdapter.getAllPermissions === 'function') {
			try {
				permissions = await authAdapter.getAllPermissions();
				console.log('Raw permissions data:', permissions);
				console.log(`Fetched ${permissions.length} permissions`);
				console.table(permissions);
			} catch (permError) {
				console.error('Error fetching permissions:', permError);
			}
		} else {
			logger.warn('getAllPermissions method is not available on authAdapter');
		}

		logger.debug('Preparing data to return to the client');
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
		if (err instanceof Error) {
			throw error(500, `Internal Server Error: ${err.message}`);
		} else {
			throw error(500, 'An unexpected error occurred');
		}
	}
};
