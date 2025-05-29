/**
 * @file src/auth/types.ts
 * @description Core types and enums for the authentication system
 *
 * This file contains the core type definitions and enums that are used
 * throughout the authentication system to avoid circular imports.
 */

// Permission Actions
export enum PermissionAction {
	CREATE = 'create', // Grants the ability to create a new resource or record.
	READ = 'read', // Grants the ability to read or view a resource or record.
	UPDATE = 'update', // Grants the ability to modify or update an existing resource or record.
	DELETE = 'delete', // Grants the ability to remove or delete a resource or record.
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
	email: string; // Email address of the user
	password?: string; // Hashed password of the user
	role: string; // Role of the user (e.g., admin, developer, editor, user)
	username?: string; // Username of the user
	firstName?: string; // First name of the user
	lastName?: string; // Last name of the user
	locale?: string; // Locale of the user
	avatar?: string; // URL of the user's avatar image
	lastAuthMethod?: string; // The last authentication method used by the user
	lastActiveAt?: Date; // The last time the user was active (ISO date string)
	expiresAt?: Date; // When the reset token expires (ISO date string)
	isRegistered?: boolean; // Indicates if the user has completed registration
	failedAttempts?: number; // Tracks the number of consecutive failed login attempts
	blocked?: boolean; // Indicates if the user is blocked
	resetRequestedAt?: Date; // The last time the user requested a password reset (ISO date string)
	resetToken?: string; // Token for resetting the user's password
	lockoutUntil?: Date | null; // Time until which the user is locked out of their account (ISO date string)
	is2FAEnabled?: boolean; // Indicates if the user has enabled two-factor authentication
	permissions: string[]; // Set of permissions associated with the user
}

// Role Interface
export interface Role {
	_id: string; // Unique identifier for the role
	name: string; // Name of the role
	description?: string; // Optional description of the role
	isAdmin?: boolean; // Indicates if the role has admin privileges
	permissions: string[]; // Array of permission IDs associated with the role
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
	expires: Date; // When the session expires (ISO date string)
}

// Token Interface
export interface Token {
	_id: string; // Unique identifier for the token
	user_id: string; // The ID of the user who owns the token
	token: string; // The token string
	email: string; // Email associated with the token
	expires: Date; // When the session expires (ISO date string)
	type: string; // Type of the token (e.g., 'create', 'register', 'reset')
}

// Session Store Interface
export interface SessionStore {
	get(session_id: string): Promise<User | null>;
	set(session_id: string, user: User, expiration: Date): Promise<void>;
	delete(session_id: string): Promise<void>;
	deletePattern(pattern: string): Promise<number>;
	validateWithDB(session_id: string, dbValidationFn: (session_id: string) => Promise<User | null>): Promise<User | null>;
	close(): Promise<void>;
}
