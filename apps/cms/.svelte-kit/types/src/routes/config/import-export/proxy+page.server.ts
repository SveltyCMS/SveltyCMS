// @ts-nocheck
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
import { hasPermissionWithRoles } from '@shared/database/auth/permissions';

import { logger } from '@shared/utils/logger.server';

export const load = async ({ locals }: Parameters<PageServerLoad>[0]) => {
	try {
		const { user, isAdmin, roles: tenantRoles } = locals;

		// Auth check
		if (!user) {
			logger.warn('Unauthenticated access attempt to import/export');
			throw redirect(302, '/login');
		}

		// Permission check using cached tenantRoles from locals
		const hasPermission = hasPermissionWithRoles(user, 'config:importexport', tenantRoles);

		if (!hasPermission && !isAdmin) {
			logger.warn(`Permission denied: user=${user._id}, role=${user.role}, missing=config:importexport`);
			throw error(403, 'Insufficient permissions');
		}

		// Return safe user object
		return {
			user: {
				id: user._id.toString(),
				username: user.username || user.email,
				email: user.email,
				role: user.role,
				isAdmin
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
