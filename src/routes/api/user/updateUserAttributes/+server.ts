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
 * - **Multi-Tenant Safe**: Verifies that admins can only edit users within their own tenant.
 * - Secure input validation with Valibot.
 * - Robust error handling and session cache invalidation.
 *
 * Usage:
 * PUT /api/user/updateUserAttributes
 * Body: JSON object with 'user_id' and 'newUserData' properties.
 */

import { privateEnv } from '@root/config/private';

import { error, json, type HttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth and permission helpers
import { SESSION_COOKIE_NAME } from '@src/auth/constants';
import { getCacheStore } from '@src/cacheStore/index.server';
import { auth } from '@src/databases/db';

// System Logger
import { logger } from '@utils/logger.svelte';

// Input validation
import { email, maxLength, minLength, object, optional, parse, pipe, string, type BaseSchema, type ValiError } from 'valibot';

// Define the base schema for user data. The 'role' is handled separately for security.
const baseUserDataSchema = object({
	email: optional(pipe(string(), email())),
	username: optional(pipe(string(), minLength(2, 'Username must be at least 2 characters'), maxLength(50, 'Username must not exceed 50 characters'))),
	password: optional(pipe(string(), minLength(8, 'Password must be at least 8 characters')))
});

export const PUT: RequestHandler = async ({ request, locals, cookies }) => {
	try {
		const { user, tenantId } = locals; // Destructure user and tenantId

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error: Auth system not initialized');
		}

		// Check if user is authenticated
		if (!user) {
			logger.warn('Unauthenticated request to updateUserAttributes');
			throw error(401, 'Unauthorized: Please log in to continue');
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
		const isEditingSelf = user._id === userIdToUpdate;

		// Permission checking is handled by hooks.server.ts
		// Users can always edit their own profiles, admins can edit others (handled by hooks)

		// --- MULTI-TENANCY SECURITY CHECK ---
		// If an admin is editing another user, ensure the target user is in the same tenant.
		if (privateEnv.MULTI_TENANT && !isEditingSelf) {
			if (!tenantId) {
				throw error(500, 'Tenant could not be identified for this operation.');
			}
			const userToUpdate = await auth.getUserById(userIdToUpdate);
			if (!userToUpdate || userToUpdate.tenantId !== tenantId) {
				logger.warn('Admin attempted to edit a user outside their tenant.', {
					adminId: user?._id,
					adminTenantId: tenantId,
					targetUserId: userIdToUpdate,
					targetTenantId: userToUpdate?.tenantId
				});
				throw error(403, 'Forbidden: You can only edit users within your own tenant.');
			}
		}

		// **SECURITY FEATURE**: Prevent users from changing their own role
		let schemaToUse: BaseSchema = baseUserDataSchema;
		if (newUserData.role) {
			if (isEditingSelf) {
				// If a user tries to submit a 'role' change for themselves, throw an error.
				logger.warn('User attempted to change their own role.', { userId: user._id, attemptedRole: newUserData.role });
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

		if (!updatedUser) {
			logger.error('updateUserAttributes returned null/undefined', {
				userIdToUpdate,
				validatedData
			});
			throw error(500, 'Failed to update user attributes');
		}

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

		// Invalidate admin cache since user data has changed
		const { invalidateAdminCache } = await import('@src/hooks.server');
		invalidateAdminCache('users', tenantId);

		logger.info('User attributes updated successfully', {
			user_id: userIdToUpdate,
			updatedBy: user?._id,
			tenantId: tenantId,
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
