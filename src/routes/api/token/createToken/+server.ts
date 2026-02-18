/**
 * @file: src/routes/api/user/createToken/+server.ts
 * @description: API endpoint for creating user registration tokens and sending invitation emails
 *
 * Features:
 * - **Defense in Depth**: Specific permission checking for token creation.
 * - Input validation using Valibot schemas.
 * - Safeguards against creating tokens for existing users or emails within the same tenant.
 * - Correct, environment-agnostic link generation for invitation emails.
 * - Error handling and logging.
 */

// Auth
import type { ISODateString } from '@src/content/types';
import { getDefaultRoles } from '@src/databases/auth/defaultRoles';
// Cache invalidation
import { cacheService } from '@src/databases/CacheService';
import { auth, dbAdapter } from '@src/databases/db';
// ParaglideJS
import { getLocale } from '@src/paraglide/runtime';
import { getPrivateSettingSync } from '@src/services/settingsService';
import { type HttpError, json } from '@sveltejs/kit';
// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';
// Input validation
import { addUserTokenSchema } from '@utils/formSchemas';
// System Logger
import { logger } from '@utils/logger.server';
import { v4 as uuidv4 } from 'uuid';
import { parse } from 'valibot';

export const POST = apiHandler(async ({ request, locals, fetch, url }) => {
	try {
		const { tenantId } = locals; // User and permissions are guaranteed by hooks

		// No permission checks needed - hooks already verified:
		// 1. User is authenticated
		// 2. User has correct role for 'api:token' endpoint
		// 3. User belongs to correct tenant (if multi-tenant)

		if (!(auth && dbAdapter)) {
			logger.error('Authentication system is not initialized');
			throw new AppError('Internal Server Error: Auth system not initialized', 500, 'AUTH_SYS_ERROR');
		}

		// Note: tenantId validation is handled by hooks in multi-tenant mode

		const body = await request.json();
		logger.debug('Received token creation request:', { ...body, tenantId }); // Validate input using the Valibot schema

		const validatedData = parse(addUserTokenSchema, body);
		logger.debug('Validated data:', validatedData); // Validate the selected role

		const roleInfo = getDefaultRoles().find((r) => r._id === validatedData.role);
		if (!roleInfo) {
			throw new AppError('Invalid role selected.', 400, 'INVALID_ROLE');
		}

		// --- MULTI-TENANCY: Scope checks to the current tenant ---
		const checkCriteria: { email: string; tenantId?: string } = { email: validatedData.email };
		if (getPrivateSettingSync('MULTI_TENANT')) {
			checkCriteria.tenantId = tenantId;
		} // Quick checks (fail fast)

		const [existingUser, existingTokens] = await Promise.all([auth.checkUser(checkCriteria), auth.getAllTokens(checkCriteria)]);

		if (existingUser) {
			logger.warn('Attempted to create token for an already existing user in this tenant', { email: validatedData.email, tenantId });
			throw new AppError('A user with this email address already exists in this tenant.', 409, 'USER_EXISTS');
		}

		if (existingTokens?.success && existingTokens.data && existingTokens.data.length > 0) {
			logger.warn('Attempted to create a token for an email that already has one in this tenant', { email: validatedData.email, tenantId });
			throw new AppError(
				'An invitation token for this email already exists in this tenant. Please delete the existing token first.',
				409,
				'TOKEN_EXISTS'
			);
		}

		// Calculate expiration date
		const expirationInSeconds: Record<string, number> = {
			'2 hrs': 7200,
			'12 hrs': 43_200,
			'2 days': 172_800,
			'1 week': 604_800,
			'2 weeks': 1_209_600,
			'1 month': 2_592_000
		};
		const expiresInSeconds = expirationInSeconds[validatedData.expiresIn];
		if (!expiresInSeconds) {
			throw new AppError('Invalid expiration value provided.', 400, 'INVALID_EXPIRATION');
		}
		const expires = new Date(Date.now() + expiresInSeconds * 1000); // Create token with pre-generated user_id for when user actually registers

		// Create token in database
		// For invite tokens, we use the database adapter directly since the user doesn't exist yet
		const user_id = uuidv4();
		const type = 'invite';

		// Use dbAdapter directly for invite tokens since the user doesn't exist yet
		const tokenResult = await dbAdapter.auth.createToken({
			user_id,
			email: validatedData.email.toLowerCase(), // Use the provided email directly
			expires: expires.toISOString() as ISODateString,
			type,
			// Note: role is stored separately in the token metadata, not in the token itself
			tenantId: tenantId || undefined
		});

		if (!(tokenResult.success && tokenResult.data)) {
			logger.error('Failed to create token', { email: validatedData.email, tenantId });
			throw new AppError('Failed to create token.', 500, 'TOKEN_CREATION_FAILED');
		}

		// Get the actual token string from the database result
		const token = tokenResult.data;

		logger.info('Token created successfully', { email: validatedData.email, role: validatedData.role, tenantId }); // Generate invitation link

		const inviteLink = `${url.origin}/login?invite_token=${token}`; // Send invitation email

		const internalKey = getPrivateSettingSync('JWT_SECRET_KEY');

		const emailResponse = await fetch(`${url.origin}/api/sendMail`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-internal-key': internalKey || ''
			},
			body: JSON.stringify({
				recipientEmail: validatedData.email,
				subject: 'Invitation to Register',
				templateName: 'userToken',
				props: {
					email: validatedData.email,
					role: roleInfo.name, // Use the role name for display
					token,
					tokenLink: inviteLink,
					expiresInLabel: validatedData.expiresIn,
					languageTag: getLocale()
				}
			})
		}); // Handle email sending response

		if (!emailResponse.ok) {
			const emailError = await emailResponse.json();
			logger.error('Failed to send invitation email. Keeping token for manual/alternate delivery.', {
				email: validatedData.email,
				error: emailError
			});
			// Do NOT consume token here; return token so admin can deliver link manually in dev
			return json({
				success: true,
				message: emailError.message || 'Invitation email could not be sent (dev mode). Token preserved for manual delivery.',
				token: { value: token, expires: expires.toISOString() },
				email_sent: false,
				dev_mode: true
			});
		}

		// Check if email was actually sent or skipped due to dummy config
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
			// Return token so it can be delivered manually in dev
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
				user_message: smtpNotConfigured ? emailResult.user_message : undefined
			});
		}
		logger.info('Token created and email sent successfully', {
			email: validatedData.email,
			role: roleInfo.name,
			tenantId
		});

		cacheService.delete('tokens', tenantId).catch((err) => {
			logger.warn(`Failed to invalidate tokens cache: ${err.message}`);
		}); // Return success response

		return json({
			success: true,
			message: 'Token created and email sent successfully.',
			token: { value: token, expires: expires.toISOString() },
			email_sent: true
		});
	} catch (err) {
		if (err instanceof AppError) {
			throw err;
		}
		if (err instanceof Error && err.name === 'ValiError') {
			const valiError = err as unknown as { issues: Array<{ message: string }> };
			const issues = valiError.issues.map((issue) => issue.message).join(', ');
			logger.warn('Invalid input for createToken API:', { issues });
			throw new AppError(`Invalid input: ${issues}`, 400, 'VALIDATION_ERROR');
		}

		const httpError = err as HttpError;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred.';

		logger.error('Error in createToken API:', {
			error: message,
			stack: err instanceof Error ? err.stack : undefined,
			status
		});

		throw new AppError(message, status, 'CREATE_TOKEN_FAILED');
	}
});
