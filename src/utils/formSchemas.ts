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
	check,
	trim,
	ValiError,
	safeParse
} from 'valibot';

// ParaglideJS
import * as m from '@src/paraglide/messages';

const MIN_PASSWORD_LENGTH = publicEnv.PASSWORD_STRENGTH || 8;

// --- Async functions for validations that require external checks ---
async function checkUsernameAvailability(username: string): Promise<boolean> {
	// Replace with your actual async logic (API call, etc.)
	await new Promise((resolve) => setTimeout(resolve, 500));
	return username !== 'existinguser';
}

async function verifyOldPassword(oldPassword: string, email: string): Promise<boolean> {
	// Replace with your actual logic (API call, etc.)
	await new Promise((resolve) => setTimeout(resolve, 500));
	return oldPassword === 'oldpassword123'; // Replace with your actual logic
}

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
	emailValidator(m.formSchemas_Emailvalid())
);

// --- Reusable Password Schemas ---
const passwordSchema = pipe(
	string(),
	trim(),
	transform((value) => value ?? ''),
	minLength(MIN_PASSWORD_LENGTH, m.formSchemas_PasswordMessage({ passwordStrength: MIN_PASSWORD_LENGTH })),
	regex(
		new RegExp(`^(?=.*[A-Za-z])(?=.*\\d)(?=.*[@$!%*#?&])[A-Za-z\\d@$!%*#?&]{${MIN_PASSWORD_LENGTH},}$`),
		m.formSchemas_PasswordMessage({ passwordStrength: MIN_PASSWORD_LENGTH })
	)
);

// --- Reusable Confirm Password Schemas ---
const confirmPasswordSchema = pipe(
	string(),
	trim(),
	transform((value) => value ?? '')
);

// --- Reusable Role Schemas ---
const roleSchema = pipe(
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
		confirm_password: confirmPasswordSchema, // Use confirmPasswordSchema here
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
		token: optional(nullable(string()))  // Make token optional and nullable
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
	expiresIn: nullable(number()),
	expiresInLabel: nullable(string())
});

// Change Password Form Schema
export const changePasswordSchema = object({
	old_password: string(),
	password: passwordSchema,
	confirm_password: string()
});

// Example of how to call both synchronous and async validations in a SvelteKit action
export async function handlePasswordChange(formData: FormData) {
	try {
		const email = String(formData.get('email'));
		const oldPassword = String(formData.get('old_password'));
		const password = String(formData.get('password'));
		const confirmPassword = String(formData.get('confirm_password'));

		// Use safeParse instead of parse
		const result = safeParse(changePasswordSchema, {
			old_password: oldPassword,
			password: password,
			confirm_password: confirmPassword
		});

		if (!result.success) {
			// Handle validation errors
			throw new ValiError(result.issues);
		}

		const validatedData = result.output;

		// 2. Asynchronous validation (AFTER synchronous validation)
		const isOldPasswordCorrect = await verifyOldPassword(validatedData.old_password, email);

		if (!isOldPasswordCorrect) {
			throw new Error('formSchemas_IncorrectOldPassword');
		}

		if (validatedData.password !== validatedData.confirm_password) {
			throw new Error(m.formSchemas_Passwordmatch());
		}

		// If both validations pass, proceed with the password update
		console.log('Password change successful:', validatedData);
		// ... (your logic to update the password)
	} catch (error) {
		// Handle validation errors
		if (error instanceof Error) {
			if (error.message === 'formSchemas_IncorrectOldPassword') {
				// Specific error message
			}
		}

		console.error('Password change failed:', error);
		throw error; // Re-throw error to be handled by SvelteKit
	}
}

// Widget Email Schema
export const widgetEmailSchema = object({
	email: emailSchema
});

// Add User Schema
export const addUserSchema = object({
	email: emailSchema,
	role: string()
});

//  Type Exports
export type LoginFormSchema = InferInput<typeof loginFormSchema>;
export type ForgotFormSchema = InferInput<typeof forgotFormSchema>;
export type ResetFormSchema = InferInput<typeof resetFormSchema>;
export type SignUpFormSchema = InferInput<typeof signUpFormSchema>;
export type SignUpOAuthFormSchema = InferInput<typeof signUpOAuthFormSchema>;
export type AddUserTokenSchema = InferInput<typeof addUserTokenSchema>;
export type ChangePasswordSchemaType = InferInput<typeof changePasswordSchema>; //  Export type
export type WidgetEmailSchema = InferInput<typeof widgetEmailSchema>;
export type AddUserSchema = InferInput<typeof addUserSchema>;
