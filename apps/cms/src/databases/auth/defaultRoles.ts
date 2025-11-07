/**
 * @file src/databases/auth/defaultRoles.ts
 * @description Default roles for CMS initialization and fallback
 *
 * This module provides default roles that are:
 * - Seeded to database during setup wizard (see api/setup/seed.ts)
 * - Used as fallback when database is unavailable (see hooks/handleAuthorization.ts)
 * - Following headless CMS best practices (admin, developer, editor)
 *
 * ### Architecture Notes
 * - Website tokens handle external API access (not user roles)
 * - Multi-tenant support: roles can have optional tenantId field
 * - Database-first: defaultRoles are reference data, DB is source of truth
 */

import { getAllPermissions } from '@src/databases/auth';
import type { Role } from '@src/databases/auth/types';

/**
 * Default roles for headless CMS workflow
 * - Admin: Superuser with full system access
 * - Developer: Setup and development access (technical users)
 * - Editor: Data entry and content management (business users)
 *
 * Note: Admin role permissions will be populated with getAllPermissions()
 * when used. Other roles have explicitly defined permission sets.
 */
export const defaultRoles: Role[] = [
	{
		_id: 'admin',
		name: 'Administrator',
		description: 'Superuser - Full system access to all features and settings',
		isAdmin: true,
		permissions: [], // Will be populated with all permissions
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

/**
 * Get default roles with admin permissions populated
 * Call this function when you need roles with complete permission sets
 */
export function getDefaultRoles(): Role[] {
	const allPermissions = getAllPermissions();
	return defaultRoles.map((role) => ({
		...role,
		permissions: role.isAdmin ? allPermissions.map((p) => p._id) : role.permissions
	}));
}
