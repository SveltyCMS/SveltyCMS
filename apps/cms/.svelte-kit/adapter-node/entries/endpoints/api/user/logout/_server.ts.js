import { error, json } from '@sveltejs/kit';
import { a as auth, S as SESSION_COOKIE_NAME } from '../../../../../chunks/db.js';
import { cacheService } from '../../../../../chunks/CacheService.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
const POST = async ({ cookies, locals }) => {
	const { user, session_id, tenantId } = locals;
	try {
		if (!auth) {
			logger.error('Authentication system is not initialized.');
			throw error(500, 'Internal Server Error: Auth system not initialized');
		}
		if (session_id && user) {
			const fullUser = user;
			if (fullUser.googleRefreshToken) {
				try {
					const refreshToken = fullUser.googleRefreshToken;
					const response = await fetch(`https://oauth2.googleapis.com/revoke?token=${refreshToken}`, {
						method: 'POST',
						headers: {
							'Content-type': 'application/x-www-form-urlencoded'
						}
					});
					if (response.ok) {
						logger.info('Successfully revoked Google OAuth token for user', { userId: user._id, tenantId });
						await auth.updateUserAttributes(user._id, { googleRefreshToken: void 0 }, tenantId);
					} else {
						const errorBody = await response.json();
						logger.warn('Failed to revoke Google OAuth token. It may have already been revoked.', {
							userId: user._id,
							tenantId,
							error: errorBody
						});
					}
				} catch (revokeError) {
					logger.error('Error while trying to revoke Google OAuth token', { userId: user._id, error: revokeError, tenantId });
				}
			}
			await auth.destroySession(session_id);
			try {
				await cacheService.delete(session_id);
			} catch (cacheError) {
				logger.warn(`Failed to clear session cache: ${cacheError}`);
			}
			logger.info('Session destroyed for user', {
				email: user.email,
				sessionId: session_id,
				tenantId
			});
		} else {
			logger.warn('Logout endpoint was called, but no active session was found.');
		}
		cookies.delete(SESSION_COOKIE_NAME, {
			path: '/',
			httpOnly: true,
			secure: false,
			// Set to true in production with HTTPS
			sameSite: 'lax'
		});
		locals.user = null;
		locals.session_id = void 0;
		locals.tenantId = void 0;
		return json({ success: true, message: 'You have been logged out successfully.' });
	} catch (err) {
		const httpError = err;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred during logout.';
		logger.error('Error during logout process:', {
			error: message,
			stack: err instanceof Error ? err.stack : void 0,
			userId: locals.user?._id,
			tenantId: locals.tenantId,
			status
		});
		try {
			cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
		} catch (cookieError) {
			logger.error('Failed to clear cookie during logout error handling.', { cookieError });
		}
		return json(
			{
				success: false,
				message: status === 500 ? 'Internal Server Error' : message
			},
			{ status }
		);
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
