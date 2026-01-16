/**
 * @file src/databases/auth/types.ts
 * @description Core types and enums for the authentication system
 *
 * This file contains the core type definitions and enums that are used
 * throughout the authentication system to avoid circular imports.
 */

import type { ISODateString } from '@src/content/types';

// Permission Actions
export enum PermissionAction {
	CREATE = 'create', // Grants the ability to create a new resource or record.
	READ = 'read', // Grants the ability to read or view a resource or record.
	UPDATE = 'update', // Grants the ability to modify or update an existing resource or record.
	DELETE = 'delete', // Grants the ability to remove or delete a resource or record.
	WRITE = 'write', // Grants the ability to write or modify a resource or record.
	MANAGE = 'manage', // Grants overarching control over a resource or area, typically used for admin purposes.
	SHARE = 'share', // Grants the ability to share a resource or record with others, typically used for collaboration.
	ACCESS = 'access', // Grants basic access to a resource or area, typically used for admin purposes.
	EXECUTE = 'execute' // Grants the ability to execute a command or function, typically used for admin purposes.
}

// Permission Types
export enum PermissionType {
	COLLECTION = 'collection', // Collection-related permissions
	USER = 'user', // User-related permissions
	CONFIGURATION = 'configuration', // Configuration-related permissions
	SYSTEM = 'system', // System-wide permissions
	API = 'api' // API-related permissions
}

// User Interface
export interface User {
	_id: string; // Unique identifier for the user
	id?: string; // Alias for _id, used in some contexts
	email: string; // Email address of the user
	tenantId?: string; // Identifier for the tenant the user belongs to (in multi-tenant mode)
	password?: string; // Hashed password of the user
	role: string; // Role of the user (e.g., admin, developer, editor, user)
	username?: string; // Username of the user
	firstName?: string; // First name of the user
	lastName?: string; // Last name of the user
	locale?: string; // Locale of the user
	avatar?: string; // URL of the user's avatar image
	lastAuthMethod?: string; // The last authentication method used by the user
	lastActiveAt?: ISODateString; // The last time the user was active (ISO date string)
	expiresAt?: ISODateString; // When the reset token expires (ISO date string)
	isRegistered?: boolean; // Indicates if the user has completed registration
	failedAttempts?: number; // Tracks the number of consecutive failed login attempts
	blocked?: boolean; // Indicates if the user is blocked
	resetRequestedAt?: ISODateString; // The last time the user requested a password reset (ISO date string)
	resetToken?: string; // Token for resetting the user's password
	lockoutUntil?: ISODateString | null; // Time until which the user is locked out of their account (ISO date string)
	is2FAEnabled?: boolean; // Indicates if the user has enabled two-factor authentication
	totpSecret?: string; // TOTP secret for 2FA (base32 encoded)
	backupCodes?: string[]; // Array of hashed backup codes for 2FA recovery
	last2FAVerification?: ISODateString; // Timestamp of last successful 2FA verification
	permissions: string[]; // Set of permissions associated with the user
	googleRefreshToken?: string | null; // Stores the refresh token from Google OAuth for token revocation on logout.
	isAdmin?: boolean; // Indicates if the user has admin privileges
	activeSessions?: number; // Number of active sessions
	lastAccess?: ISODateString; // Last access timestamp
}

// Role Interface
export interface Role {
	_id: string; // Unique identifier for the role
	name: string; // Name of the role
	description?: string; // Optional description of the role
	isAdmin?: boolean; // Indicates if the role has admin privileges
	permissions: string[]; // Array of permission IDs associated with the role
	tenantId?: string; // Optional tenant identifier for multi-tenant installations
	groupName?: string; // Optional group name associated with the role
	icon?: string; // Optional icon for the role (e.g., for UI display)
	color?: string; // Optional color for the role (e.g., for UI display)
}

export interface Permission {
	_id: string; // Use _id for a unique identifier
	name: string; // Display name of the permission
	action: PermissionAction; // Use the PermissionAction enum
	type: PermissionType; // Type of the permission context, e.g., "system", "collection"
	contextId?: string; // Identifier for the context in which the permission is used (optional)
	description?: string; // Optional description for the permission
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
	_id: string; // Unique identifier for the session
	user_id: string; // The ID of the user who owns the session
	expires: ISODateString; // When the session expires (ISO date string)
	tenantId?: string; // Identifier for the tenant the session belongs to (in multi-tenant mode)
	rotated?: boolean; // Flag to mark rotated sessions
	rotatedTo?: string; // ID of the new session this was rotated to
}

// Token Interface
export interface Token {
	_id: string; // Unique identifier for the token
	user_id: string; // The ID of the user who owns the token
	token: string; // The token string
	email: string; // Email associated with the token
	expires: ISODateString; // When the session expires (ISO date string)
	type: string; // Type of the token (e.g., 'create', 'register', 'reset')
	tenantId?: string; // Tenant ID for multi-tenancy support
	blocked?: boolean; // Whether the token is blocked
	username?: string; // Username associated with the token
	role?: string; // Role associated with the token
	createdAt?: ISODateString; // When the token was created
	updatedAt?: ISODateString; // When the token was last updated
}

// Session Store Interface
export interface SessionStore {
	get(session_id: string): Promise<User | null>;
	set(session_id: string, user: User, expiration: ISODateString): Promise<void>;
	delete(session_id: string): Promise<void>;
	deletePattern(pattern: string): Promise<number>;
	validateWithDB(session_id: string, dbValidationFn: (session_id: string) => Promise<User | null>): Promise<User | null>;
	close(): Promise<void>;
}

// Collection Interface
export interface Collection {
	collection_id: string; // Unique identifier for the collection
	name: string; // Name of the collection
	permissions: PermissionId[]; // Permissions specific to this collection
}

// Cookie Type
export type Cookie = {
	name: string; // Name of the cookie
	value: string; // Value of the cookie
	attributes: {
		// Attributes of the cookie
		sameSite: boolean | 'lax' | 'strict' | 'none' | undefined;
		path: string;
		httpOnly: boolean;
		expires: ISODateString; // Expiration date of the cookie (ISO date string)
		secure: boolean;
	};
};

// RateLimit Interface
export interface RateLimit {
	user_id: string; // User ID the rate limit applies to
	action: ConfigPermissionAction; // Action being rate-limited
	limit: number; // Maximum allowed actions
	windowMs: number; // Time window in milliseconds
	current: number; // Current count of actions performed
	lastActionAt: string; // Last action timestamp (ISO date string)
}

// Icon and Color Mapping for Permissions
export const icon = {
	create: 'bi:plus-circle-fill',
	read: 'bi:eye-fill',
	write: 'bi:pencil-fill',
	delete: 'bi:trash-fill',
	share: 'bi:share-fill'
} as const;

export const color = {
	disabled: {
		create: 'preset-outline-primary',
		read: 'preset-outline-tertiary',
		write: 'preset-outline-warning',
		delete: 'preset-outline-error',
		share: 'preset-outline-secondary'
	},
	enabled: {
		create: 'preset-filled-primary',
		read: 'preset-filled-tertiary',
		write: 'preset-filled-warning',
		delete: 'preset-filled-error',
		share: 'preset-filled-secondary'
	}
} as const;

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
				{} as Record<string, boolean>
			);

			if (Object.keys(nonEmptyActions).length > 0) {
				acc[role] = nonEmptyActions;
			}
			return acc;
		},
		{} as Record<string, Record<string, boolean>>
	);

	return Object.keys(res).length === 0 ? undefined : res;
};

// Model Interface for Generic CRUD Operations
export interface Model<T> {
	// Creates a new document
	create(data: Partial<T>): Promise<T>;

	// Finds a single document matching the query
	findOne(query: Partial<T>): Promise<T | null>;

	// Finds multiple documents matching the query
	find(query: Partial<T>): Promise<T[]>;

	// Updates a single document matching the query
	updateOne(query: Partial<T>, update: Partial<T>): Promise<void>;

	// Deletes a single document matching the query
	deleteOne(query: Partial<T>): Promise<void>;

	// Counts the number of documents matching the query
	countDocuments(query?: Partial<T>): Promise<number>;
}

// Additional Types
export type WidgetId = string; // Unique identifier for a widget
export declare const permissionMap: Map<string, Permission>;
export type PermissionId = string;
export type ConfigPermissionAction = string;
export type Field = unknown;

// Schema Interface
export interface Schema {
	icon?: string; // Optional icon representing the schema
	status?: string; // Optional status of the schema
	revision?: boolean; // Indicates if the schema supports revisions
	permissions?: RolePermissions; // Role-based permissions associated with the schema
	fields: Field[]; // Array of fields defined in the schema, using the Field type from collections/types
}

// Helper to assign all permissions to a role (e.g., admin)
export function assignAllPermissionsToRole(role: Role): void {
	role.permissions = Array.from(permissionMap.keys());
}

// Helper to assign permissions by type or action
export function assignPermissionsByFilter(role: Role, filter: (perm: Permission) => boolean): void {
	role.permissions = Array.from(permissionMap.values())
		.filter(filter)
		.map((perm) => perm._id);
}
