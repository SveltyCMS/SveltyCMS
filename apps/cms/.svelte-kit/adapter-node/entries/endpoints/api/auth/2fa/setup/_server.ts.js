import { error, json } from '@sveltejs/kit';
import { l as logger } from '../../../../../../chunks/logger.server.js';
import { getDefaultTwoFactorAuthService } from '../../../../../../chunks/twoFactorAuth.js';
import { a as auth } from '../../../../../../chunks/db.js';
const POST = async ({ locals }) => {
	try {
		if (!locals.user) {
			logger.warn('Unauthorized 2FA setup attempt');
			throw error(401, 'Authentication required');
		}
		const user = locals.user;
		const tenantId = user.tenantId;
		if (user.is2FAEnabled) {
			logger.warn('2FA setup attempted for user with 2FA already enabled', {
				userId: user._id,
				tenantId
			});
			throw error(400, '2FA is already enabled for this account');
		}
		if (!auth) {
			logger.error('Auth service not initialized during 2FA setup initiation');
			throw error(500, 'Auth service not available');
		}
		const twoFactorService = getDefaultTwoFactorAuthService(auth.authInterface);
		const setupData = await twoFactorService.initiate2FASetup(user._id, user.email, tenantId);
		logger.info('2FA setup initiated', { userId: user._id, tenantId });
		return json({
			success: true,
			data: setupData,
			message: '2FA setup initiated. Please save your backup codes and scan the QR code with your authenticator app.'
		});
	} catch (err) {
		const message = `2FA setup initiation failed: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		if (err instanceof Response) {
			throw err;
		}
		throw error(500, 'Failed to initiate 2FA setup');
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
