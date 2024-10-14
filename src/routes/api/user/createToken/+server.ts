/**
 * @file src/routes/api/user/createToken/+server.ts
 * @description API endpoint for creating user registration tokens and sending invitation emails
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
 * Usage:
 * This endpoint is used to create new registration tokens for inviting users to register and send invitation emails.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

// Auth
import { TokenAdapter } from '@src/auth/mongoDBAuth/tokenAdapter';
import { checkUserPermission } from '@src/auth/permissionCheck';

// System Logger
import { logger } from '@utils/logger';

// Input validation
import { addUserTokenSchema } from '@utils/formSchemas';

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

		// Validate input using the existing schema
		const validatedData = addUserTokenSchema.parse(body);

		const tokenAdapter = new TokenAdapter();

		// Parse the expiresIn string to get the number of hours
		const expiresInHours = parseInt(validatedData.expiresIn);
		if (isNaN(expiresInHours)) {
			throw error(400, 'Invalid expiresIn value');
		}

		// Calculate expiration date
		const expires = new Date();
		expires.setHours(expires.getHours() + expiresInHours);

		// Find the role object based on the role ID
		const role = roles.find((r) => r._id === validatedData.role);
		if (!role) {
			throw error(400, 'Invalid role');
		}

		// Check if user already exists
		const existingUser = await locals.auth.checkUser({ email: validatedData.email });
		if (existingUser) {
			throw error(400, 'User with this email already exists');
		}

		// Create a pending user with the specified role
		const pendingUser = await locals.auth.createUser({
			email: validatedData.email,
			role: role._id,
			permissions: role.permissions,
			isRegistered: false
		});

		if (!pendingUser || !pendingUser._id) {
			throw error(500, 'Failed to create pending user');
		}

		const token = await tokenAdapter.createToken({
			user_id: pendingUser._id,
			email: validatedData.email,
			expires,
			type: 'registration'
		});

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

		if (!emailResponse.ok) {
			logger.error('Failed to send invitation email', { email: validatedData.email, status: emailResponse.status });
			// Delete the pending user and token if email fails
			await locals.auth.deleteUser(pendingUser._id);
			await tokenAdapter.deleteToken(token);
			throw error(500, 'Failed to send invitation email');
		}

		logger.info('Registration token created and invitation sent successfully', {
			email: validatedData.email,
			role: validatedData.role,
			expiresIn: validatedData.expiresIn,
			expiresInLabel: validatedData.expiresInLabel
		});

		return json({
			success: true,
			token,
			email: validatedData.email,
			role: validatedData.role,
			expiresIn: validatedData.expiresIn,
			expiresInLabel: validatedData.expiresInLabel
		});
	} catch (err) {
		if (err.name === 'ZodError') {
			logger.warn('Invalid input for createToken API:', err.errors);
			throw error(400, 'Invalid input: ' + err.errors.map((e) => e.message).join(', '));
		}
		logger.error('Error in createToken API:', err);
		throw error(500, 'Failed to create registration token');
	}
};
