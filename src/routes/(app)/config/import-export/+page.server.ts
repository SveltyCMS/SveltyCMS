/**
 * @file src/routes/(app)/config/import-export/+page.server.ts
 * @description Server-side logic for Import/Export configuration page.
 *
 * #Features:
 * - Redirects unauthenticated users to login.
 * - Verifies user permissions (`config:importexport`) against role config.
 * - Returns safe, whitelisted user data (no sensitive fields).
 * - Uses structured logging for access attempts and errors.
 * - Differentiates between 403 (forbidden) and 500 (system failure).
 */

import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

import { roles } from '@root/config/roles';
import { hasPermissionWithRoles } from '@src/databases/auth/permissions';
import { logger } from '@utils/logger.server';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const { user } = locals;

		// Auth check
		if (!user) {
			logger.warn('Unauthenticated access attempt to import/export');
			throw redirect(302, '/login');
		}

		// Role lookup
		const userRole = roles.find((r) => r._id === user.role);

		// Permission check
		const hasPermission = hasPermissionWithRoles(user, 'config:importexport', roles);
		if (!hasPermission) {
			logger.warn(`Permission denied: user=${user._id}, role=${user.role}, missing=config:importexport`);
			throw error(403, 'Insufficient permissions');
		}

		// Return safe user object
		return {
			user: {
				id: user._id.toString(),
				username: user.username,
				email: user.email,
				role: user.role,
				isAdmin: !!userRole?.isAdmin
			}
		};
	} catch (err) {
		// Pass through known errors (redirect/403/etc.)
		if (err instanceof Response || (err instanceof Error && 'status' in err)) {
			throw err;
		}

		logger.error(`System failure in import/export: ${err instanceof Error ? err.stack : String(err)}`);
		throw error(500, 'Internal Server Error');
	}
};
