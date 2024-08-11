/**
 * @file src/routes/(app)/user/+page.server.ts
 * @description Server-side logic for the user page in the application.
 *
 * This module handles the server-side operations for the user page, including:
 * - User authentication and session management
 * - Role retrieval
 * - Form validation for adding users and changing passwords
 * - First user detection
 *
 * Features:
 * - Session validation using cookies
 * - User and role information retrieval
 * - Form handling with Superforms
 * - Error logging and handling
 *
 * Usage:
 * This file is used as the server-side counterpart for the user page in a SvelteKit application.
 * It prepares data and handles authentication for the client-side rendering.
 */

import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Auth
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import type { User, Role } from '@src/auth/types';

// Superforms
import { superValidate } from 'sveltekit-superforms/server';
import { addUserTokenSchema, changePasswordSchema } from '@utils/formSchemas';
import { zod } from 'sveltekit-superforms/adapters';

// Logger
import logger from '@src/utils/logger';

export const load: PageServerLoad = async (event) => {
	try {
		const session_id = event.cookies.get(SESSION_COOKIE_NAME);
		logger.debug(`Session ID from cookie: ${session_id}`);

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		let user: User | null = null;
		let roles: Role[] = [];
		let isFirstUser = false;

		// Check if this is the first user, regardless of session
		const userCount = await auth.getUserCount();
		isFirstUser = userCount === 0;
		logger.debug(`Is first user: ${isFirstUser}`);

		if (session_id) {
			try {
				user = await auth.validateSession({ session_id });
				logger.debug(`User from session: ${JSON.stringify(user)}`);

				if (user) {
					roles = await auth.getAllRoles();
					logger.debug(`Roles retrieved: ${JSON.stringify(roles)}`);
				} else {
					logger.warn('Session is valid but user not found');
				}
			} catch (validationError) {
				logger.error(`Session validation error: ${(validationError as Error).message}`);
			}
		} else {
			logger.warn('No session found');
		}

		const addUserForm = await superValidate(event, zod(addUserTokenSchema));
		const changePasswordForm = await superValidate(event, zod(changePasswordSchema));

		// Prepare user object for return, ensuring _id is a string
		const safeUser = user
			? {
					...user,
					_id: user._id.toString(),
					password: '[REDACTED]' // Ensure password is not sent to client
				}
			: null;

		return {
			user: safeUser,
			roles: roles.map((role) => ({
				...role,
				_id: role._id.toString()
			})),
			addUserForm,
			changePasswordForm,
			isFirstUser
		};
	} catch (err) {
		logger.error('Error during load function:', err);
		return { user: null, roles: [], addUserForm: null, changePasswordForm: null, isFirstUser: false };
	}
};
