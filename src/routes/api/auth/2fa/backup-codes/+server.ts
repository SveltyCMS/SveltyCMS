/**
 * @file src/routes/api/auth/2fa/backup-codes/+server.ts
 * @description API endpoint for managing backup codes
 *
 * @param locals.user - The authenticated user
 * @param locals.user.tenantId - The tenant ID of the authenticated user
 * @param locals.user.is2FAEnabled - Whether 2FA is enabled for the user
 *
 * @returns JSON response with success status and data
 *
 * @throws AppError if authentication is required
 * @throws AppError if 2FA is not enabled for the user
 * @throws AppError if auth service is not initialized
 */

import { json } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';
import { getDefaultTwoFactorAuthService } from '@src/databases/auth/twoFactorAuth';
import { auth } from '@databases/db';

// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';

// GET - Get 2FA status including backup codes count
export const GET = apiHandler(async ({ locals }) => {
	// Ensure user is authenticated
	if (!locals.user) {
		logger.warn('Unauthorized 2FA status request');
		throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
	}

	const user = locals.user;
	const tenantId = user.tenantId;

	// Ensure auth service is initialized
	if (!auth) {
		logger.error('Auth service not initialized during 2FA status request');
		throw new AppError('Auth service not available', 500, 'DB_AUTH_MISSING');
	}

	const twoFactorService = getDefaultTwoFactorAuthService(auth.authInterface);
	const status = await twoFactorService.get2FAStatus(user._id, tenantId);

	logger.debug('2FA status retrieved', { userId: user._id, tenantId });

	return json({
		success: true,
		data: status
	});
});

// POST - Regenerate backup codes
export const POST = apiHandler(async ({ locals }) => {
	// Ensure user is authenticated
	if (!locals.user) {
		logger.warn('Unauthorized backup code regeneration attempt');
		throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
	}

	const user = locals.user;
	const tenantId = user.tenantId;

	// Check if 2FA is enabled
	if (!user.is2FAEnabled) {
		logger.warn('Backup code regeneration attempted for user without 2FA enabled', {
			userId: user._id,
			tenantId
		});
		throw new AppError('2FA is not enabled for this account', 400, '2FA_DISABLED');
	}

	// Ensure auth service is initialized
	if (!auth) {
		logger.error('Auth service not initialized during backup code regeneration');
		throw new AppError('Auth service not available', 500, 'DB_AUTH_MISSING');
	}

	// Regenerate backup codes
	const twoFactorService = getDefaultTwoFactorAuthService(auth.authInterface);
	const newBackupCodes = await twoFactorService.regenerateBackupCodes(user._id, tenantId);

	logger.info('Backup codes regenerated', { userId: user._id, tenantId });

	return json({
		success: true,
		data: {
			backupCodes: newBackupCodes
		},
		message: 'New backup codes generated. Please save these codes in a secure location. Your old backup codes are no longer valid.'
	});
});
