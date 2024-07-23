import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';

// Auth
import { auth } from '@api/databases/db';

// Import logger
import { logger } from '@src/utils/logger';

export const PUT: RequestHandler = async (event) => {
	try {
		const { request } = event;
		const { user_ids } = await request.json();

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		for (const user_id of user_ids) {
			await auth.updateUserAttributes(user_id, { blocked: false });
			logger.info(`User unblocked successfully with user ID: ${user_id}`);
		}

		return new Response(JSON.stringify({ success: true }), { status: 200 });
	} catch (error) {
		const err = error as Error;
		logger.error(`Failed to unblock users: ${err.message}`);
		return new Response(JSON.stringify({ message: 'Failed to unblock users' }), { status: 500 });
	}
};
