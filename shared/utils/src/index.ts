/**
 * @shared/utils - Common Utility Functions
 *
 * Utilities used across workspaces.
 */

export {
	loginFormSchema,
	forgotFormSchema,
	resetFormSchema,
	signUpFormSchema,
	signUpOAuthFormSchema,
	addUserTokenSchema,
	changePasswordSchema,
	widgetEmailSchema,
	addUserSchema,
	editUserSchema,
	setupAdminSchema,
	smtpConfigSchema,
	dbConfigSchema,
	systemSettingsSchema
} from './formSchemas';
export type {
	LoginFormSchema,
	ForgotFormSchema,
	ResetFormSchema,
	SignUpFormSchema,
	SignUpOAuthFormSchema,
	AddUserTokenSchema,
	ChangePasswordSchemaType,
	WidgetEmailSchema,
	AddUserSchema,
	EditUserSchema,
	SetupAdminSchema,
	SmtpConfigSchema,
	DbConfigSchema,
	SystemSettingsSchema
} from './formSchemas';

export { getLanguageName } from './languageUtils';
export { modalState } from './modalState.svelte';
export { logger } from './logger';
export { showToast } from './toast';
export { buildDatabaseConnectionString } from './database';
export {
	DEFAULT_SYSTEM_LANGUAGES,
	DEFAULT_BASE_LOCALE,
	DEFAULT_CONTENT_LANGUAGES,
	DEFAULT_CONTENT_LANGUAGE,
	defaultPublicSettings,
	defaultPrivateSettings
} from './config/defaults';
// export * from './content/scanner'; // SERVER ONLY
// export * from './setupManager'; // SERVER ONLY
