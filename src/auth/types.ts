/**
 * @file src/auth/types.ts
 * @description Type definitions for the authentication system.
 *
 * This module defines types and interfaces for:
 * - Users, roles, and permissions
 * - Sessions and tokens
 * - Authentication-related data structures
 *
 * Features:
 * - Comprehensive type definitions for auth entities
 * - Utility types and helper functions
 * - Centralized type management for the auth system
 *
 * Usage:
 * Imported throughout the auth system to ensure type consistency and safety.
 */

import { roles as configRoles, permissions as configPermissions } from '../../config/permissions';
import type { Role as ConfigRole, Permission as ConfigPermission } from '../../config/permissions';

// Type aliases
export type RoleId = string;
export type PermissionId = string;

export type Role = ConfigRole;
export type Permission = ConfigPermission;

// List of possible permissions for simplicity and type safety
export const permissionActions = ['create', 'read', 'write', 'delete', 'manage_roles', 'manage_permissions'] as const;

// List of possible context types for simplicity and type safety
export const contextTypes = ['collection', 'widget', 'system'] as const;

export type PermissionAction = (typeof permissionActions)[number];
export type ContextType = (typeof contextTypes)[number];

let loadedRoles: Role[] = [...configRoles];
let loadedPermissions: Permission[] = [...configPermissions];

export function getLoadedRoles(): Role[] {
	return loadedRoles;
}

// Function to get loaded permissions
export function getLoadedPermissions(): Permission[] {
	return loadedPermissions;
}

// Function to set loaded roles
export function setLoadedRoles(roles: Role[]): void {
	loadedRoles = roles;
}

// Function to set loaded permissions
export function setLoadedPermissions(permissions: Permission[]): void {
	loadedPermissions = permissions;
}

// Function to check if a role is an admin
export function isAdminRole(roleName: string): boolean {
	return roleName.toLowerCase() === 'admin';
}

// Function to get a role by name
export function getRoleByName(roleName: string): Role | undefined {
	return loadedRoles.find((role) => role.name.toLowerCase() === roleName.toLowerCase());
}

// Utility function to check if a user has a specific permission in a given context
export function hasPermission(user: User, action: PermissionAction, contextId: string): boolean {
	const userRole = getRoleByName(user.role);
	if (!userRole) return false;

	return userRole.permissions.some((permName) => {
		const perm = loadedPermissions.find((p) => p.name === permName);
		return perm && perm.action === action && (perm.contextId === contextId || perm.contextId === 'global');
	});
}

// Function to get permissions by role
export function getPermissionsByRole(roleName: string): Permission[] | undefined {
	const role = getRoleByName(roleName);
	if (!role) return undefined;
	return role.permissions.map((permName) => loadedPermissions.find((p) => p.name === permName)).filter(Boolean) as Permission[];
}

// Utility function to check if a user has a specific role
export function hasRole(user: User, roleName: string): boolean {
	return user.role.toLowerCase() === roleName.toLowerCase();
}

// Function to add a new role
export function addRole(newRole: Role): void {
	loadedRoles.push(newRole);
}

// Function to remove a role
export function removeRole(roleId: RoleId): void {
	const index = loadedRoles.findIndex((role) => role._id === roleId);
	if (index !== -1) {
		loadedRoles.splice(index, 1);
	}
}

// Function to update a role
export function updateRole(roleId: RoleId, updatedRole: Partial<Role>): void {
	const role = loadedRoles.find((r) => r._id === roleId);
	if (role) {
		Object.assign(role, updatedRole);
	}
}

// User interface represents a user in the system
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
	lastActiveAt?: Date; // The last time the user was active
	expiresAt?: Date; // When the reset token expires
	isRegistered?: boolean; // Indicates if the user has completed registration
	failedAttempts?: number; // Tracks the number of consecutive failed login attempts
	blocked?: boolean; // Indicates if the user is blocked
	resetRequestedAt?: Date; // The last time the user requested a password reset
	resetToken?: string; // Token for resetting the user's password
	lockoutUntil?: Date | null; // Time until which the user is locked out of their account
	is2FAEnabled?: boolean; // Indicates if the user has enabled two-factor authentication
}

// Session interface represents a session in the system
export interface Session {
	_id: string; // Unique identifier for the session
	user_id: string; // The ID of the user who owns the session
	expires: Date; // When the session expires
}

// Token interface represents a token in the system
export interface Token {
	token_id: string; // Unique identifier for the token
	user_id: string; // The ID of the user who owns the token
	token: string; // The token string
	email?: string; // Email associated with the token
	expires: Date; // When the token expires
}

// Collection interface to encapsulate permissions specific to collections
export interface Collection {
	collection_id: string; // Unique identifier for the collection
	name: string; // Name of the collection
	permissions: PermissionId[]; // Permissions specific to this collection
}

// Define the type for a Cookie
export type Cookie = {
	name: string; // Name of the cookie
	value: string; // Value of the cookie
	// Attributes of the cookie
	attributes: {
		sameSite: boolean | 'lax' | 'strict' | 'none' | undefined;
		path: string;
		httpOnly: boolean;
		expires: Date;
		secure: boolean;
	};
};

// Define the type for RateLimit
export interface RateLimit {
	user_id: string;
	action: PermissionAction;
	limit: number;
	windowMs: number;
	current: number;
	lastActionAt: Date;
}

// Icons for permissions
export const icon = {
	create: 'bi:plus-circle-fill',
	read: 'bi:eye-fill',
	write: 'bi:pencil-fill',
	delete: 'bi:trash-fill'
} as const;

// Color coding for permissions
export const color = {
	disabled: {
		create: 'variant-outline-primary',
		read: 'variant-outline-tertiary',
		write: 'variant-outline-warning',
		delete: 'variant-outline-error'
	},
	enabled: {
		create: 'variant-filled-primary',
		read: 'variant-filled-tertiary',
		write: 'variant-filled-warning',
		delete: 'variant-filled-error'
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

// Define the type for a Model
export interface Model<T> {
	create(data: Partial<T>): Promise<T>;
	findOne(query: Partial<T>): Promise<T | null>;
	find(query: Partial<T>): Promise<T[]>;
	updateOne(query: Partial<T>, update: Partial<T>): Promise<void>;
	deleteOne(query: Partial<T>): Promise<void>;
	countDocuments(query?: Partial<T>): Promise<number>;
}

// Define the type for Widgets
export type WidgetId = string;

// Define the type for Schema
export interface Schema {
	icon?: string;
	status?: string;
	revision?: boolean; // Indicates if the schema supports revisions
	permissions?: RolePermissions;
	fields: any[];
}

// Define the type for role-based permissions
export interface RolePermissions {
	[role: string]: {
		[action in PermissionAction]?: boolean;
	};
}

// Define the type for Drafts
export interface Draft {
	draft_id: string; // Unique identifier for the draft
	collection_id: string; // ID of the collection the draft belongs to
	user_id: string; // ID of the user who created the draft
	data: any; // Data associated with the draft
	createdAt: Date; // Creation timestamp of the draft
	updatedAt: Date; // Last update timestamp of the draft
	status: 'pending' | 'failed'; // Status of the draft
}

// Define the type for Revisions
export interface Revision {
	revision_id: string; // Unique identifier for the revision
	collection_id: string; // ID of the collection the revision belongs to
	user_id: string; // ID of the user who made the revision
	data: any; // Data associated with the revision
	createdAt: Date; // Creation timestamp of the revision
	version: number; // Version number of the revision
}
