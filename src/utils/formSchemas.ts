/**
 * @file: src/utils/formSchemas.ts
 * @description: Defines Valibot schemas for various forms used in the application.
 *
 * @requires valibot - For schema definition and validation
 * @requires @root/config/public - For accessing public environment variables
 * @requires @src/paraglide/messages - For internationalized error messages
 */

import { publicEnv } from '@root/config/public';
import {
	string,
	boolean,
	optional,
	minLength,
	maxLength,
	email as emailValidator,
	regex,
	object,
	pipe,
	forward,
	partialCheck,
	type InferInput,
	nullable,
	transform,
	strictObject,
	check,
	trim,
	picklist
} from 'valibot';

// ParaglideJS
import * as m from '@src/paraglide/messages';

const MIN_PPASSWORD_LENGTH = publicEnv.PASSWORD_LENGTH || 8;

// --- Reusable Username Schemas ---
const usernameSchema = pipe(
	string(),
	trim(),
	transform((value) => value ?? ''),
	minLength(2, m.formSchemas_username_min()),
	maxLength(24, m.formSchemas_username_max()),
	regex(/^[a-zA-Z0-9@$!%*#]+$/, m.formSchemas_usernameregex())
);

// --- Reusable Email Schemas ---
const emailSchema = pipe(
	string(),
	trim(),
	transform((value) => value ?? ''),
	transform((value) => value.toLowerCase()), // Normalize email to lowercase
	emailValidator(m.formSchemas_Emailvalid())
);

// --- Reusable Password Schemas ---
const passwordSchema = pipe(
	string(),
	trim(),
	transform((value) => value ?? ''),
	minLength(MIN_PPASSWORD_LENGTH, m.formSchemas_PasswordMessage({ passwordStrength: MIN_PPASSWORD_LENGTH })),
	regex(
		new RegExp(`^(?=.*[A-Za-z])(?=.*\\d)(?=.*[@$!%*#?&])[A-Za-z\\d@$!%*#?&]{${MIN_PPASSWORD_LENGTH},}$`),
		m.formSchemas_PasswordMessage({ passwordStrength: MIN_PPASSWORD_LENGTH })
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
	minLength(16, m.formSchemas_Emailvalid())
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
		partialCheck([['password'], ['confirm_password']], (input) => input.password === input.confirm_password, m.formSchemas_Passwordmatch()),
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
	check((input) => input.password === input.confirm_password, m.formSchemas_Passwordmatch())
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

// Type Exports
export type LoginFormSchema = InferInput<typeof loginFormSchema>;
export type ForgotFormSchema = InferInput<typeof forgotFormSchema>;
export type ResetFormSchema = InferInput<typeof resetFormSchema>;
export type SignUpFormSchema = InferInput<typeof signUpFormSchema>;
export type SignUpOAuthFormSchema = InferInput<typeof signUpOAuthFormSchema>;
export type AddUserTokenSchema = InferInput<typeof addUserTokenSchema>;
export type ChangePasswordSchemaType = InferInput<typeof changePasswordSchema>; //  Export type
export type WidgetEmailSchema = InferInput<typeof widgetEmailSchema>;
export type AddUserSchema = InferInput<typeof addUserSchema>;
