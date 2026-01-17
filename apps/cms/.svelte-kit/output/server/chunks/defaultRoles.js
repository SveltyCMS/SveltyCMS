import '@sveltejs/kit';
import { g as getAllPermissions } from './permissions.js';
import './logger.js';
import './settingsService.js';
import './crypto.js';
import './CacheService.js';
const defaultRoles = [
	{
		_id: 'admin',
		name: 'Administrator',
		description: 'Superuser - Full system access to all features and settings',
		isAdmin: true,
		permissions: [],
		// Will be populated with all permissions
		icon: 'material-symbols:verified-outline',
		color: 'gradient-primary'
	},
	{
		_id: 'developer',
		name: 'Developer',
		description: 'Technical users - Access to development tools, APIs, and system configuration',
		isAdmin: false,
		permissions: [
			'system:dashboard',
			'api:graphql',
			'api:collections',
			'api:export',
			'api:systemInfo',
			'api:user',
			'api:userActivity',
			'api:media',
			'api:widgets',
			'api:sendMail',
			'collections:read',
			'collections:update',
			'collections:create',
			'content:builder',
			'config:widgetManagement'
		],
		icon: 'material-symbols:code',
		color: 'gradient-pink'
	},
	{
		_id: 'editor',
		name: 'Editor',
		description: 'Content managers - Create and edit content, manage media and users',
		isAdmin: false,
		permissions: [
			'collections:read',
			'collections:update',
			'collections:create',
			'content:editor',
			'content:images',
			'system:dashboard',
			'api:systemInfo',
			'api:collections',
			'api:user',
			'api:userActivity',
			'api:media',
			'user:manage'
		],
		icon: 'material-symbols:edit',
		color: 'gradient-tertiary'
	}
];
function getDefaultRoles() {
	const allPermissions = getAllPermissions();
	return defaultRoles.map((role) => ({
		...role,
		permissions: role.isAdmin ? allPermissions.map((p) => p._id) : role.permissions
	}));
}
export { defaultRoles as d, getDefaultRoles as g };
//# sourceMappingURL=defaultRoles.js.map
