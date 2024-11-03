/**
 * @file: src/routes/api/user/createToken/+server.ts
 * @description: API endpoint for creating user registration tokens and sending invitation emails
 *
 * This module provides functionality to:
 * - Create new registration tokens for inviting users
 * - Handle token creation requests
 * - Validate user permissions for token creation
 * - Send invitation emails with the registration token
 *
 * Features:
 * - POST endpoint for registration token creation
 * - Permission checking
 * - Input validation using existing schemas
 * - Error handling and logging
 * - Email sending using the sendMail API
 *
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

// Auth
import { TokenAdapter } from '@src/auth/mongoDBAuth/tokenAdapter';

// System Logger
import { logger } from '@utils/logger';

// Input validation
import { addUserTokenSchema } from '@utils/formSchemas';
import { parse } from 'valibot';

// Roles
import { roles } from '@root/config/roles';
// ParaglideJS
import { languageTag } from '@src/paraglide/runtime';

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
	try {
		// Check if the user has permission to create tokens
		const { hasPermission } = await checkUserPermission(locals.user, {
			contextId: 'config/userManagement',
			name: 'Create Registration Token',
			action: 'manage',
			contextType: 'system'
		});

		if (!hasPermission) {
			throw error(403, 'Unauthorized to create registration tokens');
		}

		const body = await request.json();
		logger.debug('Received token creation request:', body);

		// Validate input using the existing schema
		const validatedData = addUserTokenSchema.parse(body);
		logger.debug('Validated data:', validatedData); // Debug log

		const tokenAdapter = new TokenAdapter();

		// Check if a token already exists for this email
		const existingTokens = await tokenAdapter.getAllTokens({ email: validatedData.email });
		if (existingTokens && existingTokens.length > 0) {
			logger.warn('Token already exists for email:', validatedData.email);
			throw error(400, { message: 'A registration token already exists for this email' });
		}

		// Get expiration hours from the validated data
		const expiresInHours = validatedData.expiresIn;
		logger.debug('Expiration hours:', expiresInHours);

		// Calculate expiration date
		const expires = new Date();
		expires.setHours(expires.getHours() + expiresInHours);

		// Find the role object based on the role ID
		const role = roles.find((r) => r._id === validatedData.role);
		if (!role) {
			logger.error('Invalid role:', validatedData.role);
			throw error(400, { message: 'Invalid role' });
		}

		// Check if user already exists
		const existingUser = await auth.checkUser({ email: validatedData.email });
		if (existingUser) {
			logger.error('User already exists:', validatedData.email);
			throw error(400, { message: 'User with this email already exists' });
		}

		// Create a registration token
		const token = await tokenAdapter.createToken({
			user_id: crypto.randomUUID(), // Temporary ID until user registers
			email: validatedData.email,
			expires,
			type: 'registration'
		});

		logger.debug('Created token:', token);

		// Send invitation email
		const emailResponse = await fetch('/api/sendMail', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				email: validatedData.email,
				subject: 'Invitation to Register',
				message: 'You have been invited to register',
				templateName: 'userToken',
				props: {
					email: validatedData.email,
					role: role.name,
					token,
					expiresIn: validatedData.expiresIn,
					expiresInLabel: validatedData.expiresInLabel,
					languageTag: languageTag()
				}
			})
		});

		const emailResult = await emailResponse.json();
		logger.debug('Email API response:', { status: emailResponse.status, result: emailResult });

		if (!emailResponse.ok) {
			logger.error('Failed to send invitation email', {
				email: validatedData.email,
				status: emailResponse.status,
				result: emailResult
			});
			// Delete the token if email fails
			await tokenAdapter.consumeToken(token);
			throw error(500, { message: emailResult.error || 'Failed to send invitation email' });
		}

		logger.info('Token created and email sent successfully', {
			email: validatedData.email,
			role: role.name,
			expiresIn: validatedData.expiresInLabel
		});

		// Return success response
		return json({
			success: true,
			message: 'Token created and email sent successfully'
		});
	} catch (err: any) {
		// If it's already a SvelteKit error response, pass it through
		if (err.status && err.body) {
			throw err;
		}

		logger.error('Error in createToken API:', {
			message: err.message,
			stack: err.stack,
			details: err
		});

		// Return a formatted error response
		throw error(500, {
			message: err.message || 'An internal server error occurred'
		});
	}
};
