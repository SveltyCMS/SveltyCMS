//lucia models
import type { InferSchemaType } from 'mongoose';
import { Schema } from 'mongoose';
import type { roles } from './types';

// Define the schema for the User model
export const UserSchema = {
	_id: {
		type: String, // Set the type of the _id field to String
		required: true // make it required
	},
	authMethod: String, // last login method was used
	email: String, // The email address of the user
	role: String, // The role of the user
	username: String, // The username of the user
	blocked: Boolean, // if the user is blocked
	firstname: String, // The first name of the user
	lastname: String, // The last name of the user
	avatar: String, // The avatar url to media api
	resetRequestedAt: String, // The date and time when a password reset was requested
	resetToken: String, // The password reset token value
	expiresAt: Date, // The date and time when the password reset token expires
	lastActiveAt: Date // The date and time when the user last accessed the application
};

export const TokenSchema = {
	token: String,
	userID: String,
	expiresIn: Number,
	type: String // to know what the token is for
};

type Modify<T, R> = Omit<T, keyof R> & R;
const mongooseUserSchema = new Schema(UserSchema);

export type User = Modify<
	InferSchemaType<typeof mongooseUserSchema>,
	{
		id: string;
		role: (typeof roles)[keyof typeof roles];
		authMethod: 'password' | 'token';
	}
>;

// Sessions are how you validate and keep track of users
export const session = {
	_id: {
		type: String, // session id
		required: true
	},
	user_id: {
		type: String,
		required: true // reference to user(id)
	},
	active_expires: {
		type: Number,
		required: true // the expiration time (unix) of the session (active)
	},
	idle_expires: {
		type: Number,
		required: true // the expiration time (unix) for the idle period
	}
};

// The key table stores the user’s keys.
export const key = {
	_id: {
		type: String, // key id in the form of: ${providerId}:${providerUserId}
		required: true
	},

	user_id: {
		type: String,
		required: true // reference to user(id)
	},

	providerId: {
		type: String,
		required: false,
		default: null // the provider id (e.g. google)
	},
	// Not strictly required by Lucia, but we'll be using it
	hashed_password: String,

	expires: {
		type: Number, // expiration for key if defined (number)
		default: null
	}
};

// Define the schema for the SignUpToken model
export const SignUpTokenSchema = {
	_id: {
		type: String // Set the type of the _id field to String
	},

	email: String, // The email address associated with the sign-up token
	role: String, // The role associated with the sign-up token
	resetRequestedAt: Date, // The date and time when the sign-up token was requested
	resetToken: String, // The sign-up token value
	expiresAt: Date // The date and time when the sign-up token expires
	// { _id: false }, // Do not automatically generate the _id field
};
