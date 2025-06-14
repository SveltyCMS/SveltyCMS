/**
 * @file src/routes/api/user/updateUserAttributes/+server.ts
 * @description API endpoint for editing user attributes.
 *
 * This module provides functionality to:
 * - Update attributes of a specific user
 *
 * Features:
 * - User attribute updates using the agnostic auth interface
 * - Input validation using Valibot
 * - Error handling and logging
 *
 * Usage:
 * PUT /api/user/updateUserAttributes
 * Body: JSON object with 'user_id' and 'newUserData' properties
 *
 * Note: This endpoint is secured by hooks.server.ts with appropriate authentication and authorization.
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import { getCacheStore } from '@src/cacheStore/index.server';

// System Logger
import { logger } from '@utils/logger.svelte';

// Input validation
import { object, string, email, optional, minLength, maxLength, pipe, parse, type ValiError } from 'valibot';

const userDataSchema = object(
	{
		email: optional(pipe(string(), email())),
		username: optional(
			pipe(string(), minLength(2, 'Username must be at least 2 characters'), maxLength(50, 'Username must not exceed 50 characters'))
		),
		role: optional(string()),
		password: optional(pipe(string(), minLength(8, 'Password must be at least 8 characters')))
	},
	{ strict: true }
);

const updateUserAttributesSchema = object({
	user_id: string(),
	userData: userDataSchema
});

export const PUT: RequestHandler = async ({ request, locals, cookies }) => {
	try {
		const body = await request.json();
		const { user_id, newUserData } = body;

		// Ensure the authentication system is initialized
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		// Filter out empty password fields to avoid validation issues
		const filteredUserData = { ...newUserData };
		if (filteredUserData.password === '') {
			delete filteredUserData.password;
		}
		if (filteredUserData.confirmPassword === '') {
			delete filteredUserData.confirmPassword;
		}

		// Validate input
		const validatedData = parse(
			updateUserAttributesSchema,
			{
				user_id,
				userData: filteredUserData
			},
			{}
		);

		// Update the user attributes using the agnostic auth interface
		const updatedUser = await auth.updateUserAttributes(validatedData.user_id, validatedData.userData);

		// If the current user is updating their own data, update the session
		if (locals.user && locals.user._id.toString() === validatedData.user_id) {
			// Update the session data with the new user information
			const updatedSessionUser = { ...locals.user, ...validatedData.userData };
			locals.user = updatedSessionUser;

			// Also update the session cache if available
			const sessionId = cookies.get(SESSION_COOKIE_NAME);
			if (sessionId) {
				try {
					const cacheStore = getCacheStore();
					const sessionData = { user: updatedSessionUser, timestamp: Date.now() };
					await cacheStore.set(sessionId, sessionData, new Date(Date.now() + 24 * 60 * 60 * 1000)); // 24 hours
					logger.debug(`Session cache updated for user ${validatedData.user_id}`);
				} catch (error) {
					logger.warn(`Failed to update session cache: ${error}`);
				}
			}
		}

		logger.info('User attributes updated successfully', {
			user_id: validatedData.user_id,
			updatedFields: Object.keys(validatedData.userData)
		});

		return json({
			success: true,
			message: 'User updated successfully',
			user: updatedUser
		});
	} catch (err) {
		if ((err as ValiError<typeof updateUserAttributesSchema>).issues) {
			const valiError = err as ValiError<typeof updateUserAttributesSchema>;
			logger.warn('Invalid input for updateUserAttributes API:', valiError.issues);
			throw error(400, 'Invalid input: ' + JSON.stringify(valiError.issues.map((issue) => issue.message).join(', '), null, 2));
		}
		console.error('Error in updateUserAttributes API:', err);
		logger.error('Error in updateUserAttributes API:', err);
		throw error(500, 'Failed to update user attributes');
	}
};
