/**
 * @file src/routes/api/auth/2fa/backup-codes/+server.ts
 * @description
 * API endpoint for managing 2FA backup codes.
 * Allows users to retrieve their existing backup codes or
 * regenerate a new set for improved account recovery options.
 *
 * features:
 * - backup code retrieval
 * - on-demand backup code regeneration
 * - tenant-aware management isolation
 * - secure transmission via authenticated session
 */

import { auth } from '@databases/db';
import { getDefaultTwoFactorAuthService } from '@src/databases/auth/two-factor-auth';
import { json } from '@sveltejs/kit';
// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger.server';

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
