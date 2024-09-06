
import type { Permission, Role } from '../src/auth/types';
import { permissions } from './permissions'; // Import the permissions list

export const roles: Role[] = [
  {
    "_id": "db0244b8c309c50dc5ddb3c86cf9535f",
    "name": "Developer",
    "description": "Its developer role.",
    "permissions": [
      "config/collectionbuilder",
      "config/graphql"
    ]
  },
  {
    "_id": "admin",
    "name": "Administrator",
    "description": "Full access to all system features..",
    "isAdmin": true,
    "permissions": permissions.map((p) => p._id)
  },
  {
    "_id": "user",
    "name": "User",
    "description": "Can only read content",
    "permissions": [
      "config/collectionbuilder",
      "config/graphql",
      "config/imageeditor",
      "config/dashboard"
    ]
  },
  {
    "_id": "bbfe53b0c663e3f5ad5069423296e4eb",
    "name": "Editor3",
    "description": "Editor2",
    "permissions": [
      "config/collectionbuilder"
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

