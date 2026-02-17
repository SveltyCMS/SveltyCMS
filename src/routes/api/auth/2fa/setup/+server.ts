/**
 * @file src/routes/api/auth/2fa/setup/+server.ts
 * @description API endpoint for initiating 2FA setup
 */

import { auth } from '@databases/db';
import { getDefaultTwoFactorAuthService } from '@src/databases/auth/twoFactorAuth';
import { json } from '@sveltejs/kit';
// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';
import { logger } from '@utils/logger.server';

export const POST = apiHandler(async ({ locals }) => {
	// Ensure user is authenticated
	if (!locals.user) {
		logger.warn('Unauthorized 2FA setup attempt');
		throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
	}

	const user = locals.user;
	const tenantId = user.tenantId;

	// Check if 2FA is already enabled
	if (user.is2FAEnabled) {
		logger.warn('2FA setup attempted for user with 2FA already enabled', {
			userId: user._id,
			tenantId
		});
		throw new AppError('2FA is already enabled for this account', 400, '2FA_ALREADY_ENABLED');
	}

	// Initialize 2FA setup
	if (!auth) {
		logger.error('Auth service not initialized during 2FA setup initiation');
		throw new AppError('Auth service not available', 500, 'DB_AUTH_MISSING');
	}
	const twoFactorService = getDefaultTwoFactorAuthService(auth.authInterface);
	const setupData = await twoFactorService.initiate2FASetup(user._id, user.email, tenantId);

	logger.info('2FA setup initiated', { userId: user._id, tenantId });

	return json({
		success: true,
		data: setupData,
		message: '2FA setup initiated. Please save your backup codes and scan the QR code with your authenticator app.'
	});
});
