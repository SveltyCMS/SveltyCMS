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
 * - **Optimized Session Creation**: Optionally creates user and session in single database transaction
 * - Safeguards against creating duplicate users within the same tenant.
 * - Comprehensive logging and secure error responses.
 *
 * @example
 * // Create user only
 * POST /api/user/createUser
 * { "email": "user@example.com", "role": "user", "password": "secret" }
 *
 * // Create user with session (optimized single transaction)
 * POST /api/user/createUser
 * { "email": "user@example.com", "role": "user", "password": "secret", "createSession": "7d" }
 * // Returns: { ...userData, sessionId: "...", sessionExpires: "..." }
 */

import { getPrivateSettingSync } from '@src/services/settingsService';

import type { RequestHandler } from '@sveltejs/kit';
import { error, json, type HttpError } from '@sveltejs/kit';

// Auth and permission helpers
import { auth } from '@src/databases/db';

// Types
import type { ISODateString } from '@src/content/types';

// System Logger
import { logger } from '@utils/logger.server';

// Input validation
import { email, object, optional, parse, pipe, string } from 'valibot';

// Helper function to parse session duration strings
function parseSessionDuration(duration: string): number {
	const durationMap: Record<string, number> = {
		'1h': 60 * 60 * 1000, // 1 hour
		'1d': 24 * 60 * 60 * 1000, // 1 day
		'7d': 7 * 24 * 60 * 60 * 1000, // 7 days
		'30d': 30 * 24 * 60 * 60 * 1000, // 30 days
		'90d': 90 * 24 * 60 * 60 * 1000 // 90 days
	};

	return durationMap[duration] || durationMap['7d']; // Default to 7 days
}

// Define a schema for the incoming user data to ensure type safety and prevent invalid data.
const createUserSchema = object({
	email: pipe(string(), email('Please provide a valid email address.')),
	role: string('A role ID must be provided.'),
	username: optional(string()),
	password: string(),
	createSession: optional(string()) // Optional: '1h', '1d', '7d', '30d', '90d' - session duration
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
		if (getPrivateSettingSync('MULTI_TENANT')) {
			userCheckCriteria.tenantId = tenantId;
		}
		const existingUser = await auth.checkUser(userCheckCriteria);
		if (existingUser) {
			logger.warn('Attempted to create a user that already exists in this tenant', { email: userData.email, tenantId });
			throw error(409, 'A user with this email address already exists in this tenant.'); // 409 Conflict
		}

		// Check if session creation is requested
		const shouldCreateSession = !!userData.createSession;

		if (shouldCreateSession) {
			// Use optimized createUserAndSession for single database transaction
			const sessionDuration = parseSessionDuration(userData.createSession || '7d');
			const expires = new Date(Date.now() + sessionDuration).toISOString() as ISODateString;

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

			// Return user data with session info
			return json(
				{
					...result.data.user,
					sessionId: result.data.session._id,
					sessionExpires: result.data.session.expires
				},
				{ status: 201 }
			);
		}

		// Create the user without session (original behavior)
		const newUser = await auth.createUser({
			...userData,
			...(getPrivateSettingSync('MULTI_TENANT') && { tenantId }), // Conditionally add tenantId
			isRegistered: true, // Assuming direct creation means they are fully registered.
			lastAuthMethod: 'password' // Or a default value.
		});
		logger.info('User created successfully via direct API call', { newUserId: newUser._id, createdBy: user?._id, tenantId });
		// Return the newly created user data with a 201 Created status.
		return json(newUser, { status: 201 });
	} catch (err) {
		// Handle specific validation errors from Valibot.
		if (err instanceof Error && err.name === 'ValiError') {
			const valiError = err as unknown as { issues: Array<{ message: string }> };
			const issues = valiError.issues.map((issue: { message: string }) => issue.message).join(', ');
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
