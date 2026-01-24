/**
 * @file src/databases/auth/permissionMatrix.ts
 * @description Central permission matrix defining which roles can access which routes and APIs
 * 
 * This provides a single source of truth for permission enforcement, making it easy to:
 * - Understand the permission model at a glance
 * - Update permissions consistently
 * - Test role-based access control
 */

export type Role = 'admin' | 'developer' | 'editor' | 'viewer';

/**
 * Route-based permissions
 * Maps routes to arrays of roles that can access them
 */
export const routePermissions: Record<string, Role[]> = {
	// Admin-only routes
	'/config/systemsetting': ['admin', 'developer'],
	'/config/user': ['admin'],
	'/config/accessManagement': ['admin'],
	'/config/role': ['admin'],
	
	// Developer routes
	'/config/api': ['admin', 'developer'],
	'/config/widgets': ['admin', 'developer'],
	
	// Content management routes (accessible by editors)
	'/collection': ['admin', 'developer', 'editor'],
	'/media': ['admin', 'developer', 'editor'],
	
	// Dashboard (accessible by all authenticated users)
	'/dashboard': ['admin', 'developer', 'editor', 'viewer']
};

/**
 * API endpoint permissions
 * Maps API routes to arrays of roles that can access them
 */
export const apiPermissions: Record<string, Role[]> = {
	// Admin-only APIs
	'/api/user/createUser': ['admin'],
	'/api/user/deleteUser': ['admin'],
	'/api/user/updateRole': ['admin'],
	'/api/role/*': ['admin'],
	
	// Developer APIs
	'/api/graphql': ['admin', 'developer'],
	'/api/systemInfo': ['admin', 'developer'],
	'/api/widgets/*': ['admin', 'developer'],
	
	// Content management APIs
	'/api/collections': ['admin', 'developer', 'editor'],
	'/api/media': ['admin', 'developer', 'editor'],
	
	// User profile APIs (any authenticated user)
	'/api/user/profile': ['admin', 'developer', 'editor', 'viewer'],
	'/api/user/logout': ['admin', 'developer', 'editor', 'viewer']
};

/**
 * Check if a role has permission to access a route
 */
export function hasRoutePermission(route: string, role: Role): boolean {
	const allowedRoles = routePermissions[route];
	if (!allowedRoles) {
		// If route not in matrix, default to admin-only
		return role === 'admin';
	}
	return allowedRoles.includes(role);
}

/**
 * Check if a role has permission to access an API endpoint
 */
export function hasApiPermission(apiPath: string, role: Role): boolean {
	// Check exact match first
	const allowedRoles = apiPermissions[apiPath];
	if (allowedRoles) {
		return allowedRoles.includes(role);
	}
	
	// Check wildcard matches
	for (const [pattern, roles] of Object.entries(apiPermissions)) {
		if (pattern.endsWith('/*')) {
			const prefix = pattern.slice(0, -2);
			if (apiPath.startsWith(prefix)) {
				return roles.includes(role);
			}
		}
	}
	
	// If not in matrix, default to admin-only
	return role === 'admin';
}

/**
 * Get all routes accessible by a role
 */
export function getRoutesForRole(role: Role): string[] {
	return Object.entries(routePermissions)
		.filter(([, roles]) => roles.includes(role))
		.map(([route]) => route);
}

/**
 * Get all API endpoints accessible by a role
 */
export function getApisForRole(role: Role): string[] {
	return Object.entries(apiPermissions)
		.filter(([, roles]) => roles.includes(role))
		.map(([api]) => api);
}
