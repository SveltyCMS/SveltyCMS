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
    number,
    regex,
    object,
    pipe,
    forward,
    partialCheck,
    type InferInput,
    nullable,
	transform,
	strictObject,
	check
} from 'valibot';

// ParaglideJS
import * as m from '@src/paraglide/messages';

const MIN_PASSWORD_LENGTH = publicEnv.PASSWORD_STRENGTH || 8;

// Reusable Field-Level Schemas
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
export const forgotFormSchema = object({
    email: emailSchema
});

// Reset Password Form Schema
export const resetFormSchema = pipe(
    object({
        password: passwordSchema,
        confirm_password: string(),
        token: tokenSchema,
        email: emailSchema
    }),
    forward(
        partialCheck(
            [['password'], ['confirm_password']],
            (input) => input.password === input.confirm_password,
            m.formSchemas_Passwordmatch()
        ),
        ['confirm_password']
    )
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
export const signUpOAuthFormSchema = object({
    lang: nullable(string())
});

// Validate New User Token Schema
export const addUserTokenSchema = object({
    email: emailSchema,
    role: string(),
    expiresIn: nullable(number()),
    expiresInLabel: nullable(string())
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
    object({
        password: passwordSchema,
        confirm_password: string(),
        old_password: optional(string())
    }),
    forward(
        partialCheck(
            [['password'], ['confirm_password']],
            (input) => input.password === input.confirm_password,
            m.formSchemas_Passwordmatch()
        ),
        ['confirm_password']
    )
);

// Widget Email Schema
export const widgetEmailSchema = object({
    email: emailSchema
});

// Add User Schema
export const addUserSchema = object({
    email: emailSchema,
    role: string()
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