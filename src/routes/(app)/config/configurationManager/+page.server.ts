/**
 * @file src/routes/(app)/config/configurationManager/+page.server.ts
 * @description Server-side logic for the Configuration Manager page.
 *
 * This handler ensures that only authenticated users with administrative
 * privileges can access the configuration synchronization UI.
 *
 * Features:
 * - Redirects unauthenticated users to the login page.
 * - Verifies that the user has an 'admin' role.
 * - Returns a safe user object to the page for display.
 * - Leverages the central authentication logic from `hooks.server.ts`.
 */

import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { logger } from '@utils/logger.server';

export const load: PageServerLoad = async ({ locals }) => {
	// 1. Get user from `locals`, populated by `hooks.server.ts`
	const { user, isAdmin } = locals;

	// 2. Authentication Check: Ensure a user is logged in.
	if (!user) {
		logger.warn('Unauthenticated access attempt to Configuration Manager');
		throw redirect(302, '/login');
	}

	// 3. Authorization Check: Ensure the user is an administrator.
	//    Configuration synchronization is a high-privilege operation.
	if (!isAdmin) {
		logger.warn(`Permission denied for user=${user._id} to access Configuration Manager.`);
		throw error(403, 'Forbidden: You do not have permission to access this page.');
	}

	// 4. Return safe data to the UI.
	//    Only return non-sensitive information needed for display.
	return {
		user: {
			username: user.username
		}
	};
};
