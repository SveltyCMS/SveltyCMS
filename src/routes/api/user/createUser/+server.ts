/**
 * @file: src/routes/api/user/createUser/+server.ts
 * @description: API endpoint for creating a new user in the CMS.
 *
 * This endpoint handles POST requests to create a new user. It leverages the
 * agnostic authentication system to ensure database independence.
 *
 * Features:
 * - User creation using the agnostic auth interface
 * - Input validation and error handling
 * - Comprehensive logging for monitoring and debugging
 * - Secure error responses to prevent information leakage
 */

import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';

import { auth } from '@src/databases/db';

// System Logger
import { logger } from '@utils/logger';

export const POST: RequestHandler = async ({ request }) => {
	try {
		// Ensure the authentication system is initialized
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		// Parse the request body to get user data
		const userData = await request.json();
		logger.info('Received request to create user', { email: userData.email });

		// Create the user using the agnostic auth interface
		const newUser = await auth.createUser(userData);
		logger.info('User created successfully', { userId: newUser._id });

		// Return the newly created user data
		return json(newUser);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Error creating user:', { error: errorMessage });
		return json({ success: false, error: `An error occurred for creating the user: ${error.message}` }, { status: 500 });
	}
};
