/**
 * @file src/routes/api/permissions.ts
 * @description Centralized, middleware-style permission checker for API endpoints.
 *
 *  Features:
 *    * Handles authentication, admin overrides, and collection-specific permissions.
 *    * Provides a clean withPermissions factory to reduce boilerplate in endpoints
 *    * Secure-by-default policy (denies access if permissions are not explicitly granted)
 */

import type { User, Schema, Role } from '@src/auth/types';
import { contentManager } from '@src/content/ContentManager';
import { error } from '@sveltejs/kit';
import { roles } from '@root/config/roles';

export interface PermissionContext {
	collection?: string;
	action: 'read' | 'write' | 'create' | 'update' | 'delete';
	resource?: string; // For non-collection resources like system endpoints
}

async function checkApiPermission(
	user: User | null | undefined,
	context: PermissionContext,
	availableRoles?: Role[]
): Promise<{ hasPermission: boolean; error?: string }> {
	if (!user) {
		return { hasPermission: false, error: 'Authentication required' };
	}

	// Admin override - check role for admin status
	// Use provided roles or fall back to imported roles
	const rolesToUse = availableRoles && availableRoles.length > 0 ? availableRoles : roles;
	const userRole = rolesToUse.find((role) => role._id === user.role);
	const isAdmin = userRole?.isAdmin === true;
	if (isAdmin) {
		return { hasPermission: true };
	}

	// Collection-specific permissions
	if (context.collection) {
		const schema = contentManager.getCollectionById(context.collection);
		if (!schema) {
			return { hasPermission: false, error: 'Collection not found' };
		}

		// Determine the required permission group ('read' or 'write')
		const requiredPermission = context.action === 'read' ? 'read' : 'write';

		const userRolePermissions = schema.permissions?.[user.role];

		// **Refinement: Default to deny**
		// If no permissions are set for the user's role, deny access.
		if (!userRolePermissions) {
			return {
				hasPermission: false,
				error: `Your role has no defined permissions for the '${context.collection}' collection.`
			};
		}

		// Check if the required permission is explicitly not false
		const hasAccess = userRolePermissions[requiredPermission] !== false;

		if (!hasAccess) {
			return {
				hasPermission: false,
				error: `Insufficient permissions for '${requiredPermission}' on '${context.collection}'`
			};
		}
	}

	// Fallback for non-collection resources (system endpoints, etc.)
	if (context.resource) {
		// Check for specific resource permissions
		const requiredPermission = `${context.resource}:${context.action}`;
		const hasPermission =
			user.permissions?.includes(requiredPermission) ||
			user.permissions?.includes(`${context.resource}:*`) ||
			user.permissions?.includes('system:admin');

		if (!hasPermission) {
			return {
				hasPermission: false,
				error: `Insufficient permissions for '${context.action}' on resource '${context.resource}'`
			};
		}
	}

	return { hasPermission: true };
}

/**
 * Helper function for checking collection permissions (used by existing endpoints)
 */
export async function hasCollectionPermission(user: User, action: 'read' | 'write', schema: Schema, availableRoles?: Role[]): Promise<boolean> {
	const result = await checkApiPermission(user, { collection: schema._id || schema.name, action }, availableRoles);
	return result.hasPermission;
}

// Export the main permission checker for direct use
export { checkApiPermission };

/**
 * Higher-order function that generates a permission-checking middleware.
 * Throws a SvelteKit error if permission is denied.
 * @param context The permission context to check against.
 */
export function withPermissions(context: PermissionContext) {
	return async (user: User | null | undefined): Promise<User> => {
		const result = await checkApiPermission(user, context);
		if (!result.hasPermission) {
			// Use 401 for unauthenticated, 403 for unauthorized
			const statusCode = !user ? 401 : 403;
			throw error(statusCode, result.error || 'Forbidden');
		}
		// If check passes, we know user is not null, so we assert the type.
		return user as User;
	};
}
