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
	strictObject,
	optional,
	minLength,
	maxLength,
	email as emailValidator,
	number,
	regex,
	pipe,
	check,
	type InferInput,
	nullable,
	transform
} from 'valibot';

// ParaglideJS
import * as m from '@src/paraglide/messages';

const MIN_PASSWORD_LENGTH = publicEnv.PASSWORD_STRENGTH || 8;

// Reusable Field-Level Schemas with `pipe` and undefined handling
const usernameSchema = pipe(
	string(),
	transform((value) => {
		if (value === null || value === undefined) return '';
		return value;
	}),
	minLength(2, m.formSchemas_username_min()),
	maxLength(24, m.formSchemas_username_max()),
	regex(/^[a-zA-Z0-9@$!%*#]+$/, m.formSchemas_usernameregex())
);

const emailSchema = pipe(
	string(),
	transform((value) => {
		if (value === null || value === undefined) return '';
		return value;
	}),
	emailValidator(m.formSchemas_Emailvalid())
);

const passwordSchema = pipe(
	string(),
	transform((value) => {
		if (value === null || value === undefined) return '';
		return value;
	}),
	minLength(MIN_PASSWORD_LENGTH, m.formSchemas_PasswordMessage({ passwordStrength: MIN_PASSWORD_LENGTH })),
	regex(
		new RegExp(`^(?=.*[A-Za-z])(?=.*\\d)(?=.*[@$!%*#?&])[A-Za-z\\d@$!%*#?&]{${MIN_PASSWORD_LENGTH},}$`),
		m.formSchemas_PasswordMessage({ passwordStrength: MIN_PASSWORD_LENGTH })
	)
);

const confirmPasswordSchema = pipe(
	string(),
	transform((value) => {
		if (value === null || value === undefined) return '';
		return value;
	})
);

const roleSchema = pipe(
	string(),
	transform((value) => {
		if (value === null || value === undefined) return '';
		return value;
	})
);

const tokenSchema = pipe(
	string(),
	transform((value) => {
		if (value === null || value === undefined) return '';
		return value;
	}),
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
export const forgotFormSchema = strictObject({
	email: emailSchema
});

// Reset Password Form Schema
const resetFormSchemaBase = strictObject({
	password: passwordSchema,
	confirm_password: passwordSchema,
	token: tokenSchema,
	email: emailSchema
});

export const resetFormSchema = pipe(
	resetFormSchemaBase,
	check((input) => input.password === input.confirm_password, m.formSchemas_Passwordmatch())
);

// Sign Up User Form Schema
const signUpFormSchemaBase = strictObject({
	username: usernameSchema,
	email: emailSchema,
	password: passwordSchema,
	confirm_password: passwordSchema,
	token: optional(pipe(
		string(),
		transform((value) => {
			if (value === null || value === undefined) return '';
			return value;
		})
	))
});

export const signUpFormSchema = pipe(
	signUpFormSchemaBase,
	check((input) => input.password === input.confirm_password, m.formSchemas_Passwordmatch())
);

// Google OAuth Token Schema
export const signUpOAuthFormSchema = strictObject({
	lang: pipe(
		nullable(string()),
		transform((value) => value === null ? undefined : value)
	)
});

// Validate New User Token Schema
export const addUserTokenSchema = strictObject({
	email: emailSchema,
	role: roleSchema,
	expiresIn: pipe(
		nullable(number()),
		transform((value) => value === null ? 24 : value)
	),
	expiresInLabel: pipe(
		nullable(string()),
		transform((value) => value === null ? undefined : value)
	)
});

// Change Password Form Schema
const changePasswordSchemaBase = strictObject({
	password: passwordSchema,
	confirm_password: passwordSchema,
	currentPassword: optional(pipe(
		string(),
		transform((value) => {
			if (value === null || value === undefined) return '';
			return value;
		})
	))
});

export const changePasswordSchema = pipe(
	changePasswordSchemaBase,
	check((input) => input.password === input.confirm_password, m.formSchemas_Passwordmatch())
);

// Widget Email Schema
export const widgetEmailSchema = strictObject({
	email: emailSchema
});

// Add User Schema
export const addUserSchema = strictObject({
	email: emailSchema,
	role: roleSchema
});

// Type exports
export type LoginFormSchema = InferInput<typeof loginFormSchema>;
export type ForgotFormSchema = InferInput<typeof forgotFormSchema>;
export type ResetFormSchema = InferInput<typeof resetFormSchema>;
export type SignUpFormSchema = InferInput<typeof signUpFormSchema>;
export type SignUpOAuthFormSchema = InferInput<typeof signUpOAuthFormSchema>;
export type AddUserTokenSchema = InferInput<typeof addUserTokenSchema>;
export type ChangePasswordSchema = InferInput<typeof changePasswordSchema>;
export type WidgetEmailSchema = InferInput<typeof widgetEmailSchema>;
export type AddUserSchema = InferInput<typeof addUserSchema>;
