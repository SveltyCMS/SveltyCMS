/**
 * @file src/routes/api/user/editToken/+server.ts
 * @description API endpoint for editing a user token.
 *
 * This module provides functionality to:
 * - Update the data associated with a specific token
 *
 * Features:
 * - Token data modification
 * - Error handling and logging
 *
 * Usage:
 * PUT /api/user/editToken
 * Body: JSON object with 'tokenId' and 'newTokenData' properties
 *
 * Note: Ensure proper validation of newTokenData before applying changes.
 * This endpoint should be secured with appropriate authentication and authorization.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';

// Auth
import { auth } from '@src/databases/db';

// System Logger
import { logger } from '@utils/logger';

export const PUT: RequestHandler = async ({ request }) => {
	try {
		const { tokenId, newTokenData } = await request.json();

		if (!tokenId || !newTokenData) {
			logger.warn('Edit token attempt with missing data');
			return new Response(JSON.stringify({ message: 'Token ID and new token data are required' }), { status: 400 });
		}

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		await auth.updateToken(tokenId, newTokenData);
		logger.info(`Token edited successfully with token ID: ${tokenId}`);
		return new Response(JSON.stringify({ success: true, message: 'Token updated successfully' }), { status: 200 });
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
		logger.error(`Failed to edit token: ${errorMessage}`);
		return new Response(JSON.stringify({ success: false, message: 'Failed to edit token' }), { status: 500 });
	}
};
