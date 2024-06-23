import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { auth } from '@api/databases/db'; // Import the auth instance
import logger from '@src/utils/logger'; // Import logger

export const PUT: RequestHandler = async (event) => {
	try {
		const { request } = event;
		const { userId, newUserData } = await request.json();

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		await auth.updateUserAttributes(userId, newUserData);
		logger.info(`User edited successfully with user ID: ${userId}`);
		return new Response(JSON.stringify({ success: true }), { status: 200 });
	} catch (error) {
		const err = error as Error;
		logger.error(`Failed to edit user: ${err.message}`);
		return new Response(JSON.stringify({ message: 'Failed to edit user' }), { status: 500 });
	}
};
