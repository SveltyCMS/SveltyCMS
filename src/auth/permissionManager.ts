import type { PermissionAction, Role, User, RateLimit, Permission } from '@src/auth/types';
import { hasPermission as checkPermission } from '@src/auth/types';
import crypto from 'crypto';

const permissionTable: Permission[] = [];

// Add a permission to the permission table
export function addPermission(context_id: string, action: PermissionAction, requiredRole: string, contextType: 'collection' | 'widget') {
	const existingPermission = permissionTable.find((perm) => perm.contextId === context_id && perm.action === action);
	if (!existingPermission) {
		const newPermission: Permission = {
			permission_id: typeof window === 'undefined' ? crypto.randomUUID() : self.crypto.randomUUID(),
			action,
			contextId: context_id,
			contextType,
			description: `Default permission for ${requiredRole}`,
			requiredRole: 'admin', // Provide a value for requiredRole here
			requires2FA: false
		};
		permissionTable.push(newPermission);
	}
}

// Update a permission in the permission table
export function updatePermission(updatedPermission: Permission) {
	const index = permissionTable.findIndex((p) => p.permission_id === updatedPermission.permission_id);
	if (index !== -1) {
		permissionTable[index] = updatedPermission;
	}
}

// Main utility function to check if a user has a specific permission in a given context
export function hasPermission(user: User, roles: Role[], action: PermissionAction, context_id: string, rateLimits: RateLimit[]): boolean {
	if (user.role == 'admin') return true;
	return checkPermission(user, roles, action, context_id, rateLimits);
}

// Get the permission table
export function getPermissions() {
	return permissionTable;
}
