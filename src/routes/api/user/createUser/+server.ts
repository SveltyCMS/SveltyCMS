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

// Types
import type { ISODateString } from '@src/content/types';
// Auth and permission helpers
import { auth } from '@src/databases/db';
import { getPrivateSettingSync } from '@src/services/settingsService';
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';
// System Logger
import { logger } from '@utils/logger.server';

// Input validation
import { check, email, forward, object, optional, parse, pipe, string } from 'valibot';

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
const createUserSchema = pipe(
	object({
		email: pipe(string(), email('Please provide a valid email address.')),
		role: string('A role ID must be provided.'),
		username: optional(string()),
		password: string(),
		confirmPassword: optional(string()),
		createSession: optional(string()) // Optional: '1h', '1d', '7d', '30d', '90d' - session duration
	}),
	forward(
		check((input) => !input.confirmPassword || input.password === input.confirmPassword, 'Passwords do not match.'),
		['confirmPassword']
	)
);

export const POST: RequestHandler = apiHandler(async ({ request, locals }) => {
	const { user, tenantId, hasAdminPermission } = locals; // Destructure user and tenantId from locals

	// SECURITY: Ensure only admins can create users directly
	if (!(user && hasAdminPermission)) {
		logger.warn('Unauthorized attempt to create user', { byUser: user?._id, tenantId });
		throw new AppError('Forbidden: Only administrators can create users.', 403, 'FORBIDDEN_ADMIN');
	}

	if (!auth) {
		logger.error('Authentication system is not initialized');
		throw new AppError('Internal Server Error: Auth system not initialized', 500, 'AUTH_SYS_ERROR');
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
		throw new AppError('A user with this email address already exists in this tenant.', 409, 'USER_EXISTS');
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

		if (!(result.success && result.data)) {
			const errorMessage = !result.success && 'error' in result ? result.error?.message : 'Failed to create user and session';
			throw new AppError(errorMessage || 'Failed to create user and session', 500, 'CREATE_FAILED');
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
});
