/**
 * @file src/routes/api/auth/2fa/verify-setup/+server.ts
 * @description API endpoint for completing 2FA setup by verifying the first TOTP code
 */

import { auth } from '@databases/db';
import { getDefaultTwoFactorAuthService } from '@src/databases/auth/twoFactorAuth';
import { json } from '@sveltejs/kit';
// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';
import { logger } from '@utils/logger.server';
import { array, object, parse, string } from 'valibot';

// Request body schema
const verifySetupSchema = object({
	secret: string('Secret is required'),
	verificationCode: string('Verification code is required'),
	backupCodes: array(string(), 'Backup codes are required')
});

export const POST = apiHandler(async ({ request, locals }) => {
	// Ensure user is authenticated
	if (!locals.user) {
		logger.warn('Unauthorized 2FA setup verification attempt');
		throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
	}

	const user = locals.user;
	const tenantId = user.tenantId;

	// Check if 2FA is already enabled
	if (user.is2FAEnabled) {
		logger.warn('2FA setup verification attempted for user with 2FA already enabled', {
			userId: user._id,
			tenantId
		});
		throw new AppError('2FA is already enabled for this account', 400, '2FA_ALREADY_ENABLED');
	}

	// Parse and validate request body
	const body = await request.json().catch(() => {
		throw new AppError('Invalid JSON', 400, 'INVALID_JSON');
	});
	const validatedBody = parse(verifySetupSchema, body);

	// Complete 2FA setup
	if (!auth) {
		logger.error('Auth service not initialized during 2FA setup verification');
		throw new AppError('Auth service not available', 500, 'DB_AUTH_MISSING');
	}
	const twoFactorService = getDefaultTwoFactorAuthService(auth.authInterface);
	const success = await twoFactorService.complete2FASetup(
		user._id,
		validatedBody.secret,
		validatedBody.verificationCode,
		validatedBody.backupCodes,
		tenantId
	);

	if (!success) {
		logger.warn('2FA setup verification failed - invalid code', {
			userId: user._id,
			tenantId
		});
		throw new AppError('Invalid verification code. Please try again.', 400, 'INVALID_VERIFICATION_CODE');
	}

	logger.info('2FA setup completed successfully', { userId: user._id, tenantId });

	return json({
		success: true,
		message: '2FA has been successfully enabled for your account. Please save your backup codes in a secure location.'
	});
});
