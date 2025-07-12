/**
 * @file src/routes/(app)/dashboard/+page.server.ts
 * @description Server-side logic for the dashboard page.
 *
 * ### Props
 * - `user`: The authenticated user data.
 *
 * ### Usage
 * - Access user data from the server-side and pass it to the client-side component
 *
 * ### Features
 * - User authentication and authorization
 * - Proper typing for user data
 */

import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// System Logger
import { logger } from '@utils/logger.svelte';

export const load: PageServerLoad = async ({ locals }) => {
	// Check if user is authenticated
	const user = locals.user;

	if (!user) {
		logger.warn('User not authenticated, redirecting to login.');
		redirect(301, '/login');
	}

	logger.debug(`User authenticated successfully: \x1b[34m${user._id}\x1b[0m`);

	const { _id, ...rest } = user;

	// Return user data with proper typing
	return {
		user: {
			id: _id.toString(),
			...rest
		}
	};
};
