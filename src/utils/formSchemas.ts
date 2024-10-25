/**
 * @file: src/utils/formSchemas.ts
 * @description: Defines Zod schemas for various forms used in the application.
 *
 * This file contains:
 * - Reusable schema definitions for common fields like username, email, and password.
 * - Form-specific schemas for different functionalities such as login, signup, password reset, etc.
 *
 * Key schemas include:
 * - loginFormSchema: For user login
 * - forgotFormSchema: For initiating password reset
 * - resetFormSchema: For setting a new password
 * - signUpFormSchema: For user registration
 * - changePasswordSchema: For changing user password
 * - addUserSchema: For adding new users (likely admin functionality)
 *
 * The schemas use internationalized error messages from ParaglideJS.
 *
 * @requires zod - For schema definition and validation
 * @requires @root/config/public - For accessing public environment variables
 * @requires @src/paraglide/messages - For internationalized error messages
 *
 * @constant MIN_PASSWORD_LENGTH - Minimum required password length, set from environment or defaulting to 8
 */

import { publicEnv } from '@root/config/public';

import { z } from 'zod';

const MIN_PASSWORD_LENGTH = publicEnv.PASSWORD_STRENGTH || 8;

// ParaglideJS
import * as m from '@src/paraglide/messages';

// Define re-usable Schemas
const username = z
	.string({ required_error: m.formSchemas_usernameRequired() })
	.regex(/^[a-zA-Z0-9@$!%*#]+$/, { message: m.formSchemas_usernameregex() })
	.min(2, { message: m.formSchemas_username_min() })
	.max(24, { message: m.formSchemas_username_max() })
	.trim();

const email = z
	.string({ required_error: m.formSchemas_EmailisRequired() })
	.email({ message: m.formSchemas_Emailvalid() })
	.transform((value) => value.toLowerCase()); // Convert email to lowercase before validation

const password = z
	.string({ required_error: m.formSchemas_PasswordisRequired() })
	.min(MIN_PASSWORD_LENGTH)
	.regex(new RegExp(`^(?=.*[A-Za-z])(?=.*\\d)(?=.*[@$!%*#?&])[A-Za-z\\d@$!%*#?&]{${MIN_PASSWORD_LENGTH},}$`), {
		message: m.formSchemas_PasswordMessage({ passwordStrength: MIN_PASSWORD_LENGTH })
	})
	.trim();

const confirm_password = z
	.string({ required_error: m.formSchemas_PasswordisRequired() })
	.min(MIN_PASSWORD_LENGTH)
	.regex(new RegExp(`^(?=.*[A-Za-z])(?=.*\\d)(?=.*[@$!%*#?&])[A-Za-z\\d@$!%*#?&]{${MIN_PASSWORD_LENGTH},}$`), {
		message: m.formSchemas_PasswordMessage({ passwordStrength: MIN_PASSWORD_LENGTH })
	})
	.trim();

const role = z.string();

const token = z.string().min(16); //registration user token

// Actual Form Schemas------------------------------------

// SignIn Schema ------------------------------------
export const loginFormSchema = z.object({
	email,
	password,
	isToken: z.boolean()
});

// SignIn Forgotten Password ------------------------------------
export const forgotFormSchema = z.object({
	email: z.string({ required_error: m.formSchemas_EmailisRequired() }).email({ message: m.formSchemas_Emailvalid() })
	// lang: z.string() // used for svelty-email
});

// SignIn Reset Password ------------------------------------
interface SignInResetFormData {
	password: string;
	confirm_password: string;
	token: string;
	// lang: string;
}
export const resetFormSchema = z
	.object({
		password,
		confirm_password,
		token,
		email
		//lang: z.string(), // used for svelty-email
	})
	.refine((data: SignInResetFormData) => data.password === data.confirm_password, m.formSchemas_Passwordmatch());

// Sign Up User ------------------------------------
export const signUpFormSchema = z
	.object({
		username,
		email,
		password,
		confirm_password,
		token: z.string().optional() // Make it optional if it's not always required
	})
	.refine((data) => data.password === data.confirm_password, {
		message: m.formSchemas_Passwordmatch(),
		path: ['confirm_password'] // Set error on confirm_password field
	});

// Google Oauth token ------------------------------------
export const signUpOAuthFormSchema = z.object({
	// username
	// token
	lang: z.string()
});

// Validate New User Token ------------------------------------
export const addUserTokenSchema = z.object({
	email,
	role,
	// password: z.string(),
	expiresIn: z.string(),
	expiresInLabel: z.string()
});

// Change Password ------------------------------------
export const changePasswordSchema = z
	.object({
		password,
		confirm_password
	})
	.refine((data) => data.password === data.confirm_password, {
		message: m.formSchemas_Passwordmatch(),
		path: ['confirmPassword']
	});

// Widget Email Schema ------------------------------------
export const widgetEmailSchema = z.object({
	email
});

// Add User Schema ------------------------------------
export const addUserSchema = z.object({
	email,
	role
});
