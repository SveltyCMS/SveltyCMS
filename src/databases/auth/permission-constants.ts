/**
 * @file src/databases/auth/permission-constants.ts
 * @description
 * Client-safe permission constants extracted from auth/types.ts.
 *
 * This file contains ONLY plain object constants with zero server-side
 * imports, making it safe to import from Svelte components without
 * pulling database adapters or server-only modules into the client bundle.
 *
 * Features:
 * - client-safe permission action constants
 * - client-safe permission type constants
 * - UI icon and color mappings for permission actions
 */

// Permission Actions
export const PermissionAction = {
  CREATE: "create", // Grants the ability to create a new resource or record.
  READ: "read", // Grants the ability to read or view a resource or record.
  UPDATE: "update", // Grants the ability to modify or update an existing resource or record.
  DELETE: "delete", // Grants the ability to remove or delete a resource or record.
  WRITE: "write", // Grants the ability to write or modify a resource or record.
  MANAGE: "manage", // Grants overarching control over a resource or area, typically used for admin purposes.
  SHARE: "share", // Grants the ability to share a resource or record with others, typically used for collaboration.
  ACCESS: "access", // Grants basic access to a resource or area, typically used for admin purposes.
  EXECUTE: "execute", // Grants the ability to execute a command or function, typically used for admin purposes.
} as const;

export type PermissionAction = (typeof PermissionAction)[keyof typeof PermissionAction];

// Permission Types
export const PermissionType = {
  COLLECTION: "collection", // Collection-related permissions
  USER: "user", // User-related permissions
  CONFIGURATION: "configuration", // Configuration-related permissions
  SYSTEM: "system", // System-wide permissions
  API: "api", // API-related permissions
} as const;

export type PermissionType = (typeof PermissionType)[keyof typeof PermissionType];

// Icon and Color Mapping for Permissions (UI display)
export const icon = {
  create: "bi:plus-circle-fill",
  read: "bi:eye-fill",
  write: "bi:pencil-fill",
  delete: "bi:trash-fill",
  share: "bi:share-fill",
} as const;

export const color = {
  disabled: {
    create: "preset-outline-primary-500",
    read: "preset-outline-tertiary-500",
    write: "variant-outline-warning",
    delete: "variant-outline-error",
    share: "preset-outline-secondary-500",
  },
  enabled: {
    create: "preset-filled-primary-500",
    read: "preset-filled-tertiary-500",
    write: "variant-filled-warning",
    delete: "preset-filled-error-500",
    share: "variant-filled-secondary",
  },
} as const;
