const API_PERMISSIONS = {
	// System Administration - Admin only
	'api:config': ['admin'],
	// System configuration
	'api:token': ['admin'],
	// Token management (user invitations)
	'api:permission': ['admin'],
	// Permission management
	'api:settings': ['admin'],
	// System settings (database-driven configuration)
	'api:systemPreferences': ['admin'],
	// System preferences (user dashboard layout/sizes)
	'api:config_sync': ['admin'],
	// Configuration sync (import/export)
	'api:system': ['admin', 'editor'],
	// System status (version, health)
	'api:telemetry': ['admin', 'editor'],
	// System telemetry
	// Admin area - Admin only
	'api:admin': ['admin'],
	// Website Tokens - Admin only
	'api:website-tokens': ['admin'],
	// Authentication & Security - All authenticated users can manage their own auth/2FA
	'api:auth': ['*'],
	// Authentication endpoints (2FA setup, disable, backup codes, etc.)
	// User Management - Admin and Editor
	'api:user': ['admin', 'editor'],
	// User management (includes profile updates)
	// Content Management - Admin and Editor
	'api:collections': ['admin', 'editor'],
	// Collection/content management
	'api:media': ['admin', 'editor'],
	// Media management
	'api:systemVirtualFolder': ['admin', 'editor'],
	// System virtual folders
	// Dashboard & Analytics - Admin and Editor
	'api:dashboard': ['admin', 'editor'],
	// Dashboard data
	'api:security': ['admin'],
	// Security monitoring and incident management
	'api:search': ['admin', 'editor'],
	// Search functionality
	'api:index': ['admin', 'editor'],
	// Index/search operations
	// Content Structure - Admin and Editor
	'api:content-structure': ['admin', 'editor'],
	// Content structure management
	// Theme Management - Admin and Editor (content creators need themes)
	'api:theme': ['admin', 'editor'],
	// Theme management
	// Video/Media Processing - Admin and Editor
	'api:video': ['admin', 'editor'],
	// Video processing
	// GraphQL - Admin and Editor (for complex queries)
	'api:graphql': ['admin', 'editor'],
	// GraphQL endpoint
	// Widget Management - Admin and Developer
	'api:widgets': ['admin', 'developer'],
	// Widget management and marketplace
	// Public/Semi-public endpoints (authenticated users)
	'api:sendMail': ['*'],
	// Email sending (used internally, but needs auth)
	'api:getTokensProvided': ['admin']
	// Token information - admin only
};
function hasApiPermission(userRole, apiEndpoint) {
	const allowedRoles = API_PERMISSIONS[`api:${apiEndpoint}`];
	if (!allowedRoles) {
		return false;
	}
	if (allowedRoles.includes('*')) {
		return true;
	}
	return allowedRoles.includes(userRole);
}
export { hasApiPermission as h };
//# sourceMappingURL=apiPermissions.js.map
