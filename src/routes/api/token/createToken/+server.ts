/**
 * @file: src/routes/api/user/createToken/+server.ts
 * @description: API endpoint for creating user registration tokens and sending invitation emails
 *
 * This module provides functionality to:
 * - Create new registration tokens for inviting users
 * - Handle token creation requests
 *
 * Features:
 * - **Defense in Depth**: Specific permission checking for token creation.
 * - Input validation using Valibot schemas.
 * - Safeguards against creating tokens for existing users or emails.
 * - Correct, environment-agnostic link generation for invitation emails.
 * - Error handling and logging.
 */

import { json, error, type HttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth (Database Agnostic)
import { auth } from '@src/databases/db';
import { checkApiPermission } from '@api/permissions';
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
		// **SECURITY**: Check permissions for token creation
		const permissionResult = await checkApiPermission(locals.user, {
			resource: 'system',
			action: 'write'
		});

		if (!permissionResult.hasPermission) {
			logger.warn('Unauthorized attempt to create an invitation token', {
				userId: locals.user?._id,
				error: permissionResult.error
			});
			return json(
				{
					error: permissionResult.error || 'Forbidden: You do not have permission to create user tokens.'
				},
				{ status: permissionResult.error?.includes('Authentication') ? 401 : 403 }
			);
		}

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error: Auth system not initialized');
		}

		const body = await request.json();
		logger.debug('Received token creation request:', body);

		// Validate input using the Valibot schema
		const validatedData = parse(addUserTokenSchema, body);
		logger.debug('Validated data:', validatedData);

		// Initialize roles and validate the selected role
		await initializeRoles();
		const roleInfo = roles.find((r) => r._id === validatedData.role);
		if (!roleInfo) {
			throw error(400, 'Invalid role selected.');
		}

		// Quick checks (fail fast)
		const [existingUser, existingTokens] = await Promise.all([
			auth.checkUser({ email: validatedData.email }),
			auth.getAllTokens({ email: validatedData.email })
		]);

		if (existingUser) {
			logger.warn('Attempted to create token for an already existing user', { email: validatedData.email });
			throw error(409, 'A user with this email address already exists.');
		}

		if (existingTokens && existingTokens.length > 0) {
			logger.warn('Attempted to create a token for an email that already has one', { email: validatedData.email });
			throw error(409, 'An invitation token for this email already exists. Please delete the existing token first.');
		}

		// Calculate expiration date
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
		const expires = new Date(Date.now() + expiresInSeconds * 1000);

		// Create token with pre-generated user_id for when user actually registers
		const token = await auth.db.createToken({
			user_id: uuidv4(), // This will be used when the user actually registers
			email: validatedData.email.toLowerCase(),
			expires,
			type: 'user-invite',
			role: validatedData.role
		});

		if (!token) {
			logger.error('Failed to create token for email', { email: validatedData.email });
			throw error(500, 'Internal Server Error: Token creation failed.');
		}

		logger.info('Token created successfully', { email: validatedData.email });

		// Generate invitation link
		const inviteLink = `${url.origin}/login?invite_token=${token}`;

		// Send invitation email
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
		});

		// Handle email sending failure
		if (!emailResponse.ok) {
			const emailError = await emailResponse.json();
			logger.error('Failed to send invitation email, rolling back token creation.', {
				email: validatedData.email,
				error: emailError
			});
			// Rollback: delete the created token
			await auth.consumeToken(token);
			throw error(500, emailError.message || 'Failed to send invitation email.');
		}

		logger.info('Token created and email sent successfully', {
			email: validatedData.email,
			role: roleInfo.name
		});

		// Invalidate the admin cache for tokens so the UI refreshes immediately
		invalidateAdminCache('tokens');

		// Return success response
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
