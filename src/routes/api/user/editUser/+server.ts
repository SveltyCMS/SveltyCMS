import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';

// Import the auth instance
import { auth } from '@api/databases/db';

// Import logger
import logger from '@src/utils/logger';

export const PUT: RequestHandler = async (event) => {
	try {
		const { request } = event;
		const { user_id, newUserData } = await request.json();

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		await auth.updateUserAttributes(user_id, newUserData);
		logger.info(`User edited successfully with user ID: ${user_id}`);
		return new Response(JSON.stringify({ success: true }), { status: 200 });
	} catch (error) {
		const err = error as Error;
		logger.error(`Failed to edit user: ${err.message}`);
		return new Response(JSON.stringify({ message: 'Failed to edit user' }), { status: 500 });
	}
};
