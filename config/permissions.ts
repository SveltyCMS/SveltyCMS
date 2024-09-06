
/**
 * @file config/permissions.ts
 * @description Configuration prompts for the Permissions section
 */

import type { Permission } from '@src/auth/types'; // Import Permission type from the centralized types file

export enum PermissionType {
  COLLECTION = 'collection',
  USER = 'user',
  CONFIGURATION = 'configuration',
  SYSTEM = 'system'
  // Add more types as needed
}

export enum PermissionAction {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  MANAGE = 'manage'
  // Add more actions as needed
}

// List of all permissions available in the CMS

export let permissions: Permission[] = [];

// Function to register new permissions
export function setPermissions(newPermission: Permission[]): void {
  permissions = [...newPermission];
}
