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
import { json, error, type HttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth
import { TokenAdapter } from '@src/auth/mongoDBAuth/tokenAdapter';
import { hasPermissionByAction } from '@src/auth/permissions';
import { roles } from '@root/config/roles';

// Cache invalidation
import { invalidateAdminCache } from '@src/hooks.server';

// Validation
import { object, string, number, parse, type ValiError, minLength } from 'valibot';

// System logger
import { logger } from '@utils/logger.svelte';

const createTokenSchema = object({
	email: string([minLength(1, 'Email is required.')]),
	user_id: string([minLength(1, 'User ID is required.')]),
	role: string(),
	expiresIn: number(),
	expiresInLabel: string()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const hasPermission = hasPermissionByAction(
			locals.user,
			'create',
			'token',
			'any',
			locals.roles && locals.roles.length > 0 ? locals.roles : roles
		);

		if (!hasPermission) {
			logger.warn(`Unauthorized attempt to create a token.`, { userId: locals.user?._id });
			throw error(403, 'Forbidden: You do not have permission to create tokens.');
		}

		const body = await request.json();
		const tokenData = parse(createTokenSchema, body);

		const tokenAdapter = new TokenAdapter();
		const expiresAt = new Date(Date.now() + tokenData.expiresIn * 60 * 60 * 1000);

		const token = await tokenAdapter.createToken({
			user_id: tokenData.user_id,
			email: tokenData.email,
			expires: expiresAt,
			type: 'registration' // Or another appropriate type
		});

		// Invalidate the tokens cache so the new token appears immediately in admin area
		invalidateAdminCache('tokens');

		logger.info(`Token created successfully`, { token, executedBy: locals.user?._id });

		return json({ success: true, token: { value: token, expires: expiresAt.toISOString() } }, { status: 201 });
	} catch (err) {
		if (err.name === 'ValiError') {
			const valiError = err as ValiError;
			const issues = valiError.issues.map((issue) => issue.message).join(', ');
			logger.warn('Invalid input for create token API:', { issues });
			throw error(400, `Invalid input: ${issues}`);
		}
		const httpError = err as HttpError;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred.';
		logger.error('Error in create token API:', {
			error: message,
			stack: err instanceof Error ? err.stack : undefined,
			userId: locals.user?._id,
			status
		});
		return json({ success: false, message: status === 500 ? 'Internal Server Error' : message }, { status });
	}
};
