/**
 * @file src/routes/api/user/index.ts
 * @description API endpoints for user management.
 *
 * This module provides functionality to:
 * - Retrieve all users (GET)
 * - Create a new user and send a token via email (POST)
 *
 * Features:
 * - **Defense in Depth**: Specific permission checks for both GET and POST.
 * - User creation with role assignment and email notification.
 * - Form validation using superforms.
 * - Error handling and logging.
 *
 * Usage:
 * GET /api/user - Retrieve all users (requires 'read:user:all' permission)
 * POST /api/user - Create a new user (requires 'create:user:any' permission)
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { auth } from '@src/databases/db';
import { superValidate } from 'sveltekit-superforms/server';
import { addUserTokenSchema } from '@utils/formSchemas';
import { valibot } from 'sveltekit-superforms/adapters';
import { error, type HttpError } from '@sveltejs/kit';

// Auth and permission helpers
import { hasPermissionByAction } from '@src/auth/permissions';
import { roles } from '@root/config/roles';

// System Logger
import { logger } from '@utils/logger.svelte';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		// **SECURITY**: Check for specific 'read:user:all' permission.
		// This prevents any user who gets past the hook from listing all other users.
		// It ensures only users with explicit rights can access this sensitive data.
		const hasPermission = hasPermissionByAction(
			locals.user,
			'read',
			'user',
			'all',
			locals.roles && locals.roles.length > 0 ? locals.roles : roles
		);

		if (!hasPermission) {
			logger.warn('Unauthorized attempt to list all users', { userId: locals.user?._id });
			throw error(403, 'Forbidden: You do not have permission to list users.');
		}

		const users = await auth.getAllUsers();
		logger.info('Fetched all users successfully', { count: users.length, requestedBy: locals.user?._id });
		return json(users);
	} catch (err) {
		const httpError = err as HttpError;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'Internal Server Error';
		logger.error('Error fetching users:', { error: message, status });
		throw error(status, message);
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		// **SECURITY**: Check for specific 'create:user:any' permission.
		// This ensures only true administrators can create new user accounts.
		const hasPermission = hasPermissionByAction(
			locals.user,
			'create',
			'user',
			'any',
			locals.roles && locals.roles.length > 0 ? locals.roles : roles
		);

		if (!hasPermission) {
			logger.warn('Unauthorized attempt to create a user', { userId: locals.user?._id });
			throw error(403, 'Forbidden: You do not have permission to create users.');
		}

		const addUserForm = await superValidate(request, valibot(addUserTokenSchema));
		if (!addUserForm.valid) {
			logger.warn('Invalid form data for user creation', { errors: addUserForm.errors });
			return json({ form: addUserForm, message: 'Invalid form data' }, { status: 400 });
		}

		const { email, role, expiresIn } = addUserForm.data;
		logger.info('Request to create user received', { email, role, requestedBy: locals.user?._id });

		const expirationTimes: Record<string, number> = {
			'2 hrs': 7200,
			'12 hrs': 43200,
			'2 days': 172800,
			'1 week': 604800
		};

		const expirationTime = expirationTimes[expiresIn];
		if (!expirationTime) {
			logger.warn('Invalid value for token validity', { expiresIn });
			return json({ form: addUserForm, message: 'Invalid value for token validity' }, { status: 400 });
		}

		const existingUser = await auth.checkUser({ email });
		if (existingUser) {
			logger.warn('Attempted to create a user that already exists', { email });
			return json({ message: 'User already exists' }, { status: 409 }); // 409 Conflict
		}

		const newUser = await auth.createUser({
			email,
			role,
			lastAuthMethod: 'password',
			isRegistered: false
		});
		const expiresAt = new Date(Date.now() + expirationTime * 1000);
		const token = await auth.createToken(newUser._id, expiresAt);

		logger.info('User created successfully', { userId: newUser._id });

		// Send token via email. Pass the request origin for server-side fetch.
		await sendUserToken(request.url.origin, email, token, role, expirationTime);

		return json(newUser, { status: 201 }); // 201 Created
	} catch (err) {
		const httpError = err as HttpError;
		const status = httpError.status || 500;
		const message = httpError.body?.message || `Error creating user: ${err.message}`;
		logger.error('Error creating user', { error: message, status });
		return json({ success: false, error: message }, { status });
	}
};

/**
 * Sends a user token via the sendMail API.
 * @param origin - The origin of the request (e.g., 'http://localhost:5173') for server-side fetch.
 */
async function sendUserToken(origin: string, email: string, token: string, role: string, expiresIn: number) {
	try {
		const response = await fetch(`${origin}/api/sendMail`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email,
				subject: 'You have been invited to join',
				message: 'User Token',
				templateName: 'userToken',
				props: { email, token, role, expiresIn }
			})
		});

		if (!response.ok) {
			const errorBody = await response.text();
			throw new Error(`Failed to send email: ${response.statusText} - ${errorBody}`);
		}

		logger.info('User token email sent successfully', { email });
	} catch (err) {
		logger.error('Error sending user token email', { error: err.message, email });
		// Re-throw the error to be caught and handled by the main POST handler.
		throw err;
	}
}

