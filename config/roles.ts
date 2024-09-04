
import type { Permission, Role } from '../src/auth/types';
import { permissions } from './permissions'; // Import the permissions list

export const roles: Role[] = [
  {
    "_id": "admin",
    "name": "Administrator",
    "description": "Full access to all system features",
    "permissions": permissions.map((p) => p._id)
  },
  {
    "_id": "developer",
    "name": "Developer",
    "description": "Can create, read, update, and delete content",
    "permissions": [
      "config:collectionbuilder",
      "config:graphql",
      "config:imageeditor",
      "config:widgetManagement",
      "config:themeManagement",
      "config:settings",
      "ImageArray:create",
      "ImageArray:read",
      "ImageArray:update",
      "ImageArray:delete",
      "Menu:create",
      "Menu:read",
      "Menu:update",
      "Menu:delete"
    ]
  },
  {
    "_id": "editor",
    "name": "Editor",
    "description": "Can create, read, and update content",
    "permissions": [
      "config:collectionbuilder",
      "config:graphql",
      "ImageArray:create",
      "ImageArray:update",
      "ImageArray:read"
    ]
  },
  {
    "_id": "user",
    "name": "User",
    "description": "Can only read content",
    "permissions": [
      "config:collectionbuilder"
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

