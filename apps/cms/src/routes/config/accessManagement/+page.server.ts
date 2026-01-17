/**
 * @file src/routes/(app)/config/accessManagement/+page.server.ts
 * @description Server-side logic for Access Management page using simplified auth system.
 */

import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Auth - getAllPermissions is lightweight, no heavy queries needed
import { getAllPermissions } from '@shared/database/auth/permissions';

// System Logger - Ensure logger is optimized for performance in production (e.g., disabled debug logs)
import { logger } from '@shared/utils/logger.server';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const { user, roles: tenantRoles, tenantId } = locals;

		// User authentication and permission checks already done by handleAuthorization hook
		if (!user) {
			logger.warn('User not authenticated, redirecting to login');
			throw redirect(302, '/login');
		}

		// Check if user is admin (admins have access to all config pages)
		const userRole = (tenantRoles || []).find((role) => role._id === user.role);
		const isAdmin = userRole?.isAdmin === true;

		if (!isAdmin) {
			// For non-admins, check specific permission
			// You can add more granular permission checks here if needed
			const message = `User ${user._id} does not have permission to access access management`;
			logger.warn(message, { tenantId });
			throw error(403, message);
		}

		// Fetch permissions (lightweight operation)
		logger.debug('Fetching permissions...', { tenantId });
		const permissions = getAllPermissions();

		logger.debug(`Roles available: ${tenantRoles.length}`, { tenantId });
		logger.debug(`Permissions fetched: ${permissions.length}`, { tenantId });

		// Return minimal user data and reuse roles from locals (already cached by handleAuthorization)
		return {
			user: {
				_id: user._id.toString(),
				email: user.email,
				role: user.role
			},
			roles: tenantRoles, // Already cached and loaded by handleAuthorization hook
			permissions
		};
	} catch (err) {
		// Differentiate between intentional redirects/errors and unexpected server errors
		if (err && typeof err === 'object' && 'status' in err) {
			// This is likely a redirect or an error we've already thrown (e.g., 403, 302)
			throw err;
		}
		const message = `Error in load function for Access Management: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { tenantId: locals.tenantId });
		throw error(500, message); // Generic 500 for unhandled server errors
	}
};
