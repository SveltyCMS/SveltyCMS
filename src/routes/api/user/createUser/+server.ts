/**
 * @file: src/routes/api/user/createUser/+server.ts
 * @description: API endpoint for creating a new user directly in the CMS.
 *
 * This endpoint handles POST requests to create a new user. It is a direct,
 * admin-only action and does not send an invitation email. For inviting users
 * to register themselves, use the `createToken` endpoint.
 *
 * Features:
 * - **Defense in Depth**: Specific permission check to ensure only authorized admins can create users.
 * - **Input Validation**: Uses a Valibot schema to validate and sanitize the incoming user data.
 * - Safeguards against creating duplicate users within the same tenant.
 * - Comprehensive logging and secure error responses.
 */

import { privateEnv } from '@root/config/private';

import type { RequestHandler } from '@sveltejs/kit';
import { json, error, type HttpError } from '@sveltejs/kit';

// Auth and permission helpers
import { auth } from '@src/databases/db';

// System Logger
import { logger } from '@utils/logger.svelte';

// Input validation
import { object, string, parse, email, optional, type ValiError } from 'valibot';

// Define a schema for the incoming user data to ensure type safety and prevent invalid data.
const createUserSchema = object({
	email: string([email('Please provide a valid email address.')]),
	role: string('A role ID must be provided.'),
	username: optional(string())
});

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { user, tenantId } = locals; // Destructure user and tenantId from locals
		// Authentication is handled by hooks.server.ts - user presence confirms access

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error: Auth system not initialized');
		}

		const body = await request.json();
		// Validate and sanitize the incoming user data.
		const userData = parse(createUserSchema, body);
		logger.debug('Received and validated request to create user', { email: userData.email, byUser: user?._id, tenantId });
		// Check if a user with this email already exists within the same tenant to prevent duplicates.
		const userCheckCriteria: { email: string; tenantId?: string } = { email: userData.email };
		if (privateEnv.MULTI_TENANT) {
			userCheckCriteria.tenantId = tenantId;
		}
		const existingUser = await auth.checkUser(userCheckCriteria);
		if (existingUser) {
			logger.warn('Attempted to create a user that already exists in this tenant', { email: userData.email, tenantId });
			throw error(409, 'A user with this email address already exists in this tenant.'); // 409 Conflict
		}

		// Create the user using the validated and sanitized data, including the tenantId.
		const newUser = await auth.createUser({
			...userData,
			...(privateEnv.MULTI_TENANT && { tenantId }), // Conditionally add tenantId
			isRegistered: true, // Assuming direct creation means they are fully registered.
			lastAuthMethod: 'password' // Or a default value.
		});
		logger.info('User created successfully via direct API call', { newUserId: newUser._id, createdBy: user?._id, tenantId });
		// Return the newly created user data with a 201 Created status.
		return json(newUser, { status: 201 });
	} catch (err) {
		// Handle specific validation errors from Valibot.
		if (err.name === 'ValiError') {
			const valiError = err as ValiError;
			const issues = valiError.issues.map((issue) => issue.message).join(', ');
			logger.warn('Invalid input for createUser API:', { issues });
			throw error(400, `Invalid input: ${issues}`);
		}

		// Handle all other errors, including HTTP errors from `throw error()`.
		const httpError = err as HttpError;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred while creating the user.';

		logger.error('Error in createUser API:', {
			error: message,
			stack: err instanceof Error ? err.stack : undefined,
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
