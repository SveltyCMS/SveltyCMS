
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

export const permissions: Permission[] = [
  {
    "_id": "config:collectionbuilder",
    "name": "Access Collection Builder",
    "action": "read",
    "type": "configuration",
    "description": "Allows access to the collection builder."
  },
  {
    "_id": "config:graphql",
    "name": "Access GraphQL",
    "action": "read",
    "type": "configuration",
    "description": "Allows access to GraphQL settings."
  },
  {
    "_id": "config:imageeditor",
    "name": "Use Image Editor",
    "action": "update",
    "type": "configuration",
    "description": "Allows using the image editor."
  },
  {
    "_id": "config:widgetManagement",
    "name": "Manage Widgets",
    "action": "update",
    "type": "configuration",
    "description": "Allows management of widgets."
  },
  {
    "_id": "config:themeManagement",
    "name": "Manage Themes",
    "action": "update",
    "type": "configuration",
    "description": "Allows managing themes."
  },
  {
    "_id": "config:settings",
    "name": "Manage Settings",
    "action": "update",
    "type": "configuration",
    "description": "Allows managing system settings."
  },
  {
    "_id": "config:accessManagement",
    "name": "Manage Access",
    "action": "update",
    "type": "configuration",
    "description": "Allows managing user access and roles."
  },
  {
    "_id": "config:dashboard",
    "name": "Access Dashboard",
    "action": "read",
    "type": "configuration",
    "description": "Allows access to the dashboard."
  },
  {
    "_id": "user:manage",
    "name": "Manage Users",
    "action": "manage",
    "type": "user",
    "description": "Allows managing users."
  },
  {
    "_id": "ImageArray:create",
    "name": "Create ImageArray",
    "action": "create",
    "type": "collection",
    "description": "Allows creating new ImageArray"
  },
  {
    "_id": "ImageArray:read",
    "name": "Read ImageArray",
    "action": "read",
    "type": "collection",
    "description": "Allows reading ImageArray"
  },
  {
    "_id": "ImageArray:update",
    "name": "Update ImageArray",
    "action": "update",
    "type": "collection",
    "description": "Allows updating ImageArray"
  },
  {
    "_id": "ImageArray:delete",
    "name": "Delete ImageArray",
    "action": "delete",
    "type": "collection",
    "description": "Allows deleting ImageArray"
  },
  {
    "_id": "Media:create",
    "name": "Create Media",
    "action": "create",
    "type": "collection",
    "description": "Allows creating new Media"
  },
  {
    "_id": "Media:read",
    "name": "Read Media",
    "action": "read",
    "type": "collection",
    "description": "Allows reading Media"
  },
  {
    "_id": "Media:update",
    "name": "Update Media",
    "action": "update",
    "type": "collection",
    "description": "Allows updating Media"
  },
  {
    "_id": "Media:delete",
    "name": "Delete Media",
    "action": "delete",
    "type": "collection",
    "description": "Allows deleting Media"
  },
  {
    "_id": "Menu:create",
    "name": "Create Menu",
    "action": "create",
    "type": "collection",
    "description": "Allows creating new Menu"
  },
  {
    "_id": "Menu:read",
    "name": "Read Menu",
    "action": "read",
    "type": "collection",
    "description": "Allows reading Menu"
  },
  {
    "_id": "Menu:update",
    "name": "Update Menu",
    "action": "update",
    "type": "collection",
    "description": "Allows updating Menu"
  },
  {
    "_id": "Menu:delete",
    "name": "Delete Menu",
    "action": "delete",
    "type": "collection",
    "description": "Allows deleting Menu"
  },
  {
    "_id": "Names:create",
    "name": "Create Names",
    "action": "create",
    "type": "collection",
    "description": "Allows creating new Names"
  },
  {
    "_id": "Names:read",
    "name": "Read Names",
    "action": "read",
    "type": "collection",
    "description": "Allows reading Names"
  },
  {
    "_id": "Names:update",
    "name": "Update Names",
    "action": "update",
    "type": "collection",
    "description": "Allows updating Names"
  },
  {
    "_id": "Names:delete",
    "name": "Delete Names",
    "action": "delete",
    "type": "collection",
    "description": "Allows deleting Names"
  },
  {
    "_id": "Posts:create",
    "name": "Create Posts",
    "action": "create",
    "type": "collection",
    "description": "Allows creating new Posts"
  },
  {
    "_id": "Posts:read",
    "name": "Read Posts",
    "action": "read",
    "type": "collection",
    "description": "Allows reading Posts"
  },
  {
    "_id": "Posts:update",
    "name": "Update Posts",
    "action": "update",
    "type": "collection",
    "description": "Allows updating Posts"
  },
  {
    "_id": "Posts:delete",
    "name": "Delete Posts",
    "action": "delete",
    "type": "collection",
    "description": "Allows deleting Posts"
  },
  {
    "_id": "Relation:create",
    "name": "Create Relation",
    "action": "create",
    "type": "collection",
    "description": "Allows creating new Relation"
  },
  {
    "_id": "Relation:read",
    "name": "Read Relation",
    "action": "read",
    "type": "collection",
    "description": "Allows reading Relation"
  },
  {
    "_id": "Relation:update",
    "name": "Update Relation",
    "action": "update",
    "type": "collection",
    "description": "Allows updating Relation"
  },
  {
    "_id": "Relation:delete",
    "name": "Delete Relation",
    "action": "delete",
    "type": "collection",
    "description": "Allows deleting Relation"
  },
  {
    "_id": "WidgetTest:create",
    "name": "Create WidgetTest",
    "action": "create",
    "type": "collection",
    "description": "Allows creating new WidgetTest"
  },
  {
    "_id": "WidgetTest:read",
    "name": "Read WidgetTest",
    "action": "read",
    "type": "collection",
    "description": "Allows reading WidgetTest"
  },
  {
    "_id": "WidgetTest:update",
    "name": "Update WidgetTest",
    "action": "update",
    "type": "collection",
    "description": "Allows updating WidgetTest"
  },
  {
    "_id": "WidgetTest:delete",
    "name": "Delete WidgetTest",
    "action": "delete",
    "type": "collection",
    "description": "Allows deleting WidgetTest"
  }
];
// Function to register new permissions
export function registerPermission(newPermission: Permission): void {
	const exists = permissions.some((permission) => permission._id === newPermission._id); // Use _id for consistency
	if (!exists) {
		permissions.push(newPermission);
	}
}

// Function to register multiple permissions
export function registerPermissions(newPermissions: Permission[]): void {
	newPermissions.forEach(registerPermission);
}

