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
import { dev } from '$app/environment';

// Auth
import { TokenAdapter } from '@src/auth/mongoDBAuth/tokenAdapter';
import { checkUserPermission } from '@src/auth/permissionCheck';
import { auth } from '@src/databases/db';

// System Logger
import { logger } from '@utils/logger.svelte';

// Input validation
import { addUserTokenSchema } from '@utils/formSchemas';
import { parse } from 'valibot';

// Roles
import { roles } from '@root/config/roles';
// ParaglideJS
import { languageTag } from '@src/paraglide/runtime';

// Error interface for better type safety
interface ApiError extends Error {
	status?: number;
	body?: {
		message: string;
		[key: string]: unknown;
	};
}

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
	try {
		// Check if the user has permission to create tokens
		const hasPermission = checkUserPermission('user.create', locals.user);

		if (!hasPermission) {
			throw error(403, 'Unauthorized to create registration tokens');
		}

		const body = await request.json();
		logger.debug('Received token creation request:', body);

		// Validate input using the existing schema
		const validatedData = parse(addUserTokenSchema, body);
		logger.debug('Validated data:', validatedData);

		const tokenAdapter = new TokenAdapter();

		// Check if a token already exists for this email
		const existingTokens = await tokenAdapter.getAllTokens({ email: validatedData.email });
		if (existingTokens && existingTokens.length > 0) {
			logger.warn('Token already exists for email:', validatedData.email);
			throw error(400, { message: 'A registration token already exists for this email' });
		}

		// Get expiration hours from the validated data
		let expiresInHours = validatedData.expiresIn;
		if (typeof expiresInHours === 'string') {
			// Convert string format (e.g. '7d') to hours
			const unit = expiresInHours.slice(-1);
			const value = parseInt(expiresInHours.slice(0, -1));

			switch (unit) {
				case 'h': expiresInHours = value; break;
				case 'd': expiresInHours = value * 24; break;
				default: expiresInHours = 168; // Default 7 days
			}
		}

		if (isNaN(expiresInHours)) {
			throw error(400, { message: 'Invalid expiration time' });
		}
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
					username: validatedData.user_id,
					email: validatedData.email,
					role: role.name, // Send role name instead of ID
					token: token,
					tokenLink: `${dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD}/login?regToken=${token}`,
					expiresIn: expiresInHours,
					expiresInLabel: `${Math.floor(expiresInHours / 24)} days`,
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
	} catch (err: unknown) {
		// Type guard for API errors
		const apiError = err as ApiError;

		// If it's already a SvelteKit error response, pass it through
		if (apiError.status && apiError.body) {
			throw apiError;
		}

		logger.error('Error in createToken API:', {
			message: apiError.message,
			stack: apiError.stack,
			details: apiError
		});

		// Return a formatted error response
		throw error(500, {
			message: apiError.message || 'An internal server error occurred'
		});
	}
};
