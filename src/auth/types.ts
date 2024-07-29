// Add a function to set loaded roles and permissions
let loadedRoles: Role[] = [];
let loadedPermissions: Permission[] = [];

// Add a function to get loaded roles
export type LoadedRolesAndPermissions = {
	roles: Role[];
	permissions: Permission[];
};

// Add a function to set loaded roles and permissions
export function setLoadedRolesAndPermissions(data: LoadedRolesAndPermissions) {
	loadedRoles = data.roles;
	loadedPermissions = data.permissions;
}

// Add a function to get loaded roles
export function getLoadedRoles(): Role[] {
	return loadedRoles;
}

// Add a function to get loaded permissions
export function getLoadedPermissions(): Permission[] {
	return loadedPermissions;
}

// Add a function to check if a role is an admin
export function isAdminRole(roleName: string): boolean {
	return roleName.toLowerCase() === 'admin';
}

// Add a function to get a role by name
export function getRoleByName(roleName: string): Role | undefined {
	return loadedRoles.find((role) => role.name.toLowerCase() === roleName.toLowerCase());
}

// List of possible permissions for simplicity and type safety.
export const permissionActions = [
	'create', // Allows creating new content.
	'read', // Allows viewing content.
	'write', // Allows modifying existing content.
	'delete' // Allows removing content.
] as const;

// List of possible context types for simplicity and type safety.
export const contextTypes = [
	'collection', // Collection context
	'widget', // Widget context
	'system' // System context
] as const;

// Create type aliases
export type RoleId = string;
export type PermissionId = string;
export type PermissionAction = (typeof permissionActions)[number];
export type ContextType = (typeof contextTypes)[number];

// Define the type for a PermissionConfig
export interface PermissionConfig {
	contextId: string; // This could be a collectionId or widgetId indicating scope
	requiredRole: RoleId; // The role that is required to perform the action
	action: PermissionAction; // The action that the role is allowed to perform
	contextType: ContextType | string; // The type of context that the role is allowed to perform the action in
}

// Permission interface to define what each permission can do
export interface Permission {
	permission_id: PermissionId; // Unique identifier for the permission
	name: string; // Name of the permission
	action: PermissionAction; // The action that the role is allowed to perform
	contextId: string; // This could be a collectionId or widgetId indicating scope
	description?: string; // Description of the permission
	contextType: ContextType | string; // Distinguishes between collections and widgets
	requiredRole: RoleId; // The role that is required to perform the action
	requires2FA?: boolean; // Indicates if this permission requires two-factor authentication
}

// Define the type for a Role with dynamically assigned permissions
export interface Role {
	_id: RoleId; // Unique identifier for the role
	name: string; // Name of the role
	description?: string; // Description of the role
	permissions: PermissionId[]; // This includes permission IDs which can be resolved to actual permissions
}

// Define the type for RateLimit
export interface RateLimit {
	user_id: string; // The ID of the user
	action: PermissionAction; // The action being rate limited
	limit: number; // Number of allowed actions
	windowMs: number; // Time window in milliseconds
	current: number; // Current count of actions
	lastActionAt: Date; // Time of the last action
}

// User interface represents a user in the system.
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
	permissions?: Permission[]; // Optional user-specific permissions
}

// Session interface represents a session in the system.
export interface Session {
	session_id: string; // Unique identifier for the session
	device_id: string; // ID of the device used for the session
	user_id: string; // The ID of the user who owns the session
	expires: Date; // When the session expires
}

// Token interface represents a token in the system.
export interface Token {
	token_id: string; // Unique identifier for the token
	user_id: string; // The ID of the user who owns the token
	token: string; // The token string
	email?: string; // Email associated with the token
	expires: Date; // When the token expires
}

// Collection interface to encapsulate permissions specific to collections.
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

// Utility function to check if the action is within the rate limit.
function checkRateLimit(rateLimits: RateLimit[], user_id: string, action: PermissionAction): boolean {
	const rateLimit = rateLimits?.find((rl) => rl.user_id === user_id && rl.action === action);
	if (rateLimit) {
		const now = new Date();
		const timePassed = now.getTime() - rateLimit.lastActionAt.getTime();
		if (timePassed < rateLimit.windowMs) {
			if (rateLimit.current >= rateLimit.limit) {
				return false;
			}
			rateLimit.current++;
		} else {
			rateLimit.current = 1;
			rateLimit.lastActionAt = now;
		}
	}
	return true;
}

// Main utility function to check if a user has a specific permission in a given context considering both user and role-based permissions.
export function hasPermission(user: User, roles: Role[], action: PermissionAction, contextId: string, rateLimits: RateLimit[]): boolean {
	if (!checkRateLimit(rateLimits, user._id!, action)) {
		return false;
	}

	const userPermissions = user.permissions || [];
	const rolePermissions = getRoleByName(user.role)?.permissions || [];

	const allPermissions = [...userPermissions, ...rolePermissions];

	return allPermissions.some((permId) => {
		const perm = loadedPermissions.find((p) => p.permission_id === permId);
		return perm && perm.action === action && (perm.contextId === contextId || perm.contextId === 'global');
	});
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

// Define the type for a Widgets
export type WidgetId = string;

// Define the type for Schema
export interface Schema {
	icon?: string;
	status?: string;
	revision?: boolean;
	permissions?: RolePermissions;
	fields: any[];
}

// Define the type for role-based permissions
export interface RolePermissions {
	[role: string]: {
		[action in PermissionAction]?: boolean;
	};
}
