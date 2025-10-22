/**
 * @file: apps/shared-utils/formSchemas.ts
 * @description: Defines Valibot schemas for various forms used in the application.
 *
 * @requires valibot - For schema definition and validation
 * @requires @src/stores/globalSettings - For accessing settings from database
 * @requires @src/paraglide/messages - For internationalized error messages
 */

import {
	boolean,
	check,
	email as emailValidator,
	forward,
	maxLength,
	minLength,
	nullable,
	object,
	optional,
	partialCheck,
	picklist,
	pipe,
	regex,
	strictObject,
	string,
	transform,
	trim,
	type InferInput
} from 'valibot';

// NOTE: Error messages are plain strings for universal (client/server) compatibility.
const MIN_PPASSWORD_LENGTH = 8;

// --- Reusable Username Schemas ---
const usernameSchema = pipe(
	string(),
	trim(),
	transform((value) => value ?? ''),
	minLength(2, 'Username must be at least 2 characters'),
	maxLength(24, 'Username must be at most 24 characters'),
	regex(/^[a-zA-Z0-9@$!%*#]+$/, 'Username contains invalid characters')
);

// --- Reusable Email Schemas ---
const emailSchema = pipe(
	string(),
	trim(),
	transform((value) => value ?? ''),
	transform((value) => value.toLowerCase()),
	emailValidator('Invalid email address')
);

// --- Reusable Password Schemas ---
const passwordSchema = pipe(
	string(),
	trim(),
	transform((value) => value ?? ''),
	minLength(MIN_PPASSWORD_LENGTH, `Password must be at least ${MIN_PPASSWORD_LENGTH} characters and include a letter, number, and special character`),
	regex(
		new RegExp(`^(?=.*[A-Za-z])(?=.*[0-9])(?=.*[@$!%*#?&])[A-Za-z0-9@$!%*#?&]{${MIN_PPASSWORD_LENGTH},}$`),
		`Password must be at least ${MIN_PPASSWORD_LENGTH} characters and include a letter, number, and special character`
	)
);

// --- Reusable Confirm Password Schemas ---
const confirmPasswordSchema = pipe(
	string(),
	trim(),
	transform((value) => value ?? '')
);

// --- Reusable Token Schemas ---
const tokenSchema = pipe(
	string(),
	trim(),
	transform((value) => value ?? ''),
	minLength(16, 'Token must be at least 16 characters')
);

// Form Schemas------------------------------------

// Login Form Schema
export const loginFormSchema = strictObject({
	email: emailSchema,
	password: passwordSchema,
	isToken: pipe(
		boolean(),
		transform((value) => value ?? false)
	)
});

// Forgot Password Form Schema
export const forgotFormSchema = object({
	email: emailSchema
});

// Reset Password Form Schema
export const resetFormSchema = pipe(
	object({
		password: passwordSchema,
		confirm_password: confirmPasswordSchema,
		token: tokenSchema,
		email: emailSchema
	}),
	forward(
		partialCheck([['password'], ['confirm_password']], (input) => input.password === input.confirm_password, 'Passwords do not match'),
		['confirm_password']
	)
);

// Sign Up User Form Schema
export const signUpFormSchema = pipe(
	strictObject({
		username: usernameSchema,
		email: emailSchema,
		password: passwordSchema,
		confirm_password: confirmPasswordSchema,
		token: optional(nullable(string()))
	}),
	check((input) => input.password === input.confirm_password, 'Passwords do not match')
);

// Google OAuth Token Schema
export const signUpOAuthFormSchema = object({
	lang: nullable(string())
});

// Validate New User Token Schema
export const addUserTokenSchema = object({
	email: emailSchema,
	role: string(),
	expiresIn: picklist(['2 hrs', '12 hrs', '2 days', '1 week', '2 weeks', '1 month'])
});

// Change Password Form Schema
export const changePasswordSchema = object({
	old_password: string(),
	password: passwordSchema,
	confirm_password: string()
});

// Widget Email Schema
export const widgetEmailSchema = object({
	email: emailSchema
});

// Add User Schema
export const addUserSchema = object({
	email: emailSchema,
	role: string()
});

// Setup Admin User Schema
export const setupAdminSchema = pipe(
	strictObject({
		username: usernameSchema,
		email: emailSchema,
		password: passwordSchema,
		confirmPassword: confirmPasswordSchema
	}),
	check((input) => input.password === input.confirmPassword, 'Passwords do not match')
);

// Type Exports
export type LoginFormSchema = InferInput<typeof loginFormSchema>;
export type ForgotFormSchema = InferInput<typeof forgotFormSchema>;
export type ResetFormSchema = InferInput<typeof resetFormSchema>;
export type SignUpFormSchema = InferInput<typeof signUpFormSchema>;
export type SignUpOAuthFormSchema = InferInput<typeof signUpOAuthFormSchema>;
export type AddUserTokenSchema = InferInput<typeof addUserTokenSchema>;
export type ChangePasswordSchemaType = InferInput<typeof changePasswordSchema>;
export type WidgetEmailSchema = InferInput<typeof widgetEmailSchema>;
export type AddUserSchema = InferInput<typeof addUserSchema>;
export type SetupAdminSchema = InferInput<typeof setupAdminSchema>;
