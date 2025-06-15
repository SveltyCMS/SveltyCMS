/**
 * @file src/routes/api/user/updateUserAttributes/+server.ts
 * @description API endpoint for editing user attributes.
 *
 * This is a highly sensitive endpoint that handles all user profile updates.
 *
 * Features:
 * - **Defense in Depth**: Granular, two-level permission checking. It distinguishes
 * between a user editing their own profile vs. an admin editing another user's.
 * - **Privilege Escalation Prevention**: The validation schema dynamically prevents
 * users from changing their own role. Only an admin can change another user's role.
 * - Secure input validation with Valibot.
 * - Robust error handling and session cache invalidation.
 *
 * Usage:
 * PUT /api/user/updateUserAttributes
 * Body: JSON object with 'user_id' and 'newUserData' properties.
 */

import { error, json, type HttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth and permission helpers
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import { getCacheStore } from '@src/cacheStore/index.server';
import { hasPermissionByAction } from '@src/auth/permissions';
import { roles } from '@root/config/roles'; // Import static roles for fallback

// System Logger
import { logger } from '@utils/logger.svelte';

// Input validation
import { object, string, email, optional, minLength, maxLength, pipe, parse, type BaseSchema, type ValiError } from 'valibot';

// Define the base schema for user data. The 'role' is handled separately for security.
const baseUserDataSchema = object({
	email: optional(pipe(string(), email())),
	username: optional(
		pipe(string(), minLength(2, 'Username must be at least 2 characters'), maxLength(50, 'Username must not exceed 50 characters'))
	),
	password: optional(pipe(string(), minLength(8, 'Password must be at least 8 characters')))
});

export const PUT: RequestHandler = async ({ request, locals, cookies }) => {
	try {
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error: Auth system not initialized');
		}

		const body = await request.json();
		const { user_id: userIdToUpdate, newUserData } = body;

		// Validate the top-level request structure
		if (!userIdToUpdate || typeof userIdToUpdate !== 'string' || userIdToUpdate.trim() === '') {
			throw error(400, 'A valid user_id must be provided.');
		}

		if (!newUserData || typeof newUserData !== 'object') {
			throw error(400, 'Valid newUserData must be provided.');
		}

		// **TWO-LEVEL PERMISSION SYSTEM**: Check if user is editing their own profile or has admin permissions
		const isEditingSelf = locals.user._id === userIdToUpdate;
		let hasPermission = false;

		if (isEditingSelf) {
			// A user always has permission to update their own profile.
			hasPermission = true;
		} else {
			// To edit another user, the requesting user needs a high-level permission.
			hasPermission = hasPermissionByAction(
				locals.user,
				'update',
				'user',
				'any',
				locals.roles && locals.roles.length > 0 ? locals.roles : roles
			);
		}

		if (!hasPermission) {
			logger.warn('Unauthorized attempt to update user attributes.', {
				requestedBy: locals.user?._id,
				targetUserId: userIdToUpdate
			});
			throw error(403, 'Forbidden: You do not have permission to update this user.');
		}

		// **SECURITY FEATURE**: Prevent users from changing their own role
		let schemaToUse: BaseSchema = baseUserDataSchema;
		if (newUserData.role) {
			if (isEditingSelf) {
				// If a user tries to submit a 'role' change for themselves, throw an error.
				logger.warn('User attempted to change their own role.', { userId: locals.user._id, attemptedRole: newUserData.role });
				throw error(403, 'Forbidden: You cannot change your own role.');
			} else {
				// If an admin is editing another user, allow the role change.
				// We add the 'role' field to the validation schema dynamically.
				schemaToUse = object({ ...baseUserDataSchema.entries, role: optional(string()) });
			}
		}

		// Validate the input against the appropriate schema (with or without 'role').
		const validatedData = parse(schemaToUse, newUserData);

		// Update user attributes in the database.
		const updatedUser = await auth.updateUserAttributes(userIdToUpdate, validatedData);

		// If the current user updated their own data, invalidate their session cache to reflect changes immediately.
		if (isEditingSelf) {
			const sessionId = cookies.get(SESSION_COOKIE_NAME);
			if (sessionId) {
				try {
					const cacheStore = getCacheStore();
					// The session will be re-validated on the next request, so we can just delete the old cache entry.
					await cacheStore.delete(sessionId);
					logger.debug(`Session cache invalidated for self-updated user ${userIdToUpdate}`);
				} catch (cacheError) {
					logger.warn(`Failed to invalidate session cache during self-update: ${cacheError}`);
				}
			}
		}

		logger.info('User attributes updated successfully', {
			user_id: userIdToUpdate,
			updatedBy: locals.user?._id,
			updatedFields: Object.keys(validatedData)
		});

		return json({
			success: true,
			message: 'User updated successfully.',
			user: updatedUser
		});
	} catch (err) {
		// Handle specific validation errors from Valibot.
		if (err.name === 'ValiError') {
			const valiError = err as ValiError;
			const issues = valiError.issues.map((issue) => issue.message).join(', ');
			logger.warn('Invalid input for updateUserAttributes API:', { issues });
			throw error(400, `Invalid input: ${issues}`);
		}

		// Handle all other errors, including HTTP errors from `throw error()`.
		const httpError = err as HttpError;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred while updating user attributes.';

		logger.error('Error in updateUserAttributes API:', {
			error: message,
			stack: err instanceof Error ? err.stack : undefined,
			userId: locals.user?._id,
			status
		});

		return json(
			{
				success: false,
				message: status === 500 ? 'Internal Server Error' : message
			},
			{ status }
		);
	}
};
