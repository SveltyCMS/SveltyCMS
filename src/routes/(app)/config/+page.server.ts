/**
 * @file src/routes/(app)/config/+page.server.ts
 * @description Server-side logic for Config page authentication and authorization.
 *
 * SECURITY ARCHITECTURE (Layer 2 of 3):
 * This provides fine-grained permission checking for UI elements.
 * Works with:
 * - Layer 1: hooks.server.ts (API/route protection)
 * - Layer 2: This file (page-level authorization)
 * - Layer 3: PermissionGuard.svelte (UI visibility control)
 */

import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Auth
import { hasPermissionByAction } from '@src/auth/permissions';
import { permissionConfigs } from '@src/auth/permissions';
import { permissions as allPermissions } from '@src/auth/permissions';
import { roles } from '@root/config/roles';

// System Logger
import { logger } from '@utils/logger.svelte';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const { user } = locals;

		if (!user) {
			logger.warn('User not authenticated, redirecting to login');
			throw redirect(302, '/login');
		}

		logger.debug(`User session validated successfully for user: \x1b[34m${user._id}\x1b[0m`);

		if (!user.role) {
			const message = `User role is missing for user \x1b[34m${user.email}\x1b[0m`;
			logger.warn(message);
			throw error(403, message);
		}

		// Check if user is admin (for UI optimization)
		const userRole = roles.find((role) => role._id === user.role);
		const isAdmin = userRole?.isAdmin === true;

		const serializableUser = {
			_id: user._id.toString(),
			username: user.username,
			email: user.email,
			role: user.role,
			permissions: user.permissions
		};

		// Fine-grained permission checking for each config item
		// This allows enterprise-level control where each setting group,
		// menu item, or feature can have individual permissions assigned
		const permissions: Record<string, { hasPermission: boolean; isRateLimited?: boolean }> = {};

		for (const key in permissionConfigs) {
			const config = permissionConfigs[key];

			// Admin bypass for efficiency (admins have all permissions)
			if (isAdmin) {
				permissions[config.contextId] = { hasPermission: true, isRateLimited: false };
			} else {
				// Check user permission for non-admin roles
				// This supports fine-grained permissions like:
				// - config:settings:cache
				// - config:settings:database
				// - config:settings:email
				// etc.
				const permissionCheck = await hasPermissionByAction(serializableUser, config);
				permissions[config.contextId] = {
					hasPermission: permissionCheck.hasPermission,
					isRateLimited: permissionCheck.isRateLimited
				};
			}
		}

		return {
			user: serializableUser,
			permissions,
			permissionConfigs,
			allPermissions,
			isAdmin
		};
	} catch (err) {
		if (err instanceof Error && 'status' in err) {
			// This is likely a redirect or an error we've already handled
			throw err;
		}
		const message = `Error in load function: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
};
