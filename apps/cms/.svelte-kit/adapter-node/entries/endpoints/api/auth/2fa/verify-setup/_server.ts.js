import { error, json } from '@sveltejs/kit';
import { l as logger } from '../../../../../../chunks/logger.server.js';
import { getDefaultTwoFactorAuthService } from '../../../../../../chunks/twoFactorAuth.js';
import { a as auth } from '../../../../../../chunks/db.js';
import { object, array, string, parse } from 'valibot';
const verifySetupSchema = object({
	secret: string(),
	verificationCode: string(),
	backupCodes: array(string())
});
const POST = async ({ request, locals }) => {
	try {
		if (!locals.user) {
			logger.warn('Unauthorized 2FA setup verification attempt');
			throw error(401, 'Authentication required');
		}
		const user = locals.user;
		const tenantId = user.tenantId;
		if (user.is2FAEnabled) {
			logger.warn('2FA setup verification attempted for user with 2FA already enabled', {
				userId: user._id,
				tenantId
			});
			throw error(400, '2FA is already enabled for this account');
		}
		const body = await request.json();
		const validatedBody = parse(verifySetupSchema, body);
		if (!auth) {
			logger.error('Auth service not initialized during 2FA setup verification');
			throw error(500, 'Auth service not available');
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
			throw error(400, 'Invalid verification code. Please try again.');
		}
		logger.info('2FA setup completed successfully', { userId: user._id, tenantId });
		return json({
			success: true,
			message: '2FA has been successfully enabled for your account. Please save your backup codes in a secure location.'
		});
	} catch (err) {
		const message = `2FA setup verification failed: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		if (err instanceof Response) {
			throw err;
		}
		throw error(500, 'Failed to complete 2FA setup');
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
