/**
 * @file src/databases/auth/types.ts
 * @description Core types and enums for the authentication system
 *
 * This file contains the core type definitions and enums that are used
 * throughout the authentication system to avoid circular imports.
 */

import type { ISODateString, DatabaseId, FieldDefinition } from "@src/content/types";

// Re-export client-safe constants from the dedicated file
// This preserves backward compatibility for all existing server-side consumers
export { PermissionAction, PermissionType, icon, color } from "./permission-constants";
export type {
  PermissionAction as PermissionActionType,
  PermissionType as PermissionTypeType,
} from "./permission-constants";

// User Interface
export interface User {
  _id: DatabaseId; // Unique identifier for the user
  activeSessions?: number; // Number of active sessions
  avatar?: string; // URL of the user's avatar image
  backupCodes?: string[]; // Array of hashed backup codes for 2FA recovery
  blocked?: boolean; // Indicates if the user is blocked
  email: string; // Email address of the user
  emailVerified?: boolean; // Indicates if the user's email address has been verified
  expiresAt?: ISODateString; // When the reset token expires (ISO date string)
  failedAttempts?: number; // Tracks the number of consecutive failed login attempts
  firstName?: string; // First name of the user
  googleRefreshToken?: string | null; // Stores the refresh token from Google OAuth for token revocation on logout.
  id?: DatabaseId; // Alias for _id, used in some contexts
  is2FAEnabled?: boolean; // Indicates if the user has enabled two-factor authentication
  isAdmin?: boolean; // Indicates if the user has admin privileges
  isRegistered?: boolean; // Indicates if the user has completed registration
  last2FAVerification?: ISODateString; // Timestamp of last successful 2FA verification
  lastAccess?: ISODateString; // Last access timestamp
  lastActiveAt?: ISODateString; // The last time the user was active (ISO date string)
  lastAuthMethod?: string; // The last authentication method used by the user
  lastName?: string; // Last name of the user
  locale?: string; // Locale of the user
  lockoutUntil?: ISODateString | null; // Time until which the user is locked out of their account (ISO date string)
  password?: string; // Hashed password of the user
  permissions: string[]; // Set of permissions associated with the user
  preferences?: {
    rtc?: {
      enabled?: boolean; // Master switch
      sound?: boolean;
    };
  };
  resetRequestedAt?: ISODateString; // The last time the user requested a password reset (ISO date string)
  resetToken?: string; // Token for resetting the user's password
  role: string; // Role of the user (e.g., admin, developer, editor, user)
  roleIds?: DatabaseId[]; // Array of role IDs associated with the user
  samlId?: string; // Unique identifier from SAML Identity Provider (IdP)
  samlProvider?: string; // Identifier for the SAML Identity Provider (IdP)
  tenantId?: DatabaseId | null; // Identifier for the tenant the user belongs to (in multi-tenant mode)
  totpSecret?: string; // TOTP secret for 2FA (base32 encoded)
  username?: string; // Username of the user
  createdAt?: ISODateString; // When the user was created
  updatedAt?: ISODateString; // When the user was last updated
}

// Role Interface
export interface Role {
  _id: DatabaseId; // Unique identifier for the role
  color?: string; // Optional color for the role (e.g., for UI display)
  description?: string; // Optional description of the role
  groupName?: string; // Optional group name associated with the role
  icon?: string; // Optional icon for the role (e.g., for UI display)
  isAdmin?: boolean; // Indicates if the role has admin privileges
  name: string; // Name of the role
  permissions: string[]; // Array of permission IDs associated with the role
  tenantId?: DatabaseId | null; // Optional tenant identifier for multi-tenant installations
  createdAt?: ISODateString; // When the role was created
  updatedAt?: ISODateString; // When the role was last updated
}

export interface Permission {
  _id: DatabaseId; // Use _id for a unique identifier
  action: import("./permission-constants").PermissionAction; // Use the PermissionAction type
  contextId?: string; // Identifier for the context in which the permission is used (optional)
  description?: string; // Optional description for the permission
  name: string; // Display name of the permission
  type: import("./permission-constants").PermissionType; // Type of the permission context, e.g., "system", "collection"
}

// RolePermissions Interface
export interface RolePermissions {
  [role: string]: {
    create?: boolean;
    read?: boolean;
    write?: boolean;
    delete?: boolean;
    manage?: boolean;
  };
}

// Session Interface
export interface Session {
  _id: DatabaseId; // Unique identifier for the session
  expires: ISODateString; // When the session expires (ISO date string)
  rotated?: boolean; // Flag to mark rotated sessions
  rotatedTo?: DatabaseId; // ID of the new session this was rotated to
  tenantId?: DatabaseId | null; // Identifier for the tenant the session belongs to (in multi-tenant mode)
  user_id: DatabaseId; // The ID of the user who owns the session
}

// Token Interface
export interface Token {
  _id: DatabaseId; // Unique identifier for the token
  blocked?: boolean; // Whether the token is blocked
  createdAt?: ISODateString; // When the token was created
  email: string; // Email associated with the token
  expires: ISODateString; // When the session expires (ISO date string)
  role?: string; // Role associated with the token
  tenantId?: DatabaseId | null; // Tenant ID for multi-tenancy support
  token: string; // The token string
  type: string; // Type of the token (e.g., 'create', 'register', 'reset')
  updatedAt?: ISODateString; // When the token was last updated
  user_id: DatabaseId; // The ID of the user who owns the token
  username?: string; // Username associated with the token
}

// Session Store Interface
export interface SessionStore {
  close(): Promise<void>;
  delete(sessionId: DatabaseId): Promise<void>;
  deletePattern(pattern: string): Promise<number>;
  get(sessionId: DatabaseId): Promise<User | null>;
  set(sessionId: DatabaseId, user: User, expiration: ISODateString): Promise<void>;
  validateWithDB(
    sessionId: DatabaseId,
    dbValidationFn: (sessionId: DatabaseId) => Promise<User | null>,
  ): Promise<User | null>;
}

// Collection Interface
export interface Collection {
  collection_id: string; // Unique identifier for the collection
  name: string; // Name of the collection
  permissions: PermissionId[]; // Permissions specific to this collection
}

// Cookie Type
export interface Cookie {
  attributes: {
    // Attributes of the cookie
    sameSite: boolean | "lax" | "strict" | "none" | undefined;
    path: string;
    httpOnly: boolean;
    expires: ISODateString; // Expiration date of the cookie (ISO date string)
    secure: boolean;
  };
  name: string; // Name of the cookie
  value: string; // Value of the cookie
}

// RateLimit Interface
export interface RateLimit {
  action: ConfigPermissionAction; // Action being rate-limited
  current: number; // Current count of actions performed
  lastActionAt: string; // Last action timestamp (ISO date string)
  limit: number; // Maximum allowed actions
  user_id: string; // User ID the rate limit applies to
  windowMs: number; // Time window in milliseconds
}

// Sanitizes a permissions dictionary by removing empty roles
export const sanitizePermissions = (permissions: Record<string, Record<string, boolean>>) => {
  const res = Object.entries(permissions).reduce(
    (acc, [role, actions]) => {
      const nonEmptyActions = Object.entries(actions).reduce(
        (actionAcc, [action, value]) => {
          if (value !== false) {
            actionAcc[action] = value;
          }
          return actionAcc;
        },
        {} as Record<string, boolean>,
      );

      if (Object.keys(nonEmptyActions).length > 0) {
        acc[role] = nonEmptyActions;
      }
      return acc;
    },
    {} as Record<string, Record<string, boolean>>,
  );

  return Object.keys(res).length === 0 ? undefined : res;
};

// Model Interface for Generic CRUD Operations
export interface Model<T> {
  // Counts the number of documents matching the query
  countDocuments(query?: Partial<T>): Promise<number>;
  // Creates a new document
  create(data: Partial<T>): Promise<T>;

  // Deletes a single document matching the query
  deleteOne(query: Partial<T>): Promise<void>;

  // Finds multiple documents matching the query
  find(query: Partial<T>): Promise<T[]>;

  // Finds a single document matching the query
  findOne(query: Partial<T>): Promise<T | null>;

  // Updates a single document matching the query
  updateOne(query: Partial<T>, update: Partial<T>): Promise<void>;
}

// Additional Types
export type WidgetId = string; // Unique identifier for a widget
export declare const permissionMap: Map<string, Permission>;
export type PermissionId = string;
export type ConfigPermissionAction = string;
export type Field = FieldDefinition;

// Schema Interface
export interface Schema {
  fields: Field[]; // Array of fields defined in the schema
  icon?: string; // Optional icon representing the schema
  permissions?: RolePermissions; // Role-based permissions associated with the schema
  revision?: boolean; // Indicates if the schema supports revisions
  status?: string; // Optional status of the schema
}

// Helper to assign all permissions to a role (e.g., admin)
export function assignAllPermissionsToRole(role: Role): Role {
  return {
    ...role,
    permissions: Array.from(permissionMap.keys()),
  };
}

// Helper to assign permissions by type or action
export function assignPermissionsByFilter(role: Role, filter: (perm: Permission) => boolean): Role {
  return {
    ...role,
    permissions: Array.from(permissionMap.values())
      .filter(filter)
      .map((perm) => perm._id as string),
  };
}
