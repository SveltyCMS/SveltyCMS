import { error, json } from '@sveltejs/kit';
import { l as logger } from '../../../../../../chunks/logger.server.js';
import { getDefaultTwoFactorAuthService } from '../../../../../../chunks/twoFactorAuth.js';
import { a as auth } from '../../../../../../chunks/db.js';
const POST = async ({ locals }) => {
	try {
		if (!locals.user) {
			logger.warn('Unauthorized 2FA disable attempt');
			throw error(401, 'Authentication required');
		}
		const user = locals.user;
		const tenantId = user.tenantId;
		if (!user.is2FAEnabled) {
			logger.warn('2FA disable attempted for user without 2FA enabled', {
				userId: user._id,
				tenantId
			});
			throw error(400, '2FA is not enabled for this account');
		}
		if (!auth) {
			logger.error('Auth service not initialized during 2FA disable request');
			throw error(500, 'Auth service not available');
		}
		const twoFactorService = getDefaultTwoFactorAuthService(auth.authInterface);
		const success = await twoFactorService.disable2FA(user._id, tenantId);
		if (!success) {
			logger.error('Failed to disable 2FA', { userId: user._id, tenantId });
			throw error(500, 'Failed to disable 2FA');
		}
		logger.info('2FA disabled successfully', { userId: user._id, tenantId });
		return json({
			success: true,
			message: '2FA has been disabled for your account.'
		});
	} catch (err) {
		const message = `2FA disable failed: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		if (err instanceof Response) {
			throw err;
		}
		throw error(500, 'Failed to disable 2FA');
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
