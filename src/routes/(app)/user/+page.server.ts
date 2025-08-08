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

import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

// Auth
import type { User, Role, Token } from '@root/src/auth';
import type { PermissionConfig } from '@src/auth/permissions';

// Superforms
import { superValidate } from 'sveltekit-superforms/server';
import { addUserTokenSchema, changePasswordSchema } from '@utils/formSchemas';
import { valibot } from 'sveltekit-superforms/adapters';

// System Logger
import { logger } from '@utils/logger.svelte';

export const load: PageServerLoad = async (event) => {
	try {
		const user: User | null = event.locals.user;
		const roles: Role[] = event.locals.roles || [];
		const isFirstUser: boolean = event.locals.isFirstUser;
		const hasManageUsersPermission: boolean = event.locals.hasManageUsersPermission;

		// Determine admin status properly by checking role
		const userRole = roles.find((role) => role._id === user?.role);
		const isAdmin = Boolean(userRole?.isAdmin);

		// Get fresh user data from database to ensure we have the latest info
		let freshUser: User | null = user;
		if (user) {
			try {
				const { auth } = await import('@src/databases/db');
				if (auth) {
					freshUser = await auth.getUserById(user._id.toString());
				}
			} catch (error) {
				console.warn('Failed to fetch fresh user data, using session data:', error);
				freshUser = user; // Fallback to session data
			}
		}

		// Validate forms using SuperForms
		const addUserForm = await superValidate(event, valibot(addUserTokenSchema));
		const changePasswordForm = await superValidate(event, valibot(changePasswordSchema));

		// Prepare user object for return, ensuring _id is a string and including admin status
		const safeUser = freshUser
			? {
					...freshUser,
					_id: freshUser._id.toString(),
					password: '[REDACTED]', // Ensure password is not sent to client
					isAdmin // Add the properly calculated admin status
				}
			: null;

		let adminData = null;

		if (isAdmin || hasManageUsersPermission) {
			const allUsers: User[] = event.locals?.allUsers ?? [];
			const allTokens: Token[] = event.locals?.allTokens?.tokens ?? event.locals?.allTokens ?? [];

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
				_id: token._id || token.user_id,
				user_id: token.user_id,
				token: token.token || '',
				blocked: false, // This needs to be calculated based on expiration or a specific field if available
				email: token.email || '',
				role: token.role || 'user', // Ensure role is passed
				expires: token.expires ? new Date(token.expires).toISOString() : null,
				createdAt: token.createdAt ? new Date(token.createdAt).toISOString() : null,
				updatedAt: token.updatedAt ? new Date(token.updatedAt).toISOString() : null
			}));

			adminData = {
				users: formattedUsers,
				tokens: formattedTokens
			};
		}

		// Provide manageUsersPermissionConfig to the client
		const manageUsersPermissionConfig: PermissionConfig = {
			contextId: 'config/userManagement',
			requiredRole: 'admin',
			action: 'manage',
			contextType: 'system'
		};

		// Return data to the client
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
			adminData,
			permissions: {
				'config/adminArea': { hasPermission: isAdmin || hasManageUsersPermission }
			}
		};
	} catch (err) {
		// Log error with an error code
		logger.error('Error during load function (ErrorCode: USER_LOAD_500):', err);
		throw error(500, 'Internal Server Error');
	}
};
