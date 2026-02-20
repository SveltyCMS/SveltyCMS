/**
 * @file: src/utils/formSchemas.ts
 * @description: Defines Valibot schemas for various forms used in the application.
 *
 * @requires valibot - For schema definition and validation
 * @requires @src/stores/global-settings - For accessing settings from database
 * @requires @src/paraglide/messages - For internationalized error messages
 */

import {
	array,
	boolean,
	check,
	custom,
	email as emailValidator,
	forward,
	type InferInput,
	maxLength,
	minLength,
	nullable,
	number,
	object,
	optional,
	partialCheck,
	picklist,
	pipe,
	regex,
	strictObject,
	string,
	transform,
	trim
} from 'valibot';

// NOTE: Error messages are plain strings for universal (client/server) compatibility.
const MIN_PPASSWORD_LENGTH = 8;

// --- Reusable Username Schemas ---
const usernameSchema = pipe(
	string(),
	trim(),
	minLength(2, 'Please enter a username with at least 2 characters.'),
	maxLength(50, 'Username is too long (max 50 characters).'),
	regex(/^[a-zA-Z0-9@$!%*#._-]+$/, 'Username can only contain letters, numbers, and @$!%*#._- characters.')
);

// --- Reusable Email Schemas ---
const emailSchema = pipe(
	string(),
	trim(),
	transform((value) => value.toLowerCase()),
	emailValidator('Please enter a valid email address (e.g. user@example.com).')
);

// --- Reusable Password Schemas ---
const passwordSchema = pipe(
	string(),
	trim(),
	minLength(MIN_PPASSWORD_LENGTH, `Password must be at least ${MIN_PPASSWORD_LENGTH} characters and include a letter, number, and special character`),
	regex(
		/^(?=.*[A-Za-z])(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>?]).{8,}$/,
		`Password must be at least ${MIN_PPASSWORD_LENGTH} characters and include a letter, number, and special character`
	)
);

// --- Reusable Confirm Password Schemas ---
const confirmPasswordSchema = pipe(string(), trim());

// --- Reusable Token Schemas ---
const tokenSchema = pipe(string(), trim(), minLength(32), maxLength(36, 'Token must be either 32 or 36 characters'));

// Form Schemas------------------------------------

// Login Form Schema
export const loginFormSchema = strictObject({
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
		confirm_password: confirmPasswordSchema,
		token: tokenSchema,
		email: emailSchema
	}),
	forward(
		partialCheck(
			[['password'], ['confirm_password']],
			(input) => input.password === input.confirm_password,
			'The passwords do not match. Please ensure both fields are identical.'
		),
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
	check((input) => input.password === input.confirm_password, 'The passwords do not match. Please ensure both fields are identical.')
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

// Edit User Schema
export const editUserSchema = pipe(
	object({
		user_id: string(),
		username: usernameSchema,
		email: emailSchema,
		role: optional(string()),
		password: optional(string()),
		confirmPassword: optional(string()),
		currentPassword: optional(string())
	}),
	forward(
		check((input) => {
			if (input.password && input.password.length > 0) {
				return input.password === input.confirmPassword;
			}
			return true;
		}, 'The passwords do not match. Please ensure both fields are identical.'),
		['confirmPassword']
	)
);

// Setup Admin User Schema
export const setupAdminSchema = pipe(
	strictObject({
		username: usernameSchema,
		email: emailSchema,
		password: passwordSchema,
		confirmPassword: confirmPasswordSchema
	}),
	check((input) => input.password === input.confirmPassword, 'The passwords do not match. Please ensure both fields are identical.')
);

// --- SMTP Configuration Schemas ---

// SMTP Host Schema
// Validates hostname format (e.g., smtp.gmail.com)
// Rejects email-like inputs (e.g., user@domain.com)
const smtpHostSchema = pipe(
	string(),
	trim(),
	minLength(1, 'SMTP host is required'),
	maxLength(255, 'SMTP host is too long'),
	custom((value) => {
		if (typeof value !== 'string') {
			return false;
		}
		// Reject if it looks like an email
		if (value.includes('@')) {
			return false;
		}
		// Valid hostname: alphanumeric, hyphens, dots
		// Must have at least one dot and valid format
		return /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(value);
	}, 'Invalid hostname format. Please use a format like "smtp.domain.com" (not an email address).')
);

// SMTP Port Schema
// Validates port number (1-65535)
const smtpPortSchema = pipe(
	number(),
	custom((value) => {
		if (typeof value !== 'number') {
			return false;
		}
		return value >= 1 && value <= 65_535;
	}, 'Port must be between 1 and 65535')
);

// SMTP User Schema
// Typically an email address or username
const smtpUserSchema = pipe(string(), trim(), minLength(1, 'SMTP username is required'), maxLength(255, 'SMTP username is too long'));

// SMTP Password Schema
const smtpPasswordSchema = pipe(string(), trim(), minLength(1, 'SMTP password is required'));

// SMTP From Address Schema (Optional)
const smtpFromSchema = pipe(string(), trim());

// Complete SMTP Configuration Schema
export const smtpConfigSchema = object({
	host: smtpHostSchema,
	port: smtpPortSchema,
	user: smtpUserSchema,
	password: smtpPasswordSchema,
	from: smtpFromSchema,
	secure: boolean()
});

// --- Database Configuration Schemas ---

// Database Type Schema
const dbTypeSchema = picklist(['mongodb', 'mongodb+srv', 'postgresql', 'mysql', 'mariadb', 'sqlite'], 'Invalid database type');

// Database Host Schema
const dbHostSchema = pipe(string(), trim(), minLength(1, 'Database host is required'), maxLength(255, 'Database host is too long'));

// Database Port Schema (optional for Atlas)
const dbPortSchema = optional(
	pipe(
		string(),
		trim(),
		transform((value) => (value ? Number.parseInt(value, 10) : undefined)),
		custom((value) => {
			if (value === undefined) {
				return true;
			}
			if (typeof value !== 'number') {
				return false;
			}
			return value >= 1 && value <= 65_535;
		}, 'Port must be between 1 and 65535')
	)
);

// Database Name Schema
const dbNameSchema = pipe(
	string(),
	trim(),
	minLength(1, 'Database name is required'),
	maxLength(63, 'Database name is too long'),
	regex(/^[a-zA-Z0-9._-]+$/, 'Database name can only contain letters, numbers, hyphens, underscores, and dots')
);

// Database User Schema (optional for MongoDB without auth)
const dbUserSchema = pipe(string(), trim(), maxLength(63, 'Database user is too long'));

// Database Password Schema (optional for MongoDB without auth)
const dbPasswordSchema = pipe(string(), trim());

// Complete Database Configuration Schema
export const dbConfigSchema = pipe(
	object({
		type: dbTypeSchema,
		host: dbHostSchema,
		port: dbPortSchema,
		name: dbNameSchema,
		user: dbUserSchema,
		password: dbPasswordSchema
	}),
	check((input) => {
		// For PostgreSQL and MySQL, username and password are required
		if (input.type === 'postgresql' || input.type === 'mysql' || input.type === 'mariadb') {
			return input.user.length > 0 && input.password.length > 0;
		}
		// For MongoDB (both standard and Atlas), authentication is optional
		// This allows local development without auth (e.g., MongoDB Compass)
		return true;
	}, 'Username and password are required for this database type.')
);

// --- System Settings Schemas ---

// Site Name Schema
const siteNameSchema = pipe(string(), trim(), minLength(1, 'Site name is required'), maxLength(100, 'Site name is too long'));

// Production Host Schema
const hostProdSchema = pipe(
	string(),
	trim(),
	minLength(1, 'Production URL is required'),
	maxLength(255, 'Production URL is too long'),
	regex(/^https?:\/\/.+/, 'Production URL must start with http:// or https://')
);

// Language Code Schema (ISO 639-1 two-letter codes)
const languageCodeSchema = pipe(
	string(),
	trim(),
	transform((value) => value.toLowerCase()),
	regex(/^[a-z]{2}$/, 'Language code must be a valid ISO 639-1 two-letter code')
);

// Timezone Schema
const timezoneSchema = pipe(string(), trim(), minLength(1, 'Timezone is required'));

// Media Storage Type Schema
const mediaStorageTypeSchema = picklist(['local', 's3', 'r2', 'cloudinary'], 'Invalid media storage type');

// Media Folder Schema
const mediaFolderSchema = pipe(
	string(),
	trim(),
	minLength(1, 'Media folder/bucket name is required'),
	maxLength(255, 'Media folder/bucket name is too long')
);

// Complete System Settings Schema
export const systemSettingsSchema = object({
	siteName: siteNameSchema,
	hostProd: hostProdSchema,
	defaultSystemLanguage: languageCodeSchema,
	systemLanguages: array(languageCodeSchema, 'System languages must be an array of valid language codes.'),
	defaultContentLanguage: languageCodeSchema,
	contentLanguages: array(languageCodeSchema, 'Content languages must be an array of valid language codes.'),
	timezone: timezoneSchema,
	mediaStorageType: mediaStorageTypeSchema,
	mediaFolder: mediaFolderSchema,
	useRedis: boolean(),
	redisHost: optional(string()),
	redisPort: optional(string()),
	redisPassword: optional(string()),
	multiTenant: boolean(),
	demoMode: boolean()
});

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
export type EditUserSchema = InferInput<typeof editUserSchema>;
export type SetupAdminSchema = InferInput<typeof setupAdminSchema>;
export type SmtpConfigSchema = InferInput<typeof smtpConfigSchema>;
export type DbConfigSchema = InferInput<typeof dbConfigSchema>;
export type SystemSettingsSchema = InferInput<typeof systemSettingsSchema>;
