/**
 * @file src/routes/api/user/index.ts
 * @description API endpoints for user management.
 *
 * This module provides functionality to:
 * - Retrieve all users (GET)
 * - Create a new user and send a token via email (POST)
 *
 * Features:
 * - User retrieval
 * - User creation with role assignment
 * - Token generation with configurable expiration
 * - Email notification for new users
 * - Form validation using superforms
 * - Error handling and logging
 *
 * Usage:
 * GET /api/user - Retrieve all users
 * POST /api/user - Create a new user
 *   Body: JSON object with 'email', 'role', and 'expiresIn' properties
 *
 * Note: Ensure proper authentication and authorization for these endpoints.
 * The email sending functionality should be properly implemented and secured.
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { auth } from '@src/databases/db';
import { superValidate } from 'sveltekit-superforms/server';
import { addUserTokenSchema } from '@utils/formSchemas';
import { valibot } from 'sveltekit-superforms/adapters';
import { error } from '@sveltejs/kit';
// System Logger
import { logger } from '@utils/logger.svelte';

export const GET: RequestHandler = async () => {
	try {
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		const users = await auth.getAllUsers();
		logger.info('Fetched users successfully', { count: users.length });
		return json(users);
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Error fetching users:', { error: errorMessage });
		throw error(500, 'Internal Server Error');
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		const addUserForm = await superValidate(request, valibot(addUserTokenSchema));
		if (!addUserForm.valid) {
			logger.warn('Invalid form data received');
			return json({ form: addUserForm, message: 'Invalid form data' }, { status: 400 });
		}

		const { email, role, expiresIn } = addUserForm.data;
		logger.info('Received request to create user', { email, role });

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
			logger.warn('User already exists', { email });
			return json({ message: 'User already exists' }, { status: 400 });
		}

		const newUser = await auth.createUser({ email, role, lastAuthMethod: 'password', isRegistered: false });
		const expiresAt = new Date(Date.now() + expirationTime * 1000);
		const token = await auth.createToken(newUser._id, expiresAt);

		logger.info('User created successfully', { userId: newUser._id });

		// Send the token via email
		await sendUserToken(email, token, role, expirationTime);

		return json(newUser);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Error creating user', { error: errorMessage });
		return json({ success: false, error: `Error creating user: ${errorMessage}` }, { status: 500 });
	}
};

async function sendUserToken(email: string, token: string, role: string, expiresIn: number) {
	try {
		const response = await fetch('/api/sendMail', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email,
				subject: 'User Token',
				message: 'User Token',
				templateName: 'userToken',
				props: { email, token, role, expiresIn }
			})
		});

		if (!response.ok) {
			throw Error(`Failed to send email: ${response.statusText}`);
		}

		logger.info('User token email sent successfully', { email });
	} catch (error) {
		logger.error('Error sending user token email', { error, email });
		throw error;
	}
}
