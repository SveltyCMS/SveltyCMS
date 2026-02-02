/**
 * @file src/routes/api/auth/2fa/disable/+server.ts
 * @description API endpoint for disabling 2FA
 */

import { json } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';
import { getDefaultTwoFactorAuthService } from '@src/databases/auth/twoFactorAuth';
import { auth } from '@databases/db';

// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';

export const POST = apiHandler(async ({ locals }) => {
	// Ensure user is authenticated
	if (!locals.user) {
		logger.warn('Unauthorized 2FA disable attempt');
		throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
	}

	const user = locals.user;
	const tenantId = user.tenantId;

	// Check if 2FA is enabled
	if (!user.is2FAEnabled) {
		logger.warn('2FA disable attempted for user without 2FA enabled', {
			userId: user._id,
			tenantId
		});
		throw new AppError('2FA is not enabled for this account', 400, '2FA_DISABLED');
	}

	// Disable 2FA
	if (!auth) {
		logger.error('Auth service not initialized during 2FA disable request');
		throw new AppError('Auth service not available', 500, 'DB_AUTH_MISSING');
	}
	const twoFactorService = getDefaultTwoFactorAuthService(auth.authInterface);
	const success = await twoFactorService.disable2FA(user._id, tenantId);

	if (!success) {
		logger.error('Failed to disable 2FA', { userId: user._id, tenantId });
		throw new AppError('Failed to disable 2FA', 500, '2FA_DISABLE_FAILED');
	}

	logger.info('2FA disabled successfully', { userId: user._id, tenantId });

	return json({
		success: true,
		message: '2FA has been disabled for your account.'
	});
});
