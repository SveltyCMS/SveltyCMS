/**
 * @file src/routes/api/auth/2fa/verify/+server.ts
 * @description API endpoint for verifying 2FA codes during authentication
 */

import { auth } from '@databases/db';
import { getDefaultTwoFactorAuthService } from '@src/databases/auth/twoFactorAuth';
import { json } from '@sveltejs/kit';
// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';
import { logger } from '@utils/logger.server';
import { object, parse, string } from 'valibot';

// Request body schema
const verifySchema = object({
	userId: string('User ID is required'),
	code: string('Verification code is required')
});

export const POST = apiHandler(async ({ request, locals }) => {
	// This endpoint can be used during login flow, so user might not be fully authenticated yet
	// The userId will be provided in the request body for verification

	// Parse and validate request body (Valibot error caught by apiHandler)
	const body = await request.json().catch(() => {
		throw new AppError('Invalid JSON', 400, 'INVALID_JSON');
	});
	const validatedBody = parse(verifySchema, body);

	// Get tenant ID from locals if available
	const tenantId = locals.user?.tenantId;

	// Verify 2FA code
	if (!auth) {
		throw new AppError('Auth service not available', 500, 'DB_AUTH_MISSING');
	}

	const twoFactorService = getDefaultTwoFactorAuthService(auth.authInterface);
	const result = await twoFactorService.verify2FA(validatedBody.userId, validatedBody.code, tenantId);

	if (!result.success) {
		logger.warn('2FA verification failed', {
			userId: validatedBody.userId,
			tenantId,
			reason: result.message
		});

		// Return 200 with success: false to handle gracefully
		return json({
			success: false,
			message: result.message || 'Invalid verification code'
		});
	}

	logger.info('2FA verification successful', {
		userId: validatedBody.userId,
		tenantId,
		method: result.method,
		backupCodeUsed: result.backupCodeUsed
	});

	return json({
		success: true,
		message: result.message,
		method: result.method,
		backupCodeUsed: result.backupCodeUsed
	});
});
