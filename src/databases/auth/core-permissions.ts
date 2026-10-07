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
    description: "Grants access to the main dashboard with content metrics and activity overview.",
  },
  {
    _id: "system:admin" as DatabaseId,
    name: "Admin Access",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
    description:
      "Full administrative control over the CMS, including access management and system-wide settings.",
  },
  {
    _id: "system:settings" as DatabaseId,
    name: "Settings Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
    description: "Allows viewing and changing system-wide configuration settings.",
  },

  // Dashboard resource permissions
  {
    _id: "dashboard:read" as DatabaseId,
    name: "Dashboard Read Access",
    action: PermissionAction.READ,
    type: PermissionType.SYSTEM,
    contextId: "dashboard",
    description: "Allows viewing dashboard widgets and their metrics.",
  },
  {
    _id: "dashboard:write" as DatabaseId,
    name: "Dashboard Write Access",
    action: PermissionAction.WRITE,
    type: PermissionType.SYSTEM,
    contextId: "dashboard",
    description: "Allows creating and saving dashboard widget configurations.",
  },
  {
    _id: "dashboard:update" as DatabaseId,
    name: "Dashboard Update Access",
    action: PermissionAction.UPDATE,
    type: PermissionType.SYSTEM,
    contextId: "dashboard",
    description: "Allows editing existing dashboard widget layouts and settings.",
  },

  // SendMail resource permissions
  {
    _id: "send-mail:write" as DatabaseId,
    name: "Send Mail Access",
    action: PermissionAction.WRITE,
    type: PermissionType.SYSTEM,
    contextId: "send-mail",
    description: "Allows sending emails through the configured mail service.",
  },

  // Permissions management resource permissions
  {
    _id: "permissions:update" as DatabaseId,
    name: "Update Permissions",
    action: PermissionAction.UPDATE,
    type: PermissionType.SYSTEM,
    contextId: "permissions",
    description: "Allows modifying role permissions in Access Management.",
  },

  // System preferences resource permissions
  {
    _id: "systemPreferences:read" as DatabaseId,
    name: "Read System Preferences",
    action: PermissionAction.READ,
    type: PermissionType.SYSTEM,
    contextId: "systemPreferences",
    description: "Allows reading stored system preferences.",
  },
  {
    _id: "systemPreferences:write" as DatabaseId,
    name: "Write System Preferences",
    action: PermissionAction.WRITE,
    type: PermissionType.SYSTEM,
    contextId: "systemPreferences",
    description: "Allows creating and updating system preferences.",
  },

  // Search resource permissions
  {
    _id: "search:read" as DatabaseId,
    name: "Search Access",
    action: PermissionAction.READ,
    type: PermissionType.SYSTEM,
    contextId: "search",
    description: "Allows using the global admin search across pages and collections.",
  },

  // GraphQL resource permissions
  {
    _id: "graphql:read" as DatabaseId,
    name: "GraphQL API Access",
    action: PermissionAction.READ,
    type: PermissionType.SYSTEM,
    contextId: "graphql",
    description: "Allows executing read queries against the GraphQL API.",
  },

  // Media resource permissions
  {
    _id: "media:read" as DatabaseId,
    name: "Media Read Access",
    action: PermissionAction.READ,
    type: PermissionType.SYSTEM,
    contextId: "media",
    description: "Allows viewing and browsing files in the media library.",
  },
  {
    _id: "media:write" as DatabaseId,
    name: "Media Write Access",
    action: PermissionAction.WRITE,
    type: PermissionType.SYSTEM,
    contextId: "media",
    description: "Allows uploading and editing media files.",
  },
  {
    _id: "media:delete" as DatabaseId,
    name: "Media Delete Access",
    action: PermissionAction.DELETE,
    type: PermissionType.SYSTEM,
    contextId: "media",
    description: "Allows permanently deleting media files.",
  },

  // User management permissions
  {
    _id: "user:create" as DatabaseId,
    name: "User Create Access",
    action: PermissionAction.CREATE,
    type: PermissionType.SYSTEM,
    contextId: "user",
    description: "Allows creating new user accounts.",
  },
  {
    _id: "user:read" as DatabaseId,
    name: "User Read Access",
    action: PermissionAction.READ,
    type: PermissionType.SYSTEM,
    contextId: "user",
    description: "Allows viewing the user list and individual user details.",
  },
  {
    _id: "user:update" as DatabaseId,
    name: "User Update Access",
    action: PermissionAction.WRITE,
    type: PermissionType.SYSTEM,
    contextId: "user",
    description: "Allows editing user accounts and assigning their roles.",
  },
  {
    _id: "user:delete" as DatabaseId,
    name: "User Delete Access",
    action: PermissionAction.DELETE,
    type: PermissionType.SYSTEM,
    contextId: "user",
    description: "Allows deleting user accounts.",
  },

  // --- NEW: Tenant management permissions (for multi-tenant mode) ---
  {
    _id: "tenant:create" as DatabaseId,
    name: "Create Tenants",
    action: PermissionAction.CREATE,
    type: PermissionType.SYSTEM,
    contextId: "tenant",
    description: "Allows provisioning new tenants (multi-tenant mode).",
  },
  {
    _id: "tenant:read" as DatabaseId,
    name: "Read Tenants",
    action: PermissionAction.READ,
    type: PermissionType.SYSTEM,
    contextId: "tenant",
    description: "Allows viewing tenants and their metadata.",
  },
  {
    _id: "tenant:update" as DatabaseId,
    name: "Update Tenants",
    action: PermissionAction.UPDATE,
    type: PermissionType.SYSTEM,
    contextId: "tenant",
    description: "Allows editing tenant settings.",
  },
  {
    _id: "tenant:delete" as DatabaseId,
    name: "Delete Tenants",
    action: PermissionAction.DELETE,
    type: PermissionType.SYSTEM,
    contextId: "tenant",
    description: "Allows deleting tenants and their data.",
  },
  {
    _id: "tenant:manage" as DatabaseId,
    name: "Manage Tenants",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
    contextId: "tenant",
    description: "Full control over tenants, including creation, updates, and deletion.",
  }, // System resource permissions (used by tokens, themes, content-structure, etc.)

  {
    _id: "system:read" as DatabaseId,
    name: "System Read Access",
    action: PermissionAction.READ,
    type: PermissionType.SYSTEM,
    contextId: "system",
    description:
      "Allows reading system-level resources such as tokens, themes, and content structure.",
  },
  {
    _id: "system:write" as DatabaseId,
    name: "System Write Access",
    action: PermissionAction.WRITE,
    type: PermissionType.SYSTEM,
    contextId: "system",
    description: "Allows creating and updating system-level resources.",
  },
  {
    _id: "system:delete" as DatabaseId,
    name: "System Delete Access",
    action: PermissionAction.DELETE,
    type: PermissionType.SYSTEM,
    contextId: "system",
    description: "Allows deleting system-level resources.",
  },

  // Users resource permissions (used by avatar management, user listing, etc.)
  {
    _id: "users:read" as DatabaseId,
    name: "Users Read Access",
    action: PermissionAction.READ,
    type: PermissionType.SYSTEM,
    contextId: "users",
    description: "Allows reading user records, e.g. avatar and profile data.",
  },
  {
    _id: "users:write" as DatabaseId,
    name: "Users Write Access",
    action: PermissionAction.WRITE,
    type: PermissionType.SYSTEM,
    contextId: "users",
    description: "Allows updating user records.",
  },
  {
    _id: "users:delete" as DatabaseId,
    name: "Users Delete Access",
    action: PermissionAction.DELETE,
    type: PermissionType.SYSTEM,
    contextId: "users",
    description: "Allows deleting user records.",
  },

  // Collections management permissions
  {
    _id: "collections:read" as DatabaseId,
    name: "Collections Read Access",
    action: PermissionAction.READ,
    type: PermissionType.SYSTEM,
    contextId: "collections",
    description: "Allows viewing collection definitions and their schemas.",
  },
  {
    _id: "collections:write" as DatabaseId,
    name: "Collections Write Access",
    action: PermissionAction.WRITE,
    type: PermissionType.SYSTEM,
    contextId: "collections",
    description: "Allows creating and modifying collection definitions.",
  },
  {
    _id: "collections:create" as DatabaseId,
    name: "Collections Create Access",
    action: PermissionAction.CREATE,
    type: PermissionType.SYSTEM,
    contextId: "collections",
    description: "Allows creating new collections.",
  },
  {
    _id: "collections:update" as DatabaseId,
    name: "Collections Update Access",
    action: PermissionAction.UPDATE,
    type: PermissionType.SYSTEM,
    contextId: "collections",
    description: "Allows modifying existing collection schemas.",
  },
  {
    _id: "collections:delete" as DatabaseId,
    name: "Collections Delete Access",
    action: PermissionAction.DELETE,
    type: PermissionType.SYSTEM,
    contextId: "collections",
    description: "Allows deleting collections.",
  },

  // API permissions
  {
    _id: "api:graphql" as DatabaseId,
    name: "GraphQL API Access",
    action: PermissionAction.ACCESS,
    type: PermissionType.SYSTEM,
    description: "Grants access to the GraphQL API endpoint.",
  },
  {
    _id: "api:collections" as DatabaseId,
    name: "Collections API Access",
    action: PermissionAction.ACCESS,
    type: PermissionType.SYSTEM,
    description: "Grants access to the collections API endpoints.",
  },
  {
    _id: "api:export" as DatabaseId,
    name: "Export API Access",
    action: PermissionAction.EXECUTE,
    type: PermissionType.SYSTEM,
    description: "Grants access to the content export endpoints.",
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
    description: "Grants access to the data export API endpoint.",
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
    description: "Allows creating new entries inside collections.",
  },
  {
    _id: "collection:read" as DatabaseId,
    name: "Read Collection Entries",
    action: PermissionAction.READ,
    type: PermissionType.COLLECTION,
    description: "Allows viewing entries inside collections.",
  },
  {
    _id: "collection:update" as DatabaseId,
    name: "Update Collection Entries",
    action: PermissionAction.UPDATE,
    type: PermissionType.COLLECTION,
    description: "Allows editing existing collection entries.",
  },
  {
    _id: "collection:delete" as DatabaseId,
    name: "Delete Collection Entries",
    action: PermissionAction.DELETE,
    type: PermissionType.COLLECTION,
    description: "Allows deleting collection entries.",
  },

  // Content permissions
  {
    _id: "content:editor" as DatabaseId,
    name: "Content Editor",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
    description: "Allows creating and editing content entries in the visual editor.",
  },
  {
    _id: "content:builder" as DatabaseId,
    name: "Content Builder",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
    description: "Allows building and editing collection schemas in the Collection Builder.",
  },
  {
    _id: "content:images" as DatabaseId,
    name: "Image Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
    description: "Allows managing images attached to content (upload, transform, delete).",
  },

  // User management permissions (consolidated)
  {
    _id: "user:manage" as DatabaseId,
    name: "Manage Users",
    action: PermissionAction.MANAGE,
    type: PermissionType.USER,
    description: "Full control over users: create, edit, assign roles, and delete.",
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
    description: "Allows managing collection definitions and structures from settings.",
  },
  {
    _id: "config:collectionbuilder" as DatabaseId,
    name: "Collection Builder Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
    contextId: "config/collectionbuilder",
    description: "Allows using the Collection Builder to create and edit schemas.",
  },
  {
    _id: "config:graphql" as DatabaseId,
    name: "GraphQL Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
    contextId: "config/graphql",
    description: "Allows configuring the GraphQL API settings.",
  },
  {
    _id: "config:imageeditor" as DatabaseId,
    name: "ImageEditor Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
    contextId: "config/imageeditor",
    description: "Allows configuring the built-in image editor.",
  },
  {
    _id: "config:dashboard" as DatabaseId,
    name: "Dashboard Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
    contextId: "config/dashboard",
    description: "Allows configuring dashboard widgets and layout.",
  },
  {
    _id: "config:widgetManagement" as DatabaseId,
    name: "Widget Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.CONFIGURATION,
    contextId: "config/widgetManagement",
    description: "Allows installing, configuring, and removing widgets.",
  },
  {
    _id: "config:themeManagement" as DatabaseId,
    name: "Theme Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.CONFIGURATION,
    contextId: "config/themeManagement",
    description: "Allows managing admin themes and design tokens.",
  },
  {
    _id: "config:settings" as DatabaseId,
    name: "Settings Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
    contextId: "config/settings",
    description: "Allows changing system settings.",
  },
  {
    _id: "config:accessManagement" as DatabaseId,
    name: "Access Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.CONFIGURATION,
    contextId: "config/accessManagement",
    description: "Allows managing roles, permissions, and access tokens.",
  },
  {
    _id: "config:emailPreviews" as DatabaseId,
    name: "Email Previews",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
    contextId: "config/emailPreviews",
    description: "Allows previewing and managing email templates.",
  },
  {
    _id: "config:adminArea" as DatabaseId,
    name: "Admin Area Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
    contextId: "config/adminArea",
    description: "Allows managing the admin area configuration.",
  },
  {
    _id: "config:webhooks" as DatabaseId,
    name: "Webhooks Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.CONFIGURATION,
    contextId: "config/webhooks",
    description: "Allows configuring outgoing webhook callbacks.",
  },
  {
    _id: "config:audit" as DatabaseId,
    name: "Audit Log Access",
    action: PermissionAction.READ,
    type: PermissionType.SYSTEM,
    contextId: "config/audit",
    description: "Allows viewing the system audit log.",
  },
  {
    _id: "config:synchronization" as DatabaseId,
    name: "Config Synchronization",
    action: PermissionAction.MANAGE,
    type: PermissionType.CONFIGURATION,
    contextId: "config/synchronization",
    description: "Allows importing and exporting configuration for synchronization.",
  },
  {
    _id: "config:systemHealth" as DatabaseId,
    name: "System Health Access",
    action: PermissionAction.READ,
    type: PermissionType.SYSTEM,
    contextId: "config/systemHealth",
    description: "Allows viewing system health, metrics, and diagnostics.",
  },
  {
    _id: "config:automations" as DatabaseId,
    name: "Automations Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.CONFIGURATION,
    contextId: "config/automations",
    description: "Allows creating and managing event-driven automations.",
  },
  {
    _id: "config:extensions" as DatabaseId,
    name: "Extensions Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.CONFIGURATION,
    contextId: "config/extensions",
    description: "Allows installing and managing plugins and extensions.",
  },
  {
    _id: "config:marketplace" as DatabaseId,
    name: "Marketplace Access",
    action: PermissionAction.ACCESS,
    type: PermissionType.SYSTEM,
    contextId: "config/marketplace",
    description: "Allows browsing and installing from the extensions marketplace.",
  },

  // Admin permissions
  {
    _id: "admin:access" as DatabaseId,
    name: "Admin Access",
    action: PermissionAction.MANAGE,
    type: PermissionType.SYSTEM,
    contextId: "admin/access",
    description: "Grants access to the admin area.",
  },
  {
    _id: "config:importexport" as DatabaseId,
    name: "Import/Export Management",
    action: PermissionAction.MANAGE,
    type: PermissionType.CONFIGURATION,
    contextId: "config/import-export",
    description: "Allows importing and exporting content and configuration.",
  },
];
