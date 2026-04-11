/**
 * @file src/databases/auth/corePermissions.ts
 * @description Core permissions configuration for the authentication system
 *
 * This file contains the core permission definitions that can be easily modified
 * without affecting the core authentication logic.
 *
 * Features:
 * - Defines a set of core permissions used throughout the system.
 * - Each permission has an ID, name, action, type, and optional context.
 * - Permissions cover system access, dashboard, user management, collections, API access, and more.
 *
 * This modular approach allows for easy extension and customization of permissions
 * as the application evolves.
 */

import { type Permission, PermissionAction, PermissionType } from "./types";
import type { DatabaseId } from "@src/content/types";

// Core permissions that are always available
export const corePermissions: Permission[] = [
  // System permissions
  {
    _id: "system:dashboard" as DatabaseId,
    name: "Dashboard Access",
    action: PermissionAction.ACCESS,
    type: PermissionType.SYSTEM,
  },
  {
    _id: "system:admin" as DatabaseId,
    name: "Admin Access",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
  },
  {
    _id: "system:settings" as DatabaseId,
    name: "Settings Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
  },

  // Dashboard resource permissions
  {
    _id: "dashboard:read" as DatabaseId,
    name: "Dashboard Read Access",
    action: PermissionAction.READ,
    type: PermissionType.SYSTEM,
    contextId: "dashboard",
  },
  {
    _id: "dashboard:write" as DatabaseId,
    name: "Dashboard Write Access",
    action: PermissionAction.WRITE,
    type: PermissionType.SYSTEM,
    contextId: "dashboard",
  },
  {
    _id: "dashboard:update" as DatabaseId,
    name: "Dashboard Update Access",
    action: PermissionAction.UPDATE,
    type: PermissionType.SYSTEM,
    contextId: "dashboard",
  },

  // SendMail resource permissions
  {
    _id: "send-mail:write" as DatabaseId,
    name: "Send Mail Access",
    action: PermissionAction.WRITE,
    type: PermissionType.SYSTEM,
    contextId: "send-mail",
  },

  // Permissions management resource permissions
  {
    _id: "permissions:update" as DatabaseId,
    name: "Update Permissions",
    action: PermissionAction.UPDATE,
    type: PermissionType.SYSTEM,
    contextId: "permissions",
  },

  // System preferences resource permissions
  {
    _id: "systemPreferences:read" as DatabaseId,
    name: "Read System Preferences",
    action: PermissionAction.READ,
    type: PermissionType.SYSTEM,
    contextId: "systemPreferences",
  },
  {
    _id: "systemPreferences:write" as DatabaseId,
    name: "Write System Preferences",
    action: PermissionAction.WRITE,
    type: PermissionType.SYSTEM,
    contextId: "systemPreferences",
  },

  // Search resource permissions
  {
    _id: "search:read" as DatabaseId,
    name: "Search Access",
    action: PermissionAction.READ,
    type: PermissionType.SYSTEM,
    contextId: "search",
  },

  // GraphQL resource permissions
  {
    _id: "graphql:read" as DatabaseId,
    name: "GraphQL API Access",
    action: PermissionAction.READ,
    type: PermissionType.SYSTEM,
    contextId: "graphql",
  },

  // Media resource permissions
  {
    _id: "media:read" as DatabaseId,
    name: "Media Read Access",
    action: PermissionAction.READ,
    type: PermissionType.SYSTEM,
    contextId: "media",
  },
  {
    _id: "media:write" as DatabaseId,
    name: "Media Write Access",
    action: PermissionAction.WRITE,
    type: PermissionType.SYSTEM,
    contextId: "media",
  },
  {
    _id: "media:delete" as DatabaseId,
    name: "Media Delete Access",
    action: PermissionAction.DELETE,
    type: PermissionType.SYSTEM,
    contextId: "media",
  },

  // User management permissions
  {
    _id: "user:create" as DatabaseId,
    name: "User Create Access",
    action: PermissionAction.CREATE,
    type: PermissionType.SYSTEM,
    contextId: "user",
  },
  {
    _id: "user:read" as DatabaseId,
    name: "User Read Access",
    action: PermissionAction.READ,
    type: PermissionType.SYSTEM,
    contextId: "user",
  },
  {
    _id: "user:update" as DatabaseId,
    name: "User Update Access",
    action: PermissionAction.WRITE,
    type: PermissionType.SYSTEM,
    contextId: "user",
  },
  {
    _id: "user:delete" as DatabaseId,
    name: "User Delete Access",
    action: PermissionAction.DELETE,
    type: PermissionType.SYSTEM,
    contextId: "user",
  },

  // --- NEW: Tenant management permissions (for multi-tenant mode) ---
  {
    _id: "tenant:create" as DatabaseId,
    name: "Create Tenants",
    action: PermissionAction.CREATE,
    type: PermissionType.SYSTEM,
    contextId: "tenant",
  },
  {
    _id: "tenant:read" as DatabaseId,
    name: "Read Tenants",
    action: PermissionAction.READ,
    type: PermissionType.SYSTEM,
    contextId: "tenant",
  },
  {
    _id: "tenant:update" as DatabaseId,
    name: "Update Tenants",
    action: PermissionAction.UPDATE,
    type: PermissionType.SYSTEM,
    contextId: "tenant",
  },
  {
    _id: "tenant:delete" as DatabaseId,
    name: "Delete Tenants",
    action: PermissionAction.DELETE,
    type: PermissionType.SYSTEM,
    contextId: "tenant",
  },
  {
    _id: "tenant:manage" as DatabaseId,
    name: "Manage Tenants",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
    contextId: "tenant",
  }, // System resource permissions (used by tokens, themes, content-structure, etc.)

  {
    _id: "system:read" as DatabaseId,
    name: "System Read Access",
    action: PermissionAction.READ,
    type: PermissionType.SYSTEM,
    contextId: "system",
  },
  {
    _id: "system:write" as DatabaseId,
    name: "System Write Access",
    action: PermissionAction.WRITE,
    type: PermissionType.SYSTEM,
    contextId: "system",
  },
  {
    _id: "system:delete" as DatabaseId,
    name: "System Delete Access",
    action: PermissionAction.DELETE,
    type: PermissionType.SYSTEM,
    contextId: "system",
  },

  // Users resource permissions (used by avatar management, user listing, etc.)
  {
    _id: "users:read" as DatabaseId,
    name: "Users Read Access",
    action: PermissionAction.READ,
    type: PermissionType.SYSTEM,
    contextId: "users",
  },
  {
    _id: "users:write" as DatabaseId,
    name: "Users Write Access",
    action: PermissionAction.WRITE,
    type: PermissionType.SYSTEM,
    contextId: "users",
  },
  {
    _id: "users:delete" as DatabaseId,
    name: "Users Delete Access",
    action: PermissionAction.DELETE,
    type: PermissionType.SYSTEM,
    contextId: "users",
  },

  // Collections management permissions
  {
    _id: "collections:read" as DatabaseId,
    name: "Collections Read Access",
    action: PermissionAction.READ,
    type: PermissionType.SYSTEM,
    contextId: "collections",
  },
  {
    _id: "collections:write" as DatabaseId,
    name: "Collections Write Access",
    action: PermissionAction.WRITE,
    type: PermissionType.SYSTEM,
    contextId: "collections",
  },
  {
    _id: "collections:create" as DatabaseId,
    name: "Collections Create Access",
    action: PermissionAction.CREATE,
    type: PermissionType.SYSTEM,
    contextId: "collections",
  },
  {
    _id: "collections:update" as DatabaseId,
    name: "Collections Update Access",
    action: PermissionAction.UPDATE,
    type: PermissionType.SYSTEM,
    contextId: "collections",
  },
  {
    _id: "collections:delete" as DatabaseId,
    name: "Collections Delete Access",
    action: PermissionAction.DELETE,
    type: PermissionType.SYSTEM,
    contextId: "collections",
  },

  // API permissions
  {
    _id: "api:graphql" as DatabaseId,
    name: "GraphQL API Access",
    action: PermissionAction.ACCESS,
    type: PermissionType.SYSTEM,
  },
  {
    _id: "api:collections" as DatabaseId,
    name: "Collections API Access",
    action: PermissionAction.ACCESS,
    type: PermissionType.SYSTEM,
  },
  {
    _id: "api:export" as DatabaseId,
    name: "Export API Access",
    action: PermissionAction.EXECUTE,
    type: PermissionType.SYSTEM,
  },
  {
    _id: "api:user" as DatabaseId,
    name: "User API Access",
    action: PermissionAction.ACCESS,
    type: PermissionType.SYSTEM,
    description: "Grants access to all API endpoints under /api/user/.",
  },
  {
    _id: "api:send-mail" as DatabaseId,
    name: "Send Mail API Access",
    action: PermissionAction.EXECUTE,
    type: PermissionType.SYSTEM,
    description: "Grants access to send emails via the API.",
  },
  {
    _id: "api:exportData" as DatabaseId,
    name: "Export Api Data",
    action: PermissionAction.EXECUTE,
    type: PermissionType.SYSTEM,
    contextId: "api/exportData",
  },
  {
    _id: "api:query" as DatabaseId,
    name: "Query API Access",
    action: PermissionAction.ACCESS,
    type: PermissionType.SYSTEM,
    description: "Grants access to the query API endpoint.",
  },
  {
    _id: "api:systemPreferences" as DatabaseId,
    name: "System Preferences API Access",
    action: PermissionAction.ACCESS,
    type: PermissionType.SYSTEM,
    description: "Grants access to the system preferences API endpoints.",
  },
  {
    _id: "api:systemInfo" as DatabaseId,
    name: "System Info API Access",
    action: PermissionAction.ACCESS,
    type: PermissionType.SYSTEM,
    description: "Grants access to the system information API endpoints.",
  },
  {
    _id: "api:userActivity" as DatabaseId,
    name: "User Activity API Access",
    action: PermissionAction.ACCESS,
    type: PermissionType.SYSTEM,
    description: "Grants access to the user activity API endpoint for dashboard widgets.",
  },
  {
    _id: "api:media" as DatabaseId,
    name: "Media API Access",
    action: PermissionAction.ACCESS,
    type: PermissionType.SYSTEM,
    description: "Grants access to the media API endpoints.",
  },
  {
    _id: "api:widgets" as DatabaseId,
    name: "Widget API Access",
    action: PermissionAction.ACCESS,
    type: PermissionType.SYSTEM,
    description: "Grants access to the widget management API endpoints.",
  },

  // Collection permissions
  {
    _id: "collection:create" as DatabaseId,
    name: "Create Collection Entries",
    action: PermissionAction.CREATE,
    type: PermissionType.COLLECTION,
  },
  {
    _id: "collection:read" as DatabaseId,
    name: "Read Collection Entries",
    action: PermissionAction.READ,
    type: PermissionType.COLLECTION,
  },
  {
    _id: "collection:update" as DatabaseId,
    name: "Update Collection Entries",
    action: PermissionAction.UPDATE,
    type: PermissionType.COLLECTION,
  },
  {
    _id: "collection:delete" as DatabaseId,
    name: "Delete Collection Entries",
    action: PermissionAction.DELETE,
    type: PermissionType.COLLECTION,
  },

  // Content permissions
  {
    _id: "content:editor" as DatabaseId,
    name: "Content Editor",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
  },
  {
    _id: "content:builder" as DatabaseId,
    name: "Content Builder",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
  },
  {
    _id: "content:images" as DatabaseId,
    name: "Image Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
  },

  // User management permissions (consolidated)
  {
    _id: "user:manage" as DatabaseId,
    name: "Manage Users",
    action: PermissionAction.MANAGE,
    type: PermissionType.USER,
  },
  {
    _id: "user.create" as DatabaseId,
    name: "Create User Tokens",
    action: PermissionAction.CREATE,
    type: PermissionType.USER,
    contextId: "user.create",
    description: "Allows creating new user registration tokens.",
  },

  // Configuration permissions - matching your original permissionConfigs
  {
    _id: "config:collectionManagement" as DatabaseId,
    name: "Collection Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.CONFIGURATION,
    contextId: "config/collectionManagement",
  },
  {
    _id: "config:collectionbuilder" as DatabaseId,
    name: "Collection Builder Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
    contextId: "config/collectionbuilder",
  },
  {
    _id: "config:graphql" as DatabaseId,
    name: "GraphQL Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
    contextId: "config/graphql",
  },
  {
    _id: "config:imageeditor" as DatabaseId,
    name: "ImageEditor Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
    contextId: "config/imageeditor",
  },
  {
    _id: "config:dashboard" as DatabaseId,
    name: "Dashboard Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
    contextId: "config/dashboard",
  },
  {
    _id: "config:widgetManagement" as DatabaseId,
    name: "Widget Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.CONFIGURATION,
    contextId: "config/widgetManagement",
  },
  {
    _id: "config:themeManagement" as DatabaseId,
    name: "Theme Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.CONFIGURATION,
    contextId: "config/themeManagement",
  },
  {
    _id: "config:settings" as DatabaseId,
    name: "Settings Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
    contextId: "config/settings",
  },
  {
    _id: "config:accessManagement" as DatabaseId,
    name: "Access Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.CONFIGURATION,
    contextId: "config/accessManagement",
  },
  {
    _id: "config:emailPreviews" as DatabaseId,
    name: "Email Previews",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
    contextId: "config/emailPreviews",
  },
  {
    _id: "config:adminArea" as DatabaseId,
    name: "Admin Area Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
    contextId: "config/adminArea",
  },
  {
    _id: "config:webhooks" as DatabaseId,
    name: "Webhooks Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.CONFIGURATION,
    contextId: "config/webhooks",
  },
  {
    _id: "config:audit" as DatabaseId,
    name: "Audit Log Access",
    action: PermissionAction.READ,
    type: PermissionType.SYSTEM,
    contextId: "config/audit",
  },
  {
    _id: "config:synchronization" as DatabaseId,
    name: "Config Synchronization",
    action: PermissionAction.MANAGE,
    type: PermissionType.CONFIGURATION,
    contextId: "config/synchronization",
  },
  {
    _id: "config:systemHealth" as DatabaseId,
    name: "System Health Access",
    action: PermissionAction.READ,
    type: PermissionType.SYSTEM,
    contextId: "config/systemHealth",
  },
  {
    _id: "config:automations" as DatabaseId,
    name: "Automations Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.CONFIGURATION,
    contextId: "config/automations",
  },
  {
    _id: "config:extensions" as DatabaseId,
    name: "Extensions Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.CONFIGURATION,
    contextId: "config/extensions",
  },
  {
    _id: "config:marketplace" as DatabaseId,
    name: "Marketplace Access",
    action: PermissionAction.ACCESS,
    type: PermissionType.SYSTEM,
    contextId: "config/marketplace",
  },

  // Admin permissions
  {
    _id: "admin:access" as DatabaseId,
    name: "Admin Access",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
    contextId: "admin/access",
  },
  {
    _id: "config:importexport" as DatabaseId,
    name: "Import/Export Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.CONFIGURATION,
    contextId: "config/import-export",
  },
];
