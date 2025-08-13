/**
 * @file src/routes/api/user/index.ts
 * @description API endpoints for user management.
 *
 * This module provides functionality to:
 * - Retrieve all users for the current tenant (GET)
 * - Create a new user within the current tenant and send a token via email (POST)
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
import { privateEnv } from '@root/config/private';

// Auth and permission helpers

// System Logger
import { logger } from '@utils/logger.svelte';

export const GET: RequestHandler = async ({ locals }) => {
	const { user, tenantId } = locals;
	try {
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		if (privateEnv.MULTI_TENANT && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		} // **SECURITY**: Check permissions for listing users

		// Authentication is handled by hooks.server.ts - user presence confirms access		const filter = privateEnv.MULTI_TENANT ? { tenantId } : {};
		const users = await auth.getAllUsers({ filter });
		logger.info('Fetched all users successfully', { count: users.length, requestedBy: user?._id, tenantId });
		return json(users);
	} catch (err) {
		const httpError = err as HttpError;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'Internal Server Error';
		logger.error('Error fetching users:', { error: message, status, tenantId });
		throw error(status, message);
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user, tenantId } = locals;
	try {
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		if (privateEnv.MULTI_TENANT && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		} // **SECURITY**: Authentication is handled by hooks.server.ts - user presence confirms access

		const addUserForm = await superValidate(request, valibot(addUserTokenSchema));
		if (!addUserForm.valid) {
			logger.warn('Invalid form data for user creation', { errors: addUserForm.errors, tenantId });
			return json({ form: addUserForm, message: 'Invalid form data' }, { status: 400 });
		}

		const { email, role, expiresIn } = addUserForm.data;
		logger.info('Request to create user received', { email, role, requestedBy: user?._id, tenantId });

		const expirationTimes: Record<string, number> = {
			'2 hrs': 7200,
			'12 hrs': 43200,
			'2 days': 172800,
			'1 week': 604800
		};

		const expirationTime = expirationTimes[expiresIn];
		if (!expirationTime) {
			logger.warn('Invalid value for token validity', { expiresIn, tenantId });
			return json({ form: addUserForm, message: 'Invalid value for token validity' }, { status: 400 });
		}

		const checkCriteria: { email: string; tenantId?: string } = { email };
		if (privateEnv.MULTI_TENANT) {
			checkCriteria.tenantId = tenantId;
		}
		const existingUser = await auth.checkUser(checkCriteria);
		if (existingUser) {
			logger.warn('Attempted to create a user that already exists in this tenant', { email, tenantId });
			return json({ message: 'User already exists in this tenant' }, { status: 409 }); // 409 Conflict
		}

		const newUser = await auth.createUser({
			email,
			role,
			...(privateEnv.MULTI_TENANT && { tenantId }),
			lastAuthMethod: 'password',
			isRegistered: false
		});
		const expiresAt = new Date(Date.now() + expirationTime * 1000);
		const token = await auth.createToken(newUser._id, expiresAt, tenantId);

		logger.info('User created successfully', { userId: newUser._id, tenantId }); // Send token via email. Pass the request origin for server-side fetch.

		await sendUserToken(request.url.origin, email, token, role, expirationTime);

		return json(newUser, { status: 201 }); // 201 Created
	} catch (err) {
		const httpError = err as HttpError;
		const status = httpError.status || 500;
		const message = httpError.body?.message || `Error creating user: ${err.message}`;
		logger.error('Error creating user', { error: message, status, tenantId });
		return json({ success: false, error: message }, { status });
	}
};

/**
 * Sends a user token via the sendMail API.
 * @param origin - The origin of the request (e.g., 'http://localhost:5173') for server-side fetch.
 */
async function sendUserToken(origin: string, email: string, token: string, role: string, expiresIn: number) {
	try {
		const inviteLink = `${origin}/login?invite_token=${token}`;

		const response = await fetch(`${origin}/api/sendMail`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email,
				subject: 'You have been invited to join',
				message: 'User Token',
				templateName: 'userToken',
				props: {
					role,
					tokenLink: inviteLink,
					expiresInLabel: expiresIn
				}
			})
		});

		if (!response.ok) {
			const errorBody = await response.text();
			throw new Error(`Failed to send email: ${response.statusText} - ${errorBody}`);
		}

		logger.info('User token email sent successfully', { email });
	} catch (err) {
		logger.error('Error sending user token email', { error: err.message, email }); // Re-throw the error to be caught and handled by the main POST handler.
		throw err;
	}
}
