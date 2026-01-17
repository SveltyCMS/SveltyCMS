import { getPrivateSettingSync } from '../../../../../chunks/settingsService.js';
import { error, json } from '@sveltejs/kit';
import { a as auth, d as dbAdapter } from '../../../../../chunks/db.js';
import { g as getDefaultRoles } from '../../../../../chunks/defaultRoles.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
import { cacheService } from '../../../../../chunks/CacheService.js';
import { a as addUserTokenSchema } from '../../../../../chunks/formSchemas.js';
import { v4 } from 'uuid';
import { parse } from 'valibot';
import { g as getLocale } from '../../../../../chunks/runtime.js';
const POST = async ({ request, locals, fetch, url }) => {
	try {
		const { tenantId } = locals;
		if (!auth || !dbAdapter) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error: Auth system not initialized');
		}
		const body = await request.json();
		logger.debug('Received token creation request:', { ...body, tenantId });
		const validatedData = parse(addUserTokenSchema, body);
		logger.debug('Validated data:', validatedData);
		const roleInfo = getDefaultRoles().find((r) => r._id === validatedData.role);
		if (!roleInfo) {
			throw error(400, 'Invalid role selected.');
		}
		const checkCriteria = { email: validatedData.email };
		if (getPrivateSettingSync('MULTI_TENANT')) {
			checkCriteria.tenantId = tenantId;
		}
		const [existingUser, existingTokens] = await Promise.all([auth.checkUser(checkCriteria), auth.getAllTokens(checkCriteria)]);
		if (existingUser) {
			logger.warn('Attempted to create token for an already existing user in this tenant', { email: validatedData.email, tenantId });
			throw error(409, 'A user with this email address already exists in this tenant.');
		}
		if (existingTokens && existingTokens.success && existingTokens.data && existingTokens.data.length > 0) {
			logger.warn('Attempted to create a token for an email that already has one in this tenant', { email: validatedData.email, tenantId });
			throw error(409, 'An invitation token for this email already exists in this tenant. Please delete the existing token first.');
		}
		const expirationInSeconds = {
			'2 hrs': 7200,
			'12 hrs': 43200,
			'2 days': 172800,
			'1 week': 604800,
			'2 weeks': 1209600,
			'1 month': 2592e3
		};
		const expiresInSeconds = expirationInSeconds[validatedData.expiresIn];
		if (!expiresInSeconds) {
			throw error(400, 'Invalid expiration value provided.');
		}
		const expires = new Date(Date.now() + expiresInSeconds * 1e3);
		const user_id = v4();
		const type = 'invite';
		const tokenResult = await dbAdapter.auth.createToken({
			user_id,
			email: validatedData.email.toLowerCase(),
			// Use the provided email directly
			expires: expires.toISOString(),
			type,
			// Note: role is stored separately in the token metadata, not in the token itself
			tenantId: tenantId || void 0
		});
		if (!tokenResult.success || !tokenResult.data) {
			logger.error('Failed to create token', { email: validatedData.email, tenantId });
			throw error(500, 'Failed to create token.');
		}
		const token = tokenResult.data;
		logger.info('Token created successfully', { email: validatedData.email, role: validatedData.role, tenantId });
		const inviteLink = `${url.origin}/login?invite_token=${token}`;
		const emailResponse = await fetch(`${url.origin}/api/sendMail`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-internal-call': 'true'
				// Mark as internal call to bypass auth
			},
			body: JSON.stringify({
				recipientEmail: validatedData.email,
				subject: 'Invitation to Register',
				templateName: 'userToken',
				props: {
					email: validatedData.email,
					role: roleInfo.name,
					// Use the role name for display
					token,
					tokenLink: inviteLink,
					expiresInLabel: validatedData.expiresIn,
					languageTag: getLocale()
				}
			})
		});
		if (!emailResponse.ok) {
			const emailError = await emailResponse.json();
			logger.error('Failed to send invitation email. Keeping token for manual/alternate delivery.', {
				email: validatedData.email,
				error: emailError
			});
			return json({
				success: true,
				message: emailError.message || 'Invitation email could not be sent (dev mode). Token preserved for manual delivery.',
				token: { value: token, expires: expires.toISOString() },
				email_sent: false,
				dev_mode: true
			});
		}
		const emailResult = await emailResponse.json();
		const emailSkipped = emailResult.dev_mode === true;
		const smtpNotConfigured = emailResult.smtp_not_configured === true;
		if (emailSkipped || smtpNotConfigured) {
			const reason = smtpNotConfigured ? 'SMTP not configured' : 'development mode';
			logger.info(`Token created successfully - email sending skipped (${reason})`, {
				email: validatedData.email,
				role: roleInfo.name,
				tenantId,
				config_status: smtpNotConfigured ? 'smtp_not_configured' : 'dummy_email_config'
			});
			cacheService.delete('tokens', tenantId).catch((err) => {
				logger.warn(`Failed to invalidate tokens cache: ${err.message}`);
			});
			return json({
				success: true,
				message: smtpNotConfigured
					? 'Token created; email not sent - SMTP not configured. Please configure email settings in System Settings.'
					: 'Token created; email sending skipped (development mode).',
				token: { value: token, expires: expires.toISOString() },
				email_sent: false,
				dev_mode: emailSkipped,
				smtp_not_configured: smtpNotConfigured,
				user_message: smtpNotConfigured ? emailResult.user_message : void 0
			});
		} else {
			logger.info('Token created and email sent successfully', {
				email: validatedData.email,
				role: roleInfo.name,
				tenantId
			});
		}
		cacheService.delete('tokens', tenantId).catch((err) => {
			logger.warn(`Failed to invalidate tokens cache: ${err.message}`);
		});
		return json({
			success: true,
			message: 'Token created and email sent successfully.',
			token: { value: token, expires: expires.toISOString() },
			email_sent: true
		});
	} catch (err) {
		if (err instanceof Error && err.name === 'ValiError') {
			const valiError = err;
			const issues = valiError.issues.map((issue) => issue.message).join(', ');
			logger.warn('Invalid input for createToken API:', { issues });
			throw error(400, `Invalid input: ${issues}`);
		}
		const httpError = err;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred.';
		logger.error('Error in createToken API:', {
			error: message,
			stack: err instanceof Error ? err.stack : void 0,
			status
		});
		return json({ success: false, message: status === 500 ? 'Internal Server Error' : message }, { status });
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
