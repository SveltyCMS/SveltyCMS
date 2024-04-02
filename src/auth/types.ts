import { Schema, type InferSchemaType, Model as M } from 'mongoose';

// Define Available Roles with Icons
export const roles = {
	admin: 'admin',
	developer: 'developer',
	editor: 'editor',
	user: 'user'
} as const;

// Define the type for roles
export type Roles = keyof typeof roles;

// Define a user Role permission that can be overwritten
export type permissions = {
	[K in keyof typeof roles]?: {
		create?: boolean; // This permission allows users to create new content.
		read?: boolean; // This permission allows users to view the content. They can't make any changes to it.
		write?: boolean; // This permission allows users to create new content and make changes to existing content.
		delete?: boolean; // This permission allows users to remove content from the system

		// Admin can do everything
	} & (K extends 'admin'
		? {
				create: true;
				read: true;
				write: true;
				delete: true;
			}
		: {});
};

// Icons permission
export const icon = {
	create: 'bi:plus-circle-fill',
	read: 'bi:eye-fill',
	write: 'bi:pencil-fill',
	delete: 'bi:trash-fill'
} as const;

// Colors permission
export const color = {
	create: 'primary',
	read: 'tertiary',
	write: 'warning',
	delete: 'error'
} as const;

// Define the schema for a User
export const UserSchema = {
	_id: {
		type: String, // The unique identifier for the user
		required: true // This field is required
	},
	email: {
		type: String, // The email of the user
		required: true // This field is required
	},
	password: String, // The password of the user
	role: String, // The role of the user
	username: String, // The username of the user
	lastAuthMethod: String, // The last method the user used to authenticate
	lastActiveAt: Date, // The last time the user was active
	is_registered: Boolean, // Whether the user has completed registration
	expiresAt: Date, // When the reset token expires
	blocked: Boolean, // Whether the user is blocked
	avatar: String, // The URL of the user's avatar
	resetRequestedAt: String, // The last time the user requested a password reset
	resetToken: String // The token for resetting the user's password
	// firstname: String, // The first name of the user
	// lastname: String, // The last name of the user
};

// Define the schema for a Token
export const TokenSchema = {
	token: String, // The token string
	userID: String, // The ID of the user who owns the token
	expiresIn: Number, // When the token expires
	type: String // The type of the token
};

// Define the schema for a Session
export const sessionSchema = {
	id: {
		type: String, // The unique identifier for the session
		required: true // This field is required
	},
	user_id: String, // The ID of the user who owns the session
	//device_id: String, // The ID of the device that owns the session
	expires: Number // When the session expires
};

// Create Mongoose schemas for the User, Token, and Session
export const mongooseUserSchema = new Schema(UserSchema, { timestamps: true });
export const mongooseTokenSchema = new Schema(TokenSchema, { timestamps: true });
export const mongooseSessionSchema = new Schema(sessionSchema);

// Define some types
type Modify<T, R> = Omit<T, keyof R> & R;
export type User = Modify<
	InferSchemaType<typeof mongooseUserSchema>,
	{
		_id?: string;
		id: 'string';
		role: Roles;
		lastAuthMethod: 'password' | 'token';
	}
>;
export type UserParams = ['id', 'createdAt', 'updatedAt'][number];
export type Token = InferSchemaType<typeof mongooseTokenSchema>;
export type Session = InferSchemaType<typeof mongooseSessionSchema>;

// Define the type for a Cookie
export type Cookie = {
	name: string; // The name of the cookie
	value: string; // The value of the cookie
	attributes: {
		sameSite: boolean | 'lax' | 'strict' | 'none' | undefined; // The SameSite attribute of the cookie
		path: string; // The path of the cookie
		httpOnly: true; // Whether the cookie is HTTP only
		expires: Date; // When the cookie expires
		secure: boolean; // Whether the cookie is secure
	};
};

// Define the type for a Model
export type Model = M<any, {}, {}, {}, any, any>;
