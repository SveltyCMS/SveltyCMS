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

    check,
	type InferInput,
    nullable,
    transform,
} from 'valibot';

// ParaglideJS
import * as m from '@src/paraglide/messages';

const MIN_PASSWORD_LENGTH = publicEnv.PASSWORD_STRENGTH || 8;

// Reusable Field-Level Schemas with `pipe` and undefined handling
const usernameSchema = pipe(
    string(),
    transform((value) => value ?? ''),
    minLength(2, m.formSchemas_username_min()),
    maxLength(24, m.formSchemas_username_max()),
    regex(/^[a-zA-Z0-9@$!%*#]+$/, m.formSchemas_usernameregex())
);

const emailSchema = pipe(
    string(),
    transform((value) => value ?? ''),
    emailValidator(m.formSchemas_Emailvalid())
);

const passwordSchema = pipe(
    string(),
    transform((value) => value ?? ''),
    minLength(MIN_PASSWORD_LENGTH, m.formSchemas_PasswordMessage({ passwordStrength: MIN_PASSWORD_LENGTH })),
    regex(
        new RegExp(`^(?=.*[A-Za-z])(?=.*\\d)(?=.*[@$!%*#?&])[A-Za-z\\d@$!%*#?&]{${MIN_PASSWORD_LENGTH},}$`),
        m.formSchemas_PasswordMessage({ passwordStrength: MIN_PASSWORD_LENGTH })
    )
);

const confirmPasswordSchema = pipe(
    string(),
    transform((value) => value ?? '')
);

const roleSchema = pipe(
    string(),
    transform((value) => value ?? '')
);

const tokenSchema = pipe(
    string(),
    transform((value) => value ?? ''),
    minLength(16, m.formSchemas_Emailvalid())
);

// Form Schemas------------------------------------

// Login Form Schema
export const loginFormSchema = object({
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
export const resetFormSchema = object({
    password: passwordSchema,
    confirm_password: confirmPasswordSchema,
    token: tokenSchema,
    email: emailSchema
}, [
    check((input) => input.password === input.confirm_password, m.formSchemas_Passwordmatch())
]);

// Sign Up User Form Schema
export const signUpFormSchema = object({
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirm_password: confirmPasswordSchema,
    token: optional(pipe(
        string(),
        transform((value) => value ?? '')
    ))
});

// Google OAuth Token Schema
export const signUpOAuthFormSchema = object({
    lang: pipe(
        nullable(string()),
        transform((value) => value ?? undefined)
    )
});

// Validate New User Token Schema
export const addUserTokenSchema = object({
    email: emailSchema,
    role: roleSchema,
    expiresIn: pipe(
        nullable(number()),
        transform((value) => value ?? 24)
    ),
    expiresInLabel: pipe(
        nullable(string()),
        transform((value) => value ?? undefined)
    )
});

// Change Password Form Schema
export const changePasswordSchema = object({
    password: passwordSchema,
    confirm_password: confirmPasswordSchema,
    old_password: optional(pipe(
        string(),
        transform((value) => value ?? '')
    ))
}, [
    check((input) => input.password === input.confirm_password, m.formSchemas_Passwordmatch())
]);

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
export type LoginFormSchema = InferInput<typeof loginFormSchema>;
export type ForgotFormSchema = InferInput<typeof forgotFormSchema>;
export type ResetFormSchema = InferInput<typeof resetFormSchema>;
export type SignUpFormSchema = InferInput<typeof signUpFormSchema>;
export type SignUpOAuthFormSchema = InferInput<typeof signUpOAuthFormSchema>;
export type AddUserTokenSchema = InferInput<typeof addUserTokenSchema>;
export type ChangePasswordSchema = InferInput<typeof changePasswordSchema>;
export type WidgetEmailSchema = InferInput<typeof widgetEmailSchema>;
export type AddUserSchema = InferInput<typeof addUserSchema>;
