/**
 * @file: src/routes/api/user/createToken/+server.ts
 * @description: API endpoint for creating user registration tokens and sending invitation emails
 *
 * Thi		// Invalidate the admin cache for tokens so the UI refreshes immediately

		invalidateAdminCache('tokens', tenantId); // Return success response

		return json({
			success: true,
			message: emailSkipped 
				? 'Token created successfully. Email sending skipped (development mode - configure SMTP settings to enable email).'
				: 'Token created and email sent successfully.',
			token: { value: token, expires: expires.toISOString() },
			email_sent: !emailSkipped
		});provides functionality to:
 * - Create new registration tokens for inviting users, scoped to the current tenant.
 * - Handle token creation requests
 *
 * Features:
 * - **Defense in Depth**: Specific permission checking for token creation.
 * - Input validation using Valibot schemas.
 * - Safeguards against creating tokens for existing users or emails within the same tenant.
 * - Correct, environment-agnostic link generation for invitation emails.
 * - Error handling and logging.
 */

import { json, error, type HttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { privateEnv } from '@root/config/private';

// Auth (Database Agnostic)
import { auth } from '@src/databases/db';
import { roles, initializeRoles } from '@root/config/roles';

// System Logger
import { logger } from '@utils/logger.svelte';

// Cache invalidation
import { invalidateAdminCache } from '@src/hooks.server';

// Input validation
import { addUserTokenSchema } from '@utils/formSchemas';
import { parse, type ValiError } from 'valibot';
import { v4 as uuidv4 } from 'uuid';

// ParaglideJS
import { getLocale } from '@src/paraglide/runtime';

export const POST: RequestHandler = async ({ request, locals, fetch, url }) => {
	try {
		const { tenantId } = locals; // User and permissions are guaranteed by hooks

		// No permission checks needed - hooks already verified:
		// 1. User is authenticated
		// 2. User has correct role for 'api:token' endpoint
		// 3. User belongs to correct tenant (if multi-tenant)

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error: Auth system not initialized');
		}

		// Note: tenantId validation is handled by hooks in multi-tenant mode

		const body = await request.json();
		logger.debug('Received token creation request:', { ...body, tenantId }); // Validate input using the Valibot schema

		const validatedData = parse(addUserTokenSchema, body);
		logger.debug('Validated data:', validatedData); // Initialize roles and validate the selected role

		await initializeRoles();
		const roleInfo = roles.find((r) => r._id === validatedData.role);
		if (!roleInfo) {
			throw error(400, 'Invalid role selected.');
		}

		// --- MULTI-TENANCY: Scope checks to the current tenant ---
		const checkCriteria: { email: string; tenantId?: string } = { email: validatedData.email };
		if (privateEnv.MULTI_TENANT) {
			checkCriteria.tenantId = tenantId;
		} // Quick checks (fail fast)

		const [existingUser, existingTokens] = await Promise.all([auth.checkUser(checkCriteria), auth.getAllTokens(checkCriteria)]);

		if (existingUser) {
			logger.warn('Attempted to create token for an already existing user in this tenant', { email: validatedData.email, tenantId });
			throw error(409, 'A user with this email address already exists in this tenant.');
		}

		if (existingTokens && existingTokens.length > 0) {
			logger.warn('Attempted to create a token for an email that already has one in this tenant', { email: validatedData.email, tenantId });
			throw error(409, 'An invitation token for this email already exists in this tenant. Please delete the existing token first.');
		} // Calculate expiration date

		const expirationInSeconds: Record<string, number> = {
			'2 hrs': 7200,
			'12 hrs': 43200,
			'2 days': 172800,
			'1 week': 604800,
			'2 weeks': 1209600,
			'1 month': 2592000
		};
		const expiresInSeconds = expirationInSeconds[validatedData.expiresIn];
		if (!expiresInSeconds) {
			throw error(400, 'Invalid expiration value provided.');
		}
		const expires = new Date(Date.now() + expiresInSeconds * 1000); // Create token with pre-generated user_id for when user actually registers

		const token = await auth.db.createToken({
			user_id: uuidv4(), // This will be used when the user actually registers
			...(privateEnv.MULTI_TENANT && { tenantId }), // Add tenantId to the token
			email: validatedData.email.toLowerCase(),
			expires,
			type: 'user-invite',
			role: validatedData.role
		});

		if (!token) {
			logger.error('Failed to create token for email', { email: validatedData.email, tenantId });
			throw error(500, 'Internal Server Error: Token creation failed.');
		}

		logger.info('Token created successfully', { email: validatedData.email, tenantId }); // Generate invitation link

		const inviteLink = `${url.origin}/login?invite_token=${token}`; // Send invitation email

		const emailResponse = await fetch(`${url.origin}/api/sendMail`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-internal-call': 'true' // Mark as internal call to bypass auth
			},
			body: JSON.stringify({
				recipientEmail: validatedData.email,
				subject: 'Invitation to Register',
				templateName: 'userToken',
				props: {
					email: validatedData.email,
					role: roleInfo.name, // Use the role name for display
					token: token,
					tokenLink: inviteLink,
					expiresInLabel: validatedData.expiresIn,
					languageTag: getLocale()
				}
			})
		}); // Handle email sending response

		if (!emailResponse.ok) {
			const emailError = await emailResponse.json();
			logger.error('Failed to send invitation email, rolling back token creation.', {
				email: validatedData.email,
				error: emailError
			}); // Rollback: delete the created token
			await auth.consumeToken(token);
			throw error(500, emailError.message || 'Failed to send invitation email.');
		}

		// Check if email was actually sent or skipped due to dummy config
		const emailResult = await emailResponse.json();
		const emailSkipped = emailResult.dev_mode === true;

		if (emailSkipped) {
			logger.info('Token created successfully - email sending skipped (development mode)', {
				email: validatedData.email,
				role: roleInfo.name,
				tenantId,
				config_status: 'dummy_email_config'
			});
		} else {
			logger.info('Token created and email sent successfully', {
				email: validatedData.email,
				role: roleInfo.name,
				tenantId
			});
		} // Invalidate the admin cache for tokens so the UI refreshes immediately

		invalidateAdminCache('tokens', tenantId); // Return success response

		return json({
			success: true,
			message: 'Token created and email sent successfully.',
			token: { value: token, expires: expires.toISOString() }
		});
	} catch (err) {
		if (err.name === 'ValiError') {
			const valiError = err as ValiError;
			const issues = valiError.issues.map((issue) => issue.message).join(', ');
			logger.warn('Invalid input for createToken API:', { issues });
			throw error(400, `Invalid input: ${issues}`);
		}

		const httpError = err as HttpError;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred.';

		logger.error('Error in createToken API:', {
			error: message,
			stack: err instanceof Error ? err.stack : undefined,
			status
		});

		return json({ success: false, message: status === 500 ? 'Internal Server Error' : message }, { status });
	}
};
