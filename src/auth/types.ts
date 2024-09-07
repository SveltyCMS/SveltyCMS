/**
 * @file src/auth/types.ts
 * @description Type definitions and utility functions for the authentication system.
 *
 * This module defines types, interfaces, and helper functions for:
 * - Users, roles, and permissions
 * - Sessions and tokens
 * - Authentication-related data structures and operations
 *
 * Usage:
 * Imported throughout the auth system to ensure type consistency and safety.
 */

import { PermissionAction as ConfigPermissionAction, PermissionType } from '../../config/permissions';

// Type aliases for identifiers
export type RoleId = string;
export type PermissionId = string;

// Role Interface
export interface Role {
	_id: string; // Unique identifier for the role
	name: string; // Name of the role
	description?: string; // Optional description of the role
	isAdmin?: boolean; // Indicates if the role has admin privileges
	permissions: string[]; // Array of permission IDs associated with the role
	groupName?: string; // Optional group name associated with the role
}

// Permission Interface
export interface Permission {
	_id: string; // Use _id for a unique identifier
	name: string; // Display name of the permission
	action: ConfigPermissionAction; // Use the imported PermissionAction enum
	type: PermissionType; // Type of the permission context, e.g., "system", "collection"
	contextId?: string; // Identifier for the context in which the permission is used (optional)
	contextType?: string; // Type of context, e.g., "system", "configuration" (optional)
	requiredRole?: string; // Role required to use this permission, e.g., "admin", "user" (optional)
	description?: string; // Optional description for the permission
}

// Constants for Context Types
export const contextTypes = ['collection', 'widget', 'system'] as const;
export type ContextType = (typeof contextTypes)[number];

// Default roles and permissions loaded from configuration
let loadedRoles: Role[] = [];
let loadedPermissions: Permission[] = [];

// Functions to Manage Loaded Roles and Permissions

// Retrieves the loaded roles
export const getLoadedRoles = (): Role[] => loadedRoles;

// Retrieves the loaded permissions
export const getLoadedPermissions = (): Permission[] => Array.from(loadedPermissions.values());

// Sets the loaded roles
export function setLoadedRoles(roles: Role[]): void {
	loadedRoles = roles;
}

// Sets the loaded permissions
export function setLoadedPermissions(permissions: Permission[]): void {
	loadedPermissions = permissions;
}

// Checks if a given role is an admin role
export function isAdminRole(roleName: string): boolean {
	return roleName.toLowerCase() === 'admin';
}

// Retrieves a role by its name
export function getRoleByName(roleName: string): Role | undefined {
	return loadedRoles.find((role) => role.name.toLowerCase() === roleName.toLowerCase());
}

// Checks if a user has a specific permission in a given context
export function hasPermission(user: User, action: ConfigPermissionAction, type: PermissionType): boolean {
	const userRole = getRoleByName(user.role);
	if (!userRole) return false;

	return Array.from(userRole.permissions).some((permId) => {
		const perm = loadedPermissions.find((p) => p._id === permId);
		return perm && perm.action === action && (perm.type === type || perm.type === PermissionType.SYSTEM);
	});
}

// Retrieves permissions by role
export function getPermissionsByRole(roleName: string): Permission[] | undefined {
	const role = getRoleByName(roleName);
	if (!role) return undefined;
	return Array.from(role.permissions)
		.map((permissionId) => loadedPermissions.find((p) => p._id === permissionId))
		.filter((permission): permission is Permission => !!permission);
}

// Checks if a user has a specific role
export function hasRole(user: User, roleName: string): boolean {
	return user.role.toLowerCase() === roleName.toLowerCase();
}

// Adds a new role to the loaded roles
export function addRole(newRole: Role): void {
	loadedRoles.push(newRole);
}

// Removes a role by its ID
export function removeRole(roleId: RoleId): void {
	loadedRoles = loadedRoles.filter((role) => role._id !== roleId);
}

// Updates a role by its ID
export function updateRole(roleId: RoleId, updatedRole: Partial<Role>): void {
	const index = loadedRoles.findIndex((r) => r._id === roleId);
	if (index !== -1) {
		// Spread the original role and the updated properties into a new object
		loadedRoles[index] = {
			...loadedRoles[index],
			...updatedRole,
			// Ensure permissions remain an array
			permissions: updatedRole.permissions ? [...updatedRole.permissions] : loadedRoles[index].permissions
		};
	}
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
	lastActiveAt?: number; // The last time the user was active (Unix timestamp in seconds)
	expiresAt?: number; // When the reset token expires (Unix timestamp in seconds)
	isRegistered?: boolean; // Indicates if the user has completed registration
	failedAttempts?: number; // Tracks the number of consecutive failed login attempts
	blocked?: boolean; // Indicates if the user is blocked
	resetRequestedAt?: number; // The last time the user requested a password reset (Unix timestamp in seconds)
	resetToken?: string; // Token for resetting the user's password
	lockoutUntil?: number | null; // Time until which the user is locked out of their account (Unix timestamp in seconds)
	is2FAEnabled?: boolean; // Indicates if the user has enabled two-factor authentication
	permissions: Set<string>; // Set of permissions associated with the user
}

// Session Interface
export interface Session {
	_id: string; // Unique identifier for the session
	user_id: string; // The ID of the user who owns the session
	expires: number; // When the session expires (Unix timestamp in seconds)
}

// Token Interface
export interface Token {
	_id: string; // Unique identifier for the token
	user_id: string; // The ID of the user who owns the token
	token: string; // The token string
	email?: string; // Email associated with the token
	expires: number; // When the token expires (Unix timestamp in seconds)
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
		expires: number; // Expiration date of the cookie as a Unix timestamp in seconds
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
	lastActionAt: number; // Last action timestamp (Unix timestamp in seconds)
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
		create: 'variant-outline-primary',
		read: 'variant-outline-tertiary',
		write: 'variant-outline-warning',
		delete: 'variant-outline-error',
		share: 'variant-outline-secondary'
	},
	enabled: {
		create: 'variant-filled-primary',
		read: 'variant-filled-tertiary',
		write: 'variant-filled-warning',
		delete: 'variant-filled-error',
		share: 'variant-filled-secondary'
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

// RolePermissions Interface
export interface RolePermissions {
	[role: string]: {
		[action in ConfigPermissionAction]?: boolean; // Defines actions permitted for each role
	};
}

// Schema Interface
export interface Schema {
	icon?: string; // Optional icon representing the schema
	status?: string; // Optional status of the schema
	revision?: boolean; // Indicates if the schema supports revisions
	permissions?: RolePermissions; // Role-based permissions associated with the schema
	fields: any[]; // Array of fields defined in the schema
}

// Draft Interface
export interface Draft {
	draft_id: string; // Unique identifier for the draft
	collection_id: string; // ID of the collection the draft belongs to
	user_id: string; // ID of the user who created the draft
	data: any; // Data associated with the draft
	createdAt: number; // Creation timestamp of the draft (Unix timestamp in seconds)
	updatedAt: number; // Last update timestamp of the draft (Unix timestamp in seconds)
	status: 'pending' | 'failed'; // Status of the draft
}

// Revision Interface
export interface Revision {
	revision_id: string; // Unique identifier for the revision
	collection_id: string; // ID of the collection the revision belongs to
	user_id: string; // ID of the user who made the revision
	data: any; // Data associated with the revision
	createdAt: number; // Creation timestamp of the revision (Unix timestamp in seconds)
	version: number; // Version number of the revision
}
