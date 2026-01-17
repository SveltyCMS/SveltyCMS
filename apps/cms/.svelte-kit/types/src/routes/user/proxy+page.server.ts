// @ts-nocheck
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
 * - Form handling
 * - Error logging and handling
 *
 * Usage:
 * This file is used as the server-side counterpart for the user page in a SvelteKit application.
 * It prepares data and handles form validation for the client-side rendering.
 */

import type { PageServerLoad } from './$types';

// Auth
import { auth } from '@shared/database/db';
import type { Role, User } from '@shared/database/auth/types';
import type { PermissionConfig } from '@shared/database/auth/permissions';

// System Logger
import { getUntypedSetting } from '@shared/services/settingsService';
import { logger } from '@shared/utils/logger.server';

export const load = async (event: Parameters<PageServerLoad>[0]) => {
	try {
		const user: User | null = event.locals.user;
		const roles: Role[] = event.locals.roles || [];
		const isFirstUser: boolean = event.locals.isFirstUser;
		const hasManageUsersPermission: boolean = event.locals.hasManageUsersPermission;

		// If user or roles are missing, log details and return fallback response
		if (!user) {
			logger.warn('User object missing in event.locals. Returning fallback response.', {
				request: event.request.url
			});
			return {
				user: null,
				roles: [],
				isFirstUser: false,
				is2FAEnabledGlobal: Boolean(getUntypedSetting('USE_2FA')),
				manageUsersPermissionConfig: {
					contextId: 'config/userManagement',
					requiredRole: 'admin',
					action: 'manage',
					contextType: 'system'
				},
				adminData: null,
				permissions: {
					'config/adminArea': { hasPermission: false }
				},
				error: 'User session not found. Please log in again.'
			};
		}

		// Determine admin status properly by checking role
		const userRole = roles.find((role) => role._id === user?.role);
		const isAdmin = Boolean(userRole?.isAdmin);

		// Always fetch fresh user data from database to ensure we have the latest changes
		// This is especially important after profile updates
		let freshUser: User | null = null;
		if (user?._id && auth) {
			freshUser = await auth.getUserById(user._id.toString());
			if (freshUser) {
				logger.debug('Fresh user data fetched for user page', {
					userId: freshUser._id,
					username: freshUser.username,
					email: freshUser.email
				});
			}
		}

		// Fallback to session user if database fetch fails
		if (!freshUser) {
			freshUser = user;
		}

		// Prepare user object for return, ensuring _id is a string and including admin status
		const safeUser = freshUser
			? {
					...freshUser,
					_id: freshUser._id.toString(),
					password: '[REDACTED]', // Ensure password is not sent to client
					isAdmin // Add the properly calculated admin status
				}
			: null;

		// Admin data will now be fetched on-demand via API endpoints
		// This improves initial page load performance significantly
		let adminData = null;

		if (isAdmin || hasManageUsersPermission) {
			// No longer pre-loading allUsers and allTokens here
			// The AdminArea component will fetch this data via API calls
			adminData = {
				users: [], // Empty arrays - data loaded on demand
				tokens: []
			};
		}

		// Provide manageUsersPermissionConfig to the client
		const manageUsersPermissionConfig: PermissionConfig = {
			contextId: 'config/userManagement',
			action: 'manage',
			contextType: 'system',
			name: 'User Management',
			description: 'Manage user accounts and roles'
		};

		// Return data to the client
		return {
			user: safeUser,
			roles: roles.map((role) => ({
				...role,
				_id: role._id.toString()
			})),
			isFirstUser,
			is2FAEnabledGlobal: Boolean(getUntypedSetting('USE_2FA')),
			manageUsersPermissionConfig,
			adminData,
			permissions: {
				'config/adminArea': { hasPermission: isAdmin || hasManageUsersPermission }
			},
			isAdmin // Pass isAdmin to client for PermissionGuard
		};
	} catch (err) {
		// Log error with an error code and more details
		logger.error('Error during load function (ErrorCode: USER_LOAD_500):', err);
		return {
			user: null,
			roles: [],
			isFirstUser: false,
			is2FAEnabledGlobal: false,
			manageUsersPermissionConfig: {
				contextId: 'config/userManagement',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'system'
			},
			adminData: null,
			permissions: {
				'config/adminArea': { hasPermission: false }
			},
			isAdmin: false,
			error: 'Internal Server Error. Please try again later.'
		};
	}
};
