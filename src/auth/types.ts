// Define the hardcoded admin role
export const adminRole = 'admin';

// Define flexible roles
export const flexibleRoles = ['developer', 'editor', 'user'] as const;

// Combine all roles
export const roles = [adminRole, ...flexibleRoles] as const;

// Define the type for roles
export type Roles = (typeof roles)[number];

// Permissions for roles
export const permissions = [
	'create', // This permission allows users to create new content.
	'read', // This permission allows users to view the content. They can't make any changes to it.
	'write', // This permission allows users to create new content and make changes to existing content.
	'delete' // This permission allows users to remove content from the system
] as const;

// Defines Permissions type for flexible role-based permissions.
export type Permissions = {
	[K in Roles]?: { [permission in (typeof permissions)[number]]?: boolean };
};

// Define a user Role permission that can be overwritten
export const defaultPermissions = roles.reduce((acc, role) => {
	return {
		...acc,
		[role]: permissions.reduce((acc, permission) => {
			switch (role) {
				case 'admin':
				case 'developer':
					return { ...acc, [permission]: true };
				case 'editor':
					return { ...acc, [permission]: true };
				case 'user':
					return { ...acc, [permission]: true, write: false };
				default:
					return { ...acc, [permission]: false };
			}
		}, {})
	} as Permissions;
}, {} as Permissions);

// Icons permission
export const icon = {
	create: 'bi:plus-circle-fill',
	read: 'bi:eye-fill',
	write: 'bi:pencil-fill',
	delete: 'bi:trash-fill'
} as const;

// Colors permission
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

// User interface represents a user in the system.
export interface User {
	id: string; // Unique identifier for the user
	email: string; // Email address of the user
	password?: string; // Hashed password of the user
	role: string; // Role of the user (e.g., admin, developer, editor, user)
	username?: string; // Username of the user
	avatar?: string; // URL of the user's avatar image
	lastAuthMethod?: string; // The last authentication method used by the user
	lastActiveAt?: Date; // The last time the user was active
	expiresAt?: Date; // When the reset token expires
	is_registered?: boolean; // Indicates if the user has completed registration
	blocked?: boolean; // Indicates if the user is blocked
	resetRequestedAt?: string; // The last time the user requested a password reset
	resetToken?: string; // Token for resetting the user's password
}

// Session interface represents a session in the system.
export interface Session {
	id: string; // Unique identifier for the session
	user_id: string; // The ID of the user who owns the session
	expires: Date; // When the session expires
}

// Token interface represents a token in the system.
export interface Token {
	id: string; // Unique identifier for the token
	user_id: string; // The ID of the user who owns the token
	token: string; // The token string
	email?: string; // Email associated with the token
	expires: Date; // When the token expires
}

// Define the type for a Cookie
export type Cookie = {
	name: string;
	value: string;
	attributes: {
		sameSite: boolean | 'lax' | 'strict' | 'none' | undefined;
		path: string;
		httpOnly: true;
		expires: Date;
		secure: boolean;
	};
};

// Sanitizes a permissions dictionary by removing empty roles
export const sanitizePermissions = (permissions: any) => {
	const res = Object.keys(permissions).reduce((acc, r) => {
		acc[r] = Object.keys(permissions[r]).reduce((acc, p) => {
			if (permissions[r][p] != defaultPermissions[r][p]) {
				acc[p] = permissions[r][p];
			}
			return acc;
		}, {});

		if (Object.keys(acc[r]).length == 0) delete acc[r];
		return acc;
	}, {});

	if (Object.keys(res).length == 0) return undefined;
	return res;
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
