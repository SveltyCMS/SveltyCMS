import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { auth } from '@src/databases/db'; // Import the auth instance

// Import logger
import logger from '@src/utils/logger';

export const PUT: RequestHandler = async (event) => {
	try {
		const { request } = event;
		const { tokenId, newTokenData } = await request.json();

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		await auth.updateToken(tokenId, newTokenData);
		logger.info(`Token edited successfully with token ID: ${tokenId}`);
		return new Response(JSON.stringify({ success: true }), { status: 200 });
	} catch (error) {
		const err = error as Error;
		logger.error(`Failed to edit token: ${err.message}`);
		return new Response(JSON.stringify({ message: 'Failed to edit token' }), { status: 500 });
	}
};
