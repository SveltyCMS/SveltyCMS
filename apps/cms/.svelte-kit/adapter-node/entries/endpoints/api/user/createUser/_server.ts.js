import { getPrivateSettingSync } from '../../../../../chunks/settingsService.js';
import { error, json } from '@sveltejs/kit';
import { a as auth } from '../../../../../chunks/db.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
import { object, optional, string, pipe, email, parse } from 'valibot';
function parseSessionDuration(duration) {
	const durationMap = {
		'1h': 60 * 60 * 1e3,
		// 1 hour
		'1d': 24 * 60 * 60 * 1e3,
		// 1 day
		'7d': 7 * 24 * 60 * 60 * 1e3,
		// 7 days
		'30d': 30 * 24 * 60 * 60 * 1e3,
		// 30 days
		'90d': 90 * 24 * 60 * 60 * 1e3
		// 90 days
	};
	return durationMap[duration] || durationMap['7d'];
}
const createUserSchema = object({
	email: pipe(string(), email('Please provide a valid email address.')),
	role: string('A role ID must be provided.'),
	username: optional(string()),
	password: string(),
	createSession: optional(string())
	// Optional: '1h', '1d', '7d', '30d', '90d' - session duration
});
const POST = async ({ request, locals }) => {
	try {
		const { user, tenantId } = locals;
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error: Auth system not initialized');
		}
		const body = await request.json();
		const userData = parse(createUserSchema, body);
		logger.debug('Received and validated request to create user', { email: userData.email, byUser: user?._id, tenantId });
		const userCheckCriteria = { email: userData.email };
		if (getPrivateSettingSync('MULTI_TENANT')) {
			userCheckCriteria.tenantId = tenantId;
		}
		const existingUser = await auth.checkUser(userCheckCriteria);
		if (existingUser) {
			logger.warn('Attempted to create a user that already exists in this tenant', { email: userData.email, tenantId });
			throw error(409, 'A user with this email address already exists in this tenant.');
		}
		const shouldCreateSession = !!userData.createSession;
		if (shouldCreateSession) {
			const sessionDuration = parseSessionDuration(userData.createSession || '7d');
			const expires = new Date(Date.now() + sessionDuration).toISOString();
			logger.debug('Creating user with session', {
				email: userData.email,
				sessionExpires: expires,
				tenantId
			});
			const result = await auth.createUserAndSession(
				{
					...userData,
					...(getPrivateSettingSync('MULTI_TENANT') && { tenantId }),
					isRegistered: true,
					lastAuthMethod: 'password'
				},
				{ expires, tenantId }
			);
			if (!result.success || !result.data) {
				const errorMessage = !result.success && 'error' in result ? result.error?.message : 'Failed to create user and session';
				throw error(500, errorMessage);
			}
			logger.info('User and session created successfully via direct API call', {
				newUserId: result.data.user._id,
				sessionId: result.data.session._id,
				createdBy: user?._id,
				tenantId
			});
			return json(
				{
					...result.data.user,
					sessionId: result.data.session._id,
					sessionExpires: result.data.session.expires
				},
				{ status: 201 }
			);
		}
		const newUser = await auth.createUser({
			...userData,
			...(getPrivateSettingSync('MULTI_TENANT') && { tenantId }),
			// Conditionally add tenantId
			isRegistered: true,
			// Assuming direct creation means they are fully registered.
			lastAuthMethod: 'password'
			// Or a default value.
		});
		logger.info('User created successfully via direct API call', { newUserId: newUser._id, createdBy: user?._id, tenantId });
		return json(newUser, { status: 201 });
	} catch (err) {
		if (err instanceof Error && err.name === 'ValiError') {
			const valiError = err;
			const issues = valiError.issues.map((issue) => issue.message).join(', ');
			logger.warn('Invalid input for createUser API:', { issues });
			throw error(400, `Invalid input: ${issues}`);
		}
		const httpError = err;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred while creating the user.';
		logger.error('Error in createUser API:', {
			error: message,
			stack: err instanceof Error ? err.stack : void 0,
			userId: locals.user?._id,
			status
		});
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
