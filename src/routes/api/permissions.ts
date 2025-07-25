/**
 * @file src/routes/api/permissions.ts
 * @description Centralized, middleware-style permission checker for API endpoints.
 *
 * Features:
 * * Handles authentication, admin overrides, and collection-specific permissions.
 * * Provides a clean withPermissions factory to reduce boilerplate in endpoints
 * * Secure-by-default policy (denies access if permissions are not explicitly granted)
 */

import type { User, Schema, Role } from '@src/auth/types';
import { contentManager } from '@src/content/ContentManager';
import { error } from '@sveltejs/kit';
import { roles } from '@root/config/roles';
import { privateEnv } from '@root/config/private';

export interface PermissionContext {
	collection?: string;
	action: 'read' | 'write' | 'create' | 'update' | 'delete';
	resource?: string; // For non-collection resources like system endpoints
}

async function checkApiPermission(
	user: User | null | undefined,
	context: PermissionContext,
	availableRoles?: Role[],
	tenantId?: string
): Promise<{ hasPermission: boolean; error?: string }> {
	if (!user) {
		return { hasPermission: false, error: 'Authentication required' };
	} // Admin override - check role for admin status

	const rolesToUse = availableRoles && availableRoles.length > 0 ? availableRoles : roles;
	const userRole = rolesToUse.find((role) => role._id === user.role);
	const isAdmin = userRole?.isAdmin === true;
	if (isAdmin) {
		return { hasPermission: true };
	} // Collection-specific permissions

	if (context.collection) {
		// In multi-tenant mode, a tenantId is required to look up the correct collection schema.
		if (privateEnv.MULTI_TENANT && !tenantId) {
			return { hasPermission: false, error: 'Tenant could not be identified for this operation.' };
		}
		const schema = await contentManager.getCollectionById(context.collection, tenantId);
		if (!schema) {
			return { hasPermission: false, error: 'Collection not found' };
		}

		const requiredPermission = context.action === 'read' ? 'read' : 'write';
		const userRolePermissions = schema.permissions?.[user.role];

		if (!userRolePermissions) {
			return {
				hasPermission: false,
				error: `Your role has no defined permissions for the '${context.collection}' collection.`
			};
		}

		const hasAccess = userRolePermissions[requiredPermission] !== false;

		if (!hasAccess) {
			return {
				hasPermission: false,
				error: `Insufficient permissions for '${requiredPermission}' on '${context.collection}'`
			};
		}
	} // Fallback for non-collection resources (system endpoints, etc.)

	if (context.resource) {
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
export async function hasCollectionPermission(
	user: User,
	action: 'read' | 'write',
	schema: Schema,
	availableRoles?: Role[],
	tenantId?: string
): Promise<boolean> {
	const result = await checkApiPermission(user, { collection: schema._id || schema.name, action }, availableRoles, tenantId);
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
	return async (user: User | null | undefined, tenantId?: string): Promise<User> => {
		const result = await checkApiPermission(user, context, undefined, tenantId);
		if (!result.hasPermission) {
			const statusCode = !user ? 401 : 403;
			throw error(statusCode, result.error || 'Forbidden');
		}
		return user as User;
	};
}
