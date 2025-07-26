/**
 * @file src/routes/api/token/+server.ts
 * @description API endpoint for creating new invitation/registration tokens.
 *
 * This module is responsible for:
 * - Creating a new token with a specified role and expiration.
 * - Associating the token with a user ID and email within the current tenant.
 * - Requires 'system:write' permission.
 *
 * @usage
 * POST /api/token
 * @body {
 * "email": "test@example.com",
 * "user_id": "user123",
 * "role": "editor",
 * "expiresIn": 168,
 * "expiresInLabel": "7d"
 * }
 */
import { privateEnv } from '@root/config/private';

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth (Database Agnostic)
import { auth } from '@src/databases/db';

// Cache invalidation
import { invalidateAdminCache } from '@src/hooks.server';

// Validation
import { object, string, number, parse, minLength } from 'valibot';

// System logger
import { logger } from '@utils/logger.svelte';

const createTokenSchema = object({
	email: string([minLength(1, 'Email is required.')]),
	user_id: string([minLength(1, 'User ID is required.')]),
	role: string(),
	expiresIn: number(),
	expiresInLabel: string()
});

export const POST: RequestHandler = async (event) => {
	const { request, locals } = event;
	const { tenantId } = locals; // User and permissions are guaranteed by hooks

	try {
		// No permission checks needed - hooks already verified:
		// 1. User is authenticated
		// 2. User has correct role for 'api:token' endpoint
		// 3. User belongs to correct tenant (if multi-tenant)

		const body = await request.json();

		let tokenData;
		try {
			tokenData = parse(createTokenSchema, body);
		} catch (err) {
			if (err.name === 'ValiError') {
				const validationErrors = err.issues?.map((issue) => `${issue.path?.join('.')}: ${issue.message}`) || ['Invalid data'];
				logger.warn(`Token creation validation failed`, {
					userId: user?._id,
					validationErrors,
					providedFields: Object.keys(body || {})
				});
				throw error(400, 'Validation Error: ' + validationErrors.join(', '));
			}
			throw err;
		}

		if (!auth) {
			logger.error('Database authentication adapter not initialized');
			throw error(500, 'Database authentication not available');
		}

		// --- MULTI-TENANCY SECURITY CHECK ---
		if (privateEnv.MULTI_TENANT) {
			if (!tenantId) {
				throw error(500, 'Tenant could not be identified for this operation.');
			}
			// Verify the target user belongs to the same tenant as the admin creating the token.
			const targetUser = await auth.getUserById(tokenData.user_id);
			if (!targetUser || targetUser.tenantId !== tenantId) {
				logger.warn('Attempt to create a token for a user in another tenant.', {
					adminId: user?._id,
					adminTenantId: tenantId,
					targetUserId: tokenData.user_id,
					targetTenantId: targetUser?.tenantId
				});
				throw error(403, 'Forbidden: You can only create tokens for users within your own tenant.');
			}
		}

		const expiresAt = new Date(Date.now() + tokenData.expiresIn * 60 * 60 * 1000);

		logger.debug(`Creating token for user`, {
			targetUserId: tokenData.user_id,
			targetEmail: tokenData.email,
			role: tokenData.role,
			expiresIn: tokenData.expiresIn,
			createdBy: user?._id,
			tenantId
		});

		const token = await auth.createToken({
			user_id: tokenData.user_id,
			...(privateEnv.MULTI_TENANT && { tenantId }), // Conditionally add tenantId
			email: tokenData.email.toLowerCase(), // Normalize email to lowercase
			expires: expiresAt,
			type: 'registration' // Or another appropriate type
		});
		// Invalidate the tokens cache so the new token appears immediately in admin area
		invalidateAdminCache('tokens', tenantId);

		const responseData = {
			success: true,
			token: { value: token, expires: expiresAt.toISOString() }
		};

		logger.info(`Token created successfully`, {
			tokenId: token,
			targetUserId: tokenData.user_id,
			targetEmail: tokenData.email,
			role: tokenData.role,
			expiresAt: expiresAt.toISOString(),
			createdBy: user?._id,
			tenantId
		});

		return json(responseData, { status: 201 });
	} catch (err) {
		if (err.status) {
			// Re-throw SvelteKit errors (they're already logged)
			throw err;
		}

		logger.error(`Unexpected error in token creation endpoint`, {
			userId: locals.user?._id,
			error: err.message,
			stack: err.stack
		});
		throw error(500, 'Failed to create token: ' + err.message);
	}
};
