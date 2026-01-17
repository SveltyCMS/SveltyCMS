import { error, json } from '@sveltejs/kit';
import { l as logger } from '../../../../../../chunks/logger.server.js';
import { getDefaultTwoFactorAuthService } from '../../../../../../chunks/twoFactorAuth.js';
import { a as auth } from '../../../../../../chunks/db.js';
const GET = async ({ locals }) => {
	try {
		if (!locals.user) {
			logger.warn('Unauthorized 2FA status request');
			throw error(401, 'Authentication required');
		}
		const user = locals.user;
		const tenantId = user.tenantId;
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
const POST = async ({ locals }) => {
	try {
		if (!locals.user) {
			logger.warn('Unauthorized backup code regeneration attempt');
			throw error(401, 'Authentication required');
		}
		const user = locals.user;
		const tenantId = user.tenantId;
		if (!user.is2FAEnabled) {
			logger.warn('Backup code regeneration attempted for user without 2FA enabled', {
				userId: user._id,
				tenantId
			});
			throw error(400, '2FA is not enabled for this account');
		}
		if (!auth) {
			logger.error('Auth service not initialized during backup code regeneration');
			throw error(500, 'Auth service not available');
		}
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
export { GET, POST };
//# sourceMappingURL=_server.ts.js.map
