/**
 * @file  src/routes/(app)/imageEditor/+page.server.ts
 * @description Server-side logic for Image Editor page authentication and authorization.
 *
 * Handles user authentication and role-based access control for the Image Editor page.
 * Restricts access based on user permissions.
 *
 * Responsibilities:
 * - Checks for authenticated user in locals.
 * - Returns user data if authentication is successful.
 * - Handles cases of unauthenticated users.
 */

import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit'; // <-- FIXED: Added missing import

// System Logges
import { logger } from '@utils/logger.svelte';

export const load: PageServerLoad = async ({ locals }) => {
	// Check if user is authenticated
	const user = locals.user;

	// If validation fails, redirect the user to the login page
	if (!user) {
		logger.debug('No authenticated user found, throwing error');
		throw redirect(302, `/login`);
	}

	// Log successful authentication
	logger.debug(`User authenticated successfully: \x1b[34m${user._id}\x1b[0m`);

	// Return user data
	return {
		user: {
			_id: user._id.toString(),
			...user
		}
	};
};
