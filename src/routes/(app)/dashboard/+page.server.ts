/**
 * @file src/routes/(app)/dashboard/+page.server.ts
 * @description Server-side logic for the dashboard page.
 */

import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// System Logger
import { logger } from '@utils/logger.svelte';

export const load: PageServerLoad = async ({ locals }) => {
	// Check if user is authenticated
	const user = locals.user;

	if (!user) {
		logger.warn('User not authenticated, redirecting to login.');
		throw error(401, 'Unauthorized');
	}

	logger.debug(`User authenticated successfully: ${user._id}`);

	const { _id, ...rest } = user;

	// Return user data with proper typing
	return {
		user: {
			id: _id.toString(),
			...rest
		}
	};
};
