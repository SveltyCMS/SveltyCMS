import { error, json } from '@sveltejs/kit';
import { getPrivateSettingSync } from '../../../../../chunks/settingsService.js';
import { a as auth } from '../../../../../chunks/db.js';
import { l as logger$1 } from '../../../../../chunks/logger.server.js';
import { logger } from '../../../../../chunks/logger.js';
async function verifyPassword(hashedPassword, plainPassword) {
	try {
		const argon2 = await import('argon2');
		const isValid = await argon2.verify(hashedPassword, plainPassword);
		logger.trace('Password verification completed', { isValid });
		return isValid;
	} catch (error2) {
		logger.error('Password verification failed:', error2);
		return false;
	}
}
const POST = async ({ request, cookies, locals }) => {
	try {
		const { user: existingUser, tenantId } = locals;
		if (!auth) {
			logger$1.error('Authentication system is not initialized.');
			throw error(500, 'Internal Server Error: Auth system not initialized');
		}
		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			logger$1.error('Login attempt failed: Tenant ID is missing in a multi-tenant setup.');
			throw error(400, 'Could not identify the tenant for this request.');
		}
		if (existingUser) {
			logger$1.warn('Authenticated user attempted to log in again.', { userId: existingUser._id });
			throw error(400, 'You are already authenticated.');
		}
		const { email, password } = await request.json();
		if (!email || !password) {
			throw error(400, 'Email and password are required.');
		}
		const userLookupCriteria = { email };
		if (getPrivateSettingSync('MULTI_TENANT')) {
			userLookupCriteria.tenantId = tenantId;
		}
		const user = await auth.getUserByEmail(userLookupCriteria);
		if (!user || !user.password) {
			logger$1.warn(`Login attempt failed: User not found or password not set for email: ${email}`, { tenantId });
			throw error(401, 'Invalid credentials.');
		}
		if (user.blocked) {
			logger$1.warn(`Blocked user attempted to log in: ${email}`, { userId: user._id, tenantId });
			throw error(403, 'Your account has been suspended. Please contact support.');
		}
		const isValidPassword = await verifyPassword(user.password, password);
		if (!isValidPassword) {
			logger$1.warn(`Login attempt failed: Invalid password for user: ${email}`, { userId: user._id, tenantId });
			throw error(401, 'Invalid credentials.');
		}
		const session = await auth.createSession({
			user_id: user._id,
			...(getPrivateSettingSync('MULTI_TENANT') && { tenantId }),
			// Add tenantId to the session
			expires: new Date(Date.now() + 24 * 60 * 60 * 1e3).toISOString()
			// 24-hour session
		});
		const sessionCookie = auth.createSessionCookie(session._id);
		cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
		logger$1.info(`User logged in successfully: ${user.email}`, { userId: user._id, tenantId });
		return json({ success: true, message: 'Login successful.' });
	} catch (err) {
		const httpError = err;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred during login.';
		if (status >= 500) {
			logger$1.error('Internal server error during login:', {
				error: message,
				stack: err instanceof Error ? err.stack : void 0,
				status
			});
		}
		return json({ success: false, message }, { status });
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
