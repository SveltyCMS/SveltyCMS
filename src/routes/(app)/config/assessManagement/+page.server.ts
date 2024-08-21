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
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import { checkUserPermission, type PermissionConfig } from '@src/auth/permissionCheck';

// System Logs
import logger from '@src/utils/logger';
export const load: PageServerLoad = async ({ cookies }) => {
	if (!auth) {
		logger.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}

	// Secure this page with session cookie

	let session_id = cookies.get(SESSION_COOKIE_NAME);

	// If no session ID is found, create a new session
	if (!session_id) {
		// console.log('Session ID is missing from cookies, creating a new session.');
		try {
			const newSession = await auth.createSession({ user_id: 'guestuser_id' });
			const sessionCookie = auth.createSessionCookie(newSession);
			cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
			session_id = sessionCookie.value;
			// console.log('New session created:', session_id);
		} catch (e) {
			console.error('Failed to create a new session:', e);
			throw error(500, 'Internal Server Error');
		}
	}

	if (!auth) {
		console.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}

	// Validate the session and retrieve the associated user
	const user = await auth.validateSession({ session_id });

	// If validation fails, redirect the user to the login page
	if (!user) {
		logger.warn(`Invalid session for session_id: ${session_id}`);
		throw redirect(302, '/login');
	}

	logger.debug(`User session validated successfully for user: ${user._id}`);

	const permissionConfig: PermissionConfig = {
		contextId: 'config/accessManagement',
		requiredRole: 'admin',
		action: 'read',
		contextType: 'system'
	};

	const hasPermission = await checkUserPermission(user, permissionConfig);

	if (!hasPermission) {
		logger.warn(`User ${user._id} does not have permission to access Access Management`);
		throw error(403, "You don't have permission to access this page");
	}

	// Fetch roles and permissions data
	const roles = await auth.getAllRoles();
	const permissions = await auth.getAllPermissions();

	// Return user data along with roles and permissions
	return {
		user: {
			_id: user._id.toString(),
			...user
		},
		roles,
		permissions
	};
};
