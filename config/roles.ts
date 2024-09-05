
import type { Permission, Role } from '../src/auth/types';
import { permissions } from './permissions'; // Import the permissions list

export const roles: Role[] = [
  {
    "_id": "admin",
    "name": "Developer",
    "description": "Can create, read, update, and delete content",
    "permissions": permissions.map((p) => p._id),
    "id": "admin"
  },
  {
    "_id": "administrator",
    "name": "Administrator",
    "description": "Full access to all system features",
    "permissions": [
      "config:collectionbuilder",
      "config:graphql",
      "config:imageeditor",
      "config:widgetManagement",
      "config:themeManagement",
      "config:settings",
      "config:accessManagement",
      "config:dashboard",
      "user:manage",
      "ImageArray:create",
      "ImageArray:read",
      "ImageArray:update",
      "ImageArray:delete",
      "Media:create",
      "Media:read",
      "Media:update",
      "Media:delete",
      "Menu:create",
      "Menu:read",
      "Menu:update",
      "Menu:delete",
      "Names:create",
      "Names:read",
      "Names:update",
      "Names:delete",
      "Posts:create",
      "Posts:read",
      "Posts:update",
      "Posts:delete",
      "Relation:create",
      "Relation:read",
      "Relation:update",
      "Relation:delete",
      "WidgetTest:create",
      "WidgetTest:read",
      "WidgetTest:update",
      "WidgetTest:delete"
    ],
    "groupName": "",
    "id": "administrator"
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
    ],
    "id": "editor"
  },
  {
    "_id": "user",
    "name": "User",
    "description": "Can only read content",
    "permissions": [
      "config:collectionbuilder"
    ],
    "id": "user"
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

