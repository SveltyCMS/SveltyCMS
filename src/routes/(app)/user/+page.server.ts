/**
 * @file src/routes/(app)/user/+page.server.ts
 * @description Server-side logic for the user page in the application.
 *
 * This module handles the server-side operations for the user page, including:
 * - Form validation for adding users and changing passwords
 * - Preparing data for client-side rendering
 *
 * Features:
 * - User and role information retrieval from event.locals
 * - Form handling with Superforms
 * - Error logging and handling
 *
 * Usage:
 * This file is used as the server-side counterpart for the user page in a SvelteKit application.
 * It prepares data and handles form validation for the client-side rendering.
 */

import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Auth
import type { User, Role, Token } from '@src/auth/types';

// Superforms
import { superValidate } from 'sveltekit-superforms/server';
import { addUserTokenSchema, changePasswordSchema } from '@utils/formSchemas';
import { zod } from 'sveltekit-superforms/adapters';

// System Logger
import { logger } from '@utils/logger';

// Import the PermissionConfig type
import type { PermissionConfig } from '@src/auth/permissionCheck';

export const load: PageServerLoad = async (event) => {
	try {
		const user: User | null = event.locals.user;
		const roles: Role[] = event.locals.roles || [];
		const isFirstUser: boolean = event.locals.isFirstUser;
		const hasManageUsersPermission: boolean = event.locals.hasManageUsersPermission;

		logger.debug(`User from event.locals: ${JSON.stringify(user)}` );
		logger.debug(`Roles from event.locals: ${JSON.stringify(roles)}`);
		logger.debug(`Is first user: ${isFirstUser}`);
		logger.debug(`Has manage users permission: ${hasManageUsersPermission}`);
		logger.debug(`event ${JSON.stringify(event, null, 2)}`);

		const addUserForm = await superValidate(event, zod(addUserTokenSchema));
		const changePasswordForm = await superValidate(event, zod(changePasswordSchema));

		logger.debug(`addUserForm: ${JSON.stringify(addUserForm)}`);
		logger.debug(`changePasswordForm: ${JSON.stringify(changePasswordForm)}`);
		// Prepare user object for return, ensuring _id is a string
		const safeUser = user
			? {
					...user,
					_id: user._id.toString(),
					password: '[REDACTED]' // Ensure password is not sent to client
				}
			: null;

		let adminData = null;
		if (user?.isAdmin || hasManageUsersPermission) {
			const allUsers: User[] = event.locals?.allUsers ?? [];
			const allTokens: Token[] = event.locals?.allTokens?.tokens ?? [];

			// Format users and tokens for the admin area
			const formattedUsers = allUsers.map((user) => ({
				_id: user._id.toString(),
				blocked: user.blocked || false,
				avatar: user.avatar || null,
				email: user.email,
				username: user.username || null,
				role: user.role,
				activeSessions: user.lastActiveAt ? 1 : 0, // Placeholder for active sessions
				lastAccess: user.lastActiveAt ? new Date(user.lastActiveAt).toISOString() : null,
				createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
				updatedAt: user.updatedAt ? new Date(user.updatedAt).toISOString() : null
			}));

			const formattedTokens = allTokens.map((token) => ({
				user_id: token.user_id,
				blocked: false, // Assuming tokens don't have a 'blocked' status
				email: token.email || '',
				expiresIn: token.expires ? new Date(token.expires).toISOString() : null,
				createdAt: new Date(token.token_id).toISOString(), // Assuming token_id is a timestamp
				updatedAt: new Date(token.token_id).toISOString() // Assuming tokens are not updated
			}));

			adminData = {
				users: formattedUsers,
				tokens: formattedTokens
			};

			logger.debug(`Admin data prepared: ${JSON.stringify(adminData)}`);
		}

		// Provide manageUsersPermissionConfig to the client
		const manageUsersPermissionConfig: PermissionConfig = {
			contextId: 'config/userManagement',
			requiredRole: 'admin',
			action: 'manage',
			contextType: 'system'
		};

		logger.debug(
			`Returning data to client: user=${JSON.stringify(safeUser)}, roles=${JSON.stringify(roles)}, isFirstUser=${isFirstUser}, adminData=${JSON.stringify(adminData)}`
		);

		return {
			user: safeUser,
			roles: roles.map((role) => ({
				...role,
				_id: role._id.toString()
			})),
			addUserForm,
			changePasswordForm,
			isFirstUser,
			manageUsersPermissionConfig,
			adminData
		};
	} catch (err) {
		logger.error('Error during load function:', err);
		console.log(err)
		throw error(500, 'Internal Server Error');
	}
};
