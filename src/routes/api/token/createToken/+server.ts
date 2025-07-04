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

// Auth and permission helpers
import { TokenAdapter } from '@src/auth/mongoDBAuth/tokenAdapter';
import { auth } from '@src/databases/db';
import { hasPermissionByAction } from '@src/auth/permissions';
import { roles } from '@root/config/roles'; // Import static roles for fallback

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
		// **SECURITY**: Add a specific permission check.
		const hasPermission = hasPermissionByAction(locals.user, 'create', 'user', 'any', locals.roles && locals.roles.length > 0 ? locals.roles : roles);

		if (!hasPermission) {
			logger.warn('Unauthorized attempt to create an invitation token', { userId: locals.user?._id });
			throw error(403, 'Forbidden: You do not have permission to create user tokens.');
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

		// Check if a user with this email already exists in the main user collection.
		const existingUser = await auth.checkUser({ email: validatedData.email });
		if (existingUser) {
			logger.warn('Attempted to create token for an already existing user', { email: validatedData.email });
			throw error(409, 'A user with this email address already exists.');
		}

		// Check if an invitation token already exists for this email.
		const tokenAdapter = new TokenAdapter();
		// Check if a token already exists for this email

		const existingTokens = await tokenAdapter.getAllTokens({ email: validatedData.email });
		if (existingTokens && existingTokens.length > 0) {
			logger.warn('Attempted to create a token for an email that already has one', { email: validatedData.email });
			throw error(409, 'An invitation token for this email already exists. Please delete the existing token first.');
		}

		// Find the role object to get its name for the email template
		const roleInfo = roles.find((r) => r._id === validatedData.role);
		const roleName = roleInfo ? roleInfo.name : validatedData.role; // Fallback to role ID if not found

		// Define expiration times based on the schema's allowed values.
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

		// Create a new token using the TokenAdapter
		const token = await tokenAdapter.createToken({
			user_id: uuidv4(), // Use uuidv4 to generate a unique user_id
			email: validatedData.email,
			expires,
			type: 'user-invite',
			username: validatedData.username,
			role: validatedData.role
		});

		if (!token) {
			logger.error('Failed to create token for email', { email: validatedData.email });
			throw error(500, 'Internal Server Error: Token creation failed.');
		}

		logger.info('Token created successfully', { email: validatedData.email });

		// Generate a link to the login page with the invite token as a query parameter.
		const origin = url.origin;
		const inviteLink = `${origin}/login?invite_token=${token}`;

		// Send invitation email using the internal sendMail API.
		const emailApiUrl = `${origin}/api/sendMail`;

		// Send invitation email using the internal sendMail API.
		const emailResponse = await fetch(emailApiUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				recipientEmail: validatedData.email, // Changed from 'email' to 'recipientEmail'
				subject: 'Invitation to Register',
				templateName: 'userToken',
				props: {
					username: '', // Will be filled by the user during signup
					email: validatedData.email,
					role: roleName, // Send user-friendly role name
					token: token, // Include the raw token for fallback
					tokenLink: inviteLink, // Pass the full magic link to the template
					expiresInLabel: validatedData.expiresIn,
					languageTag: getLocale()
				}
			})
		});

		// If sending the email fails, roll back by deleting the created token.
		if (!emailResponse.ok) {
			const emailError = await emailResponse.json();
			logger.error('Failed to send invitation email, rolling back token creation.', { email: validatedData.email, error: emailError });
			await tokenAdapter.consumeToken(token);
			throw error(500, emailError.message || 'Failed to send invitation email.');
		}

		logger.info('Token created and email sent successfully', { email: validatedData.email, role: roleName });

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
