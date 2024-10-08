/**
 * @file src/routes/(app)/dashboard/+page.server.ts
 * @description Server-side logic for the dashboard page.
 */

import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// System Logger
import { logger } from '@utils/logger';

// Auth
import { auth } from '@src/databases/db';

export const load: PageServerLoad = async ({ locals }) => {
	// Check if user is authenticated
	const user = locals.user;

	if (!user) {
		logger.debug('No authenticated user found, creating guest session');
		try {
			if (!auth) {
				logger.error('Authentication system is not initialized');
				throw error(500, 'Internal Server Error');
			}
			const guestSession = await auth.createSession({ user_id: 'guestuser_id' });
			user = await auth.validateSession({ session_id: guestSession.sessionId });
			if (!user) {
				throw error(500, 'Failed to create guest session');
			}
			logger.info(`New guest session created: ${guestSession.sessionId}`);
		} catch (e) {
			logger.error('Failed to create a guest session:', e);
			throw error(500, 'Internal Server Error');
		}
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
