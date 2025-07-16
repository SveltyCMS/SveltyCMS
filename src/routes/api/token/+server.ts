/**
 * @file src/routes/api/token/+server.ts
 * @description API endpoint for creating new invitation/registration tokens.
 *
 * This module is responsible for:
 * - Creating a new token with a specified role and expiration.
 * - Associating the token with a user ID and email.
 * - Requires 'create:token' permission.
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
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth
import { TokenAdapter } from '@src/auth/mongoDBAuth/tokenAdapter';
import { hasPermissionByAction } from '@src/auth/permissions';
import { roles } from '@root/config/roles';

// Cache invalidation
import { invalidateAdminCache } from '@src/hooks.server';

// Validation
import { object, string, number, parse, minLength } from 'valibot';

// System logger
import { logger } from '@utils/logger.svelte';
import { logApiStart, logApiSuccess, logApiError, logApiAuthFailure, logApiValidationError } from '@utils/apiLogger';

const createTokenSchema = object({
	email: string([minLength(1, 'Email is required.')]),
	user_id: string([minLength(1, 'User ID is required.')]),
	role: string(),
	expiresIn: number(),
	expiresInLabel: string()
});

export const POST: RequestHandler = async (event) => {
	const { context, startTime } = logApiStart(event);
	const { request, locals } = event;

	try {
		const hasPermission = hasPermissionByAction(
			locals.user,
			'create',
			'token',
			'any',
			locals.roles && locals.roles.length > 0 ? locals.roles : roles
		);

		if (!hasPermission) {
			logApiAuthFailure(context, startTime, 'forbidden', 'Insufficient permissions to create tokens');
			logger.warn(`Unauthorized token creation attempt`, {
				userId: locals.user?._id,
				userEmail: locals.user?.email,
				requiredPermission: 'create:token'
			});
			throw error(403, 'Forbidden: You do not have permission to create tokens.');
		}

		const body = await request.json();

		let tokenData;
		try {
			tokenData = parse(createTokenSchema, body);
		} catch (err) {
			if (err.name === 'ValiError') {
				const validationErrors = err.issues?.map((issue) => `${issue.path?.join('.')}: ${issue.message}`) || ['Invalid data'];
				logApiValidationError(context, startTime, validationErrors, body);
				logger.warn(`Token creation validation failed`, {
					userId: locals.user?._id,
					validationErrors,
					providedFields: Object.keys(body || {})
				});
				throw error(400, 'Validation Error: ' + validationErrors.join(', '));
			}
			throw err;
		}

		const tokenAdapter = new TokenAdapter();
		const expiresAt = new Date(Date.now() + tokenData.expiresIn * 60 * 60 * 1000);

		logger.debug(`Creating token for user`, {
			targetUserId: tokenData.user_id,
			targetEmail: tokenData.email,
			role: tokenData.role,
			expiresIn: tokenData.expiresIn,
			createdBy: locals.user?._id
		});

		const token = await tokenAdapter.createToken({
			user_id: tokenData.user_id,
			email: tokenData.email.toLowerCase(), // Normalize email to lowercase
			expires: expiresAt,
			type: 'registration' // Or another appropriate type
		});

		// Invalidate the tokens cache so the new token appears immediately in admin area
		invalidateAdminCache('tokens');

		const responseData = {
			success: true,
			token: { value: token, expires: expiresAt.toISOString() }
		};

		logApiSuccess(context, startTime, 201, body, JSON.stringify(responseData).length);

		logger.info(`Token created successfully`, {
			tokenId: token,
			targetUserId: tokenData.user_id,
			targetEmail: tokenData.email,
			role: tokenData.role,
			expiresAt: expiresAt.toISOString(),
			createdBy: locals.user?._id,
			duration: `${(performance.now() - startTime).toFixed(2)}ms`
		});

		return json(responseData, { status: 201 });
	} catch (err) {
		if (err.status) {
			// Re-throw SvelteKit errors (they're already logged)
			throw err;
		}

		logApiError(context, startTime, err, 500, event.request.body);
		logger.error(`Unexpected error in token creation endpoint`, {
			userId: locals.user?._id,
			error: err.message,
			stack: err.stack
		});
		throw error(500, 'Failed to create token: ' + err.message);
	}
};
