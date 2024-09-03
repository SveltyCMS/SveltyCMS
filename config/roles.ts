
import type { Permission, Role } from '../src/auth/types';

export const roles: Role[] = [
  {
    "_id": "admin",
    "name": "Administrator",
    "description": "Full access to all system features",
    "permissions": [
      "collection:create",
      "collection:read",
      "collection:update",
      "collection:delete",
      "user:manage"
    ],
    "groupName": "Ungrouped"
  },
  {
    "_id": "developer",
    "name": "Developer",
    "description": "Can create, read, update, and delete content",
    "permissions": [
      "collection:create",
      "collection:read",
      "collection:update",
      "collection:delete"
    ]
  },
  {
    "_id": "editor",
    "name": "Editor",
    "description": "Can create, read, and update content",
    "permissions": [
      "collection:create",
      "collection:read",
      "collection:update"
    ]
  },
  {
    "_id": "user",
    "name": "User",
    "description": "Can only read content",
    "permissions": [
      "collection:read"
    ]
  }
];
// Function to register a new role
export function registerRole(newRole: Role): void {
	const exists = roles.some((role) => role._id === newRole._id); // Use _id for consistency
	if (!exists) {
		roles.push(newRole);
	}
}

// Function to register multiple roles
export function registerRoles(newRoles: Role[]): void {
	newRoles.forEach(registerRole);
}

