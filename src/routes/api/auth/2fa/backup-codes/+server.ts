/**
 * @file src/routes/api/auth/2fa/backup-codes/+server.ts
 * @description API endpoint for managing backup codes
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logger } from '@utils/logger.server';
import { getDefaultTwoFactorAuthService } from '@src/databases/auth/twoFactorAuth';
import { auth } from '@databases/db';

// GET - Get 2FA status including backup codes count
export const GET: RequestHandler = async ({ locals }) => {
	try {
		// Ensure user is authenticated
		if (!locals.user) {
			logger.warn('Unauthorized 2FA status request');
			throw error(401, 'Authentication required');
		}

		const user = locals.user;
		const tenantId = user.tenantId;

		// Ensure auth service is initialized
		if (!auth) {
			logger.error('Auth service not initialized during 2FA status request');
			throw error(500, 'Auth service not available');
		}

		const twoFactorService = getDefaultTwoFactorAuthService(auth.authInterface);
		const status = await twoFactorService.get2FAStatus(user._id, tenantId);

		logger.debug('2FA status retrieved', { userId: user._id, tenantId });

		return json({
			success: true,
			data: status
		});
	} catch (err) {
		const message = `Failed to get 2FA status: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);

		if (err instanceof Response) {
			throw err;
		}

		throw error(500, 'Failed to get 2FA status');
	}
};

// POST - Regenerate backup codes
export const POST: RequestHandler = async ({ locals }) => {
	try {
		// Ensure user is authenticated
		if (!locals.user) {
			logger.warn('Unauthorized backup code regeneration attempt');
			throw error(401, 'Authentication required');
		}

		const user = locals.user;
		const tenantId = user.tenantId;

		// Check if 2FA is enabled
		if (!user.is2FAEnabled) {
			logger.warn('Backup code regeneration attempted for user without 2FA enabled', {
				userId: user._id,
				tenantId
			});
			throw error(400, '2FA is not enabled for this account');
		}

		// Ensure auth service is initialized
		if (!auth) {
			logger.error('Auth service not initialized during backup code regeneration');
			throw error(500, 'Auth service not available');
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
	} catch (err) {
		const message = `Backup code regeneration failed: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);

		if (err instanceof Response) {
			throw err;
		}

		throw error(500, 'Failed to regenerate backup codes');
	}
};
