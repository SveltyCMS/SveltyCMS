import type { PermissionAction, Role, User, RateLimit, Permission, ContextType } from '@src/auth/types';
import { hasPermission as checkPermission } from '@src/auth/types';
import { createRandomID } from '@src/utils/utils';

const permissionTable: Permission[] = [];

// Add a permission to the permission table
export function addPermission(contextId: string, action: PermissionAction, requiredRole: string, contextType: ContextType) {
	const existingPermission = permissionTable.find((perm) => perm.contextId === contextId && perm.action === action);

	if (!existingPermission) {
		const newPermission: Permission = {
			id: createRandomID().toString(), // Generate unique ID using createRandomID
			action,
			contextId,
			contextType,
			description: `Default permission for ${requiredRole}`,
			requires2FA: false // Default to false; adjust as needed
		};
		permissionTable.push(newPermission);
	}
}

// Main utility function to check if a user has a specific permission in a given context
export function hasPermission(user: User, roles: Role[], action: PermissionAction, contextId: string, rateLimits: RateLimit[]): boolean {
	return checkPermission(user, roles, action, contextId, rateLimits);
}

// Get the permission table
export function getPermissions() {
	return permissionTable;
}
