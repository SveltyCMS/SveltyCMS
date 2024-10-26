/**
 * @file: src/utils/formSchemas.ts
 * @description: Defines Valibot schemas for various forms used in the application.
 *
 * @requires valibot - For schema definition and validation
 * @requires @root/config/public - For accessing public environment variables
 * @requires @src/paraglide/messages - For internationalized error messages
 */

import { publicEnv } from '@root/config/public';

import { string, boolean, object, optional, minLength, maxLength, email as emailValidator, regex, pipe, custom, type Type } from 'valibot';

// ParaglideJS
import * as m from '@src/paraglide/messages';

const MIN_PASSWORD_LENGTH = publicEnv.PASSWORD_STRENGTH || 8;

// Reusable Field-Level Schemas with `pipe`
const usernameSchema = pipe(
	string(),
	minLength(2, m.formSchemas_username_min()),
	maxLength(24, m.formSchemas_username_max()),
	regex(/^[a-zA-Z0-9@$!%*#]+$/, m.formSchemas_usernameregex())
);

const emailSchema = pipe(string(), emailValidator(m.formSchemas_Emailvalid()));

const passwordSchema = pipe(
	string(),
	minLength(MIN_PASSWORD_LENGTH, m.formSchemas_PasswordMessage({ passwordStrength: MIN_PASSWORD_LENGTH })),
	regex(
		new RegExp(`^(?=.*[A-Za-z])(?=.*\\d)(?=.*[@$!%*#?&])[A-Za-z\\d@$!%*#?&]{${MIN_PASSWORD_LENGTH},}$`),
		m.formSchemas_PasswordMessage({ passwordStrength: MIN_PASSWORD_LENGTH })
	)
);

const confirmPasswordSchema = string();
const roleSchema = string();
const tokenSchema = pipe(string(), minLength(16, m.formSchemas_Emailvalid()));

// Form Schemas------------------------------------

// Login Form Schema
export const loginFormSchema = object({
	email: emailSchema,
	password: passwordSchema,
	isToken: boolean()
});

// Forgot Password Form Schema
export const forgotFormSchema = object({
	email: emailSchema
});

// Reset Password Form Schema
const resetFormSchemaBase = object({
	password: passwordSchema,
	confirm_password: confirmPasswordSchema,
	token: tokenSchema,
	email: emailSchema
});

type ResetFormType = {
	password: string;
	confirm_password: string;
	token: string;
	email: string;
};

export const resetFormSchema = pipe(
	resetFormSchemaBase,
	custom<ResetFormType>((input) => input.password === input.confirm_password, m.formSchemas_Passwordmatch())
);

// Sign Up User Form Schema
const signUpFormSchemaBase = object({
	username: usernameSchema,
	email: emailSchema,
	password: passwordSchema,
	confirm_password: confirmPasswordSchema,
	token: optional(string())
});

type SignUpFormType = {
	username: string;
	email: string;
	password: string;
	confirm_password: string;
	token?: string;
};

export const signUpFormSchema = pipe(
	signUpFormSchemaBase,
	custom<SignUpFormType>((input) => input.password === input.confirm_password, m.formSchemas_Passwordmatch())
);

// Google OAuth Token Schema
export const signUpOAuthFormSchema = object({
	lang: string()
});

// Validate New User Token Schema
export const addUserTokenSchema = object({
	email: emailSchema,
	role: roleSchema,
	expiresIn: string(),
	expiresInLabel: string()
});

// Change Password Form Schema
const changePasswordSchemaBase = object({
	password: passwordSchema,
	confirm_password: confirmPasswordSchema
});

type ChangePasswordType = {
	password: string;
	confirm_password: string;
};

export const changePasswordSchema = pipe(
	changePasswordSchemaBase,
	custom<ChangePasswordType>((input) => input.password === input.confirm_password, m.formSchemas_Passwordmatch())
);

// Widget Email Schema
export const widgetEmailSchema = object({
	email: emailSchema
});

// Add User Schema
export const addUserSchema = object({
	email: emailSchema,
	role: roleSchema
});

// Type exports
export type LoginFormSchema = Type<typeof loginFormSchema>;
export type ForgotFormSchema = Type<typeof forgotFormSchema>;
export type ResetFormSchema = Type<typeof resetFormSchema>;
export type SignUpFormSchema = Type<typeof signUpFormSchema>;
export type SignUpOAuthFormSchema = Type<typeof signUpOAuthFormSchema>;
export type AddUserTokenSchema = Type<typeof addUserTokenSchema>;
export type ChangePasswordSchema = Type<typeof changePasswordSchema>;
export type WidgetEmailSchema = Type<typeof widgetEmailSchema>;
export type AddUserSchema = Type<typeof addUserSchema>;
