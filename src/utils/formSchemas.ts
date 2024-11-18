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
    nullable
} from 'valibot';

// ParaglideJS
import * as m from '@src/paraglide/messages';

const MIN_PASSWORD_LENGTH = publicEnv.PASSWORD_STRENGTH || 8;

// Reusable Field-Level Schemas
const usernameSchema = pipe(
    string(),
    minLength(2, m.formSchemas_username_min()),
    maxLength(24, m.formSchemas_username_max()),
    regex(/^[a-zA-Z0-9@$!%*#]+$/, m.formSchemas_usernameregex())
);

const emailSchema = pipe(
    string(),
    emailValidator(m.formSchemas_Emailvalid())
);

const passwordSchema = pipe(
    string(),
    minLength(MIN_PASSWORD_LENGTH, m.formSchemas_PasswordMessage({ passwordStrength: MIN_PASSWORD_LENGTH })),
    regex(
        new RegExp(`^(?=.*[A-Za-z])(?=.*\\d)(?=.*[@$!%*#?&])[A-Za-z\\d@$!%*#?&]{${MIN_PASSWORD_LENGTH},}$`),
        m.formSchemas_PasswordMessage({ passwordStrength: MIN_PASSWORD_LENGTH })
    )
);

const tokenSchema = pipe(
    string(),
    minLength(16, m.formSchemas_Emailvalid())
);

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
export const signUpFormSchema = pipe(
    object({
        username: usernameSchema,
        email: emailSchema,
        password: passwordSchema,
        confirm_password: string(),
        token: optional(string())
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