import { error, json } from '@sveltejs/kit';
import { l as logger } from '../../../../../../chunks/logger.server.js';
import { getDefaultTwoFactorAuthService } from '../../../../../../chunks/twoFactorAuth.js';
import { a as auth } from '../../../../../../chunks/db.js';
import { object, string, parse } from 'valibot';
const verifySchema = object({
	userId: string(),
	code: string()
});
const POST = async ({ request, locals }) => {
	try {
		const body = await request.json();
		const validatedBody = parse(verifySchema, body);
		const tenantId = locals.user?.tenantId;
		if (!auth) {
			logger.error('Auth service not initialized during 2FA verification');
			throw error(500, 'Auth service not available');
		}
		const twoFactorService = getDefaultTwoFactorAuthService(auth.authInterface);
		const result = await twoFactorService.verify2FA(validatedBody.userId, validatedBody.code, tenantId);
		if (!result.success) {
			logger.warn('2FA verification failed', {
				userId: validatedBody.userId,
				tenantId,
				reason: result.message
			});
			return json({
				success: false,
				message: result.message
			});
		}
		logger.info('2FA verification successful', {
			userId: validatedBody.userId,
			tenantId,
			method: result.method,
			backupCodeUsed: result.backupCodeUsed
		});
		return json({
			success: true,
			message: result.message,
			method: result.method,
			backupCodeUsed: result.backupCodeUsed
		});
	} catch (err) {
		const message = `2FA verification failed: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		if (err instanceof Response) {
			throw err;
		}
		throw error(500, 'Failed to verify 2FA code');
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
