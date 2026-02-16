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

import { getPrivateSettingSync } from '@src/services/settingsService';

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth and permission helpers
import { SESSION_COOKIE_NAME } from '@src/databases/auth/constants';
import { cacheService } from '@src/databases/CacheService';
import { auth } from '@src/databases/db';
import { verifyPassword } from '@src/databases/auth';

// System Logger
import { logger } from '@utils/logger.server';

// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';

// Input validation
import { boolean, email, maxLength, minLength, object, optional, parse, pipe, string } from 'valibot';

// Define the base schema for user data. The 'role' is handled separately for security.
const baseUserDataSchema = object({
	email: optional(pipe(string(), email())),
	username: optional(pipe(string(), minLength(2, 'Username must be at least 2 characters'), maxLength(50, 'Username must not exceed 50 characters'))),
	password: optional(pipe(string(), minLength(8, 'Password must be at least 8 characters'))),
	currentPassword: optional(string()),
	preferences: optional(
		object({
			rtc: optional(
				object({
					enabled: optional(boolean()),
					sound: optional(boolean())
				})
			)
		})
	)
});

export const PUT: RequestHandler = apiHandler(async ({ request, locals, cookies }) => {
	const { user, tenantId } = locals; // Destructure user and tenantId

	if (!auth) {
		logger.error('Authentication system is not initialized');
		throw new AppError('Internal Server Error: Auth system not initialized', 500, 'AUTH_SYS_ERROR');
	}

	// Check if user is authenticated
	if (!user) {
		logger.warn('Unauthenticated request to updateUserAttributes');
		throw new AppError('Unauthorized: Please log in to continue', 401, 'UNAUTHORIZED');
	}

	const body = await request.json();
	let { user_id: userIdToUpdate } = body;
	const { newUserData } = body;

	// Support 'self' keyword for the current authenticated user
	if (userIdToUpdate === 'self' && user) {
		userIdToUpdate = user._id;
	}

	// Validate the top-level request structure
	if (!userIdToUpdate || typeof userIdToUpdate !== 'string' || userIdToUpdate.trim() === '') {
		throw new AppError('A valid user_id must be provided.', 400, 'INVALID_INPUT');
	}

	if (!newUserData || typeof newUserData !== 'object') {
		throw new AppError('Valid newUserData must be provided.', 400, 'INVALID_INPUT');
	}

	// **TWO-LEVEL PERMISSION SYSTEM**: Check if user is editing their own profile or has admin permissions
	const isEditingSelf = user._id === userIdToUpdate;

	// Permission checking is handled by hooks.server.ts
	// Users can always edit their own profiles, admins can edit others (handled by hooks)

	// --- MULTI-TENANCY SECURITY CHECK ---
	// If an admin is editing another user, ensure the target user is in the same tenant.
	if (getPrivateSettingSync('MULTI_TENANT') && !isEditingSelf) {
		if (!tenantId) {
			throw new AppError('Tenant could not be identified for this operation.', 500, 'TENANT_ERROR');
		}
		const userToUpdate = await auth.getUserById(userIdToUpdate);
		if (!userToUpdate || userToUpdate.tenantId !== tenantId) {
			logger.warn('Admin attempted to edit a user outside their tenant.', {
				adminId: user?._id,
				adminTenantId: tenantId,
				targetUserId: userIdToUpdate,
				targetTenantId: userToUpdate?.tenantId
			});
			throw new AppError('Forbidden: You can only edit users within your own tenant.', 403, 'FORBIDDEN_TENANT');
		}
	}

	// **SECURITY FEATURE**: Prevent users from changing their own role
	let schemaToUse = baseUserDataSchema;
	if (newUserData.role) {
		if (isEditingSelf) {
			// If a user tries to submit a 'role' change for themselves, throw an error.
			logger.warn('User attempted to change their own role.', { userId: user._id, attemptedRole: newUserData.role });
			throw new AppError('Forbidden: You cannot change your own role.', 403, 'FORBIDDEN_ROLE_CHANGE');
		} else {
			// If an admin is editing another user, allow the role change.
			// We add the 'role' field to the validation schema dynamically.
			schemaToUse = object({ ...baseUserDataSchema.entries, role: optional(string()) });
		}
	}

	// **SECURITY FEATURE**: Require current password when changing password (Self-Edit only)
	if (isEditingSelf && newUserData.password) {
		if (!newUserData.currentPassword) {
			throw new AppError('Current password is required to set a new password.', 400, 'MISSING_PASSWORD');
		}
		// Verify current password
		const currentUserFull = await auth.getUserById(user._id);
		if (!currentUserFull || !currentUserFull.password) {
			throw new AppError('User record invalid.', 500, 'USER_INVALID');
		}
		const isMatch = await verifyPassword(newUserData.currentPassword, currentUserFull.password);
		if (!isMatch) {
			throw new AppError('Incorrect current password.', 401, 'INVALID_PASSWORD');
		}
		// Remove currentPassword from newUserData so it doesn't get passed to DB update (even though schema filters it, it's safer)
		delete newUserData.currentPassword;
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
		throw new AppError('Failed to update user attributes', 500, 'UPDATE_FAILED');
	}

	// If the current user updated their own data, invalidate their session cache to reflect changes immediately.
	if (isEditingSelf) {
		const sessionId = cookies.get(SESSION_COOKIE_NAME);
		if (sessionId) {
			try {
				// The session will be re-validated on the next request, so we can just delete the old cache entry.
				await cacheService.delete(sessionId);
				logger.debug(`Session cache invalidated for self-updated user ${userIdToUpdate}`);
			} catch (cacheError) {
				logger.warn(`Failed to invalidate session cache during self-update: ${cacheError}`);
			}
		}
	}

	// Note: We no longer cache user data by ID or email - session cache is the only cache
	// This eliminates redundant caching and cache invalidation complexity

	// Invalidate admin users list cache so UI updates immediately
	try {
		await cacheService.clearByPattern(`api:*:/api/user*`, tenantId);
		logger.debug('Admin users list cache cleared after user update');
	} catch (cacheError) {
		logger.warn(`Failed to clear admin users cache: ${cacheError}`);
	}

	// Invalidate roles cache since user data may have changed
	const { invalidateRolesCache } = await import('@src/hooks/handleAuthorization');
	invalidateRolesCache(tenantId);

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
});
