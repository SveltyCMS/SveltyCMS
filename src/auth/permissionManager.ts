import type { PermissionAction, Role, User, RateLimit, Permission } from '@src/auth/types';
import { hasPermission as checkPermission } from '@src/auth/types';
import crypto from 'crypto';

const permissionTable: Permission[] = [];

// Add a permission to the permission table
export function addPermission(context_id: string, action: PermissionAction, requiredRole: string, contextType: 'collection' | 'widget') {
	const existingPermission = permissionTable.find((perm) => perm.contextId === context_id && perm.action === action);
	if (!existingPermission) {
		const newPermission: Permission = {
			permission_id: (typeof window === 'undefined')?crypto.randomUUID():self.crypto.randomUUID(),
			action,
			contextId: context_id,
			contextType,
			description: `Default permission for ${requiredRole}`
		};
		permissionTable.push(newPermission);
	}
}

// Main utility function to check if a user has a specific permission in a given context
export function hasPermission(user: User, roles: Role[], action: PermissionAction, context_id: string, rateLimits: RateLimit[]): boolean {
	if(user.role == 'admin') return true;
	return checkPermission(user, roles, action, context_id, rateLimits);
}

// Get the permission table
export function getPermissions() {
	return permissionTable;
}
