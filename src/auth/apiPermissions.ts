/**
 * @file src/auth/apiPermissions.ts
 * @description API endpoint permissions configuration for role-based access control
 *
 * This file defines which roles can access which API endpoints at the first level.
 * This provides coarse-grained but effective security for multi-tenant applications.
 *
 * Permission Structure:
 * - Key: API endpoint (first segment after /api/)
 * - Value: Array of roles that can access this endpoint
 *
 * Special roles:
 * - '*' means all authenticated users can access
 * - Only listed roles can access the endpoint
 */

export const API_PERMISSIONS: Record<string, string[]> = {
	// System Administration - Admin only
	'api:config': ['admin'], // System configuration
	'api:token': ['admin'], // Token management (user invitations)
	'api:permission': ['admin'], // Permission management
	'api:systemPreferences': ['admin'], // System preferences

	// Authentication & Security - All authenticated users can manage their own 2FA
	'api:auth/2fa': ['*'], // 2FA management (setup, disable, backup codes)

	// User Management - Admin and Editor
	'api:user': ['admin', 'editor'], // User management (includes profile updates)

	// Content Management - Admin and Editor
	'api:collections': ['admin', 'editor'], // Collection/content management
	'api:media': ['admin', 'editor'], // Media management
	'api:virtualFolder': ['admin', 'editor'], // Virtual folder management
	'api:systemVirtualFolder': ['admin', 'editor'], // System virtual folders

	// Dashboard & Analytics - Admin and Editor
	'api:dashboard': ['admin', 'editor'], // Dashboard data
	'api:search': ['admin', 'editor'], // Search functionality
	'api:index': ['admin', 'editor'], // Index/search operations

	// Content Structure - Admin and Editor
	'api:content-structure': ['admin', 'editor'], // Content structure management

	// Theme Management - Admin and Editor (content creators need themes)
	'api:theme': ['admin', 'editor'], // Theme management

	// Video/Media Processing - Admin and Editor
	'api:video': ['admin', 'editor'], // Video processing

	// GraphQL - Admin and Editor (for complex queries)
	'api:graphql': ['admin', 'editor'], // GraphQL endpoint

	// Widget Management - Admin and Developer
	'api:widgets': ['admin', 'developer'], // Widget management and marketplace

	// Public/Semi-public endpoints (authenticated users)
	'api:sendMail': ['*'], // Email sending (used internally, but needs auth)
	'api:getTokensProvided': ['admin'] // Token information - admin only
};

/**
 * Check if a user role has permission to access an API endpoint
 * @param userRole - The user's role
 * @param apiEndpoint - The API endpoint (e.g., 'token', 'user', 'collections')
 * @returns boolean - true if access is allowed
 */
export function hasApiPermission(userRole: string, apiEndpoint: string): boolean {
	const allowedRoles = API_PERMISSIONS[`api:${apiEndpoint}`];

	if (!allowedRoles) {
		// If endpoint is not defined, deny access by default (secure by default)
		return false;
	}

	// Check for wildcard (all authenticated users)
	if (allowedRoles.includes('*')) {
		return true;
	}

	// Check if user's role is in the allowed roles
	return allowedRoles.includes(userRole);
}

/**
 * Get all API endpoints that a role can access
 * @param userRole - The user's role
 * @returns string[] - Array of API endpoints the role can access
 */
export function getApiPermissionsForRole(userRole: string): string[] {
	const endpoints: string[] = [];

	for (const [endpoint, roles] of Object.entries(API_PERMISSIONS)) {
		if (roles.includes('*') || roles.includes(userRole)) {
			endpoints.push(endpoint.replace('api:', ''));
		}
	}

	return endpoints;
}
