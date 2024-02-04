import { z } from 'zod';

//ParaglideJS
import * as m from '@src/paraglide/messages';

// SignIn Schema ------------------------------------
export const loginFormSchema = z.object({
	email: z.string({ required_error: m.formSchemas_EmailisRequired() }).email({ message: m.formSchemas_Emailvalid() }),
	password: z.string({ required_error: m.formSchemas_PasswordisRequired() }).min(4),
	isToken: z.boolean()
});

// SignIn Forgotten Password ------------------------------------
export const forgotFormSchema = z.object({
	email: z.string({ required_error: m.formSchemas_EmailisRequired() }).email({ message: m.formSchemas_Emailvalid() }),
	lang: z.string() // used for svelte-email
});

// SignIn Reset Password ------------------------------------
interface SignInResetFormData {
	password: string;
	confirm_password: string;
	token: string;
	lang: string;
}
export const resetFormSchema = z
	.object({
		password: z
			.string({ required_error: m.formSchemas_PasswordisRequired() })
			.regex(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
				message: m.formSchemas_PasswordMessage()
			}),
		confirm_password: z
			.string({ required_error: m.formSchemas_ConfimPassword() })
			.regex(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
				message: m.formSchemas_PasswordMessage()
			}),
		//token: z.string({ required_error: get(LL).LOGIN_ZOD_Token_string() }).min(1),
		token: z.string(),
		lang: z.string(), // used for svelte-email
		email: z.string()
	})
	.refine((data: SignInResetFormData) => data.password === data.confirm_password, m.formSchemas_Passwordmatch());

// Sign Up User ------------------------------------
export const signUpFormSchema = z
	.object({
		username: z
			.string({ required_error: m.formSchemas_usernameRequired() })
			.regex(/^[a-zA-Z0-9@$!%*#]+$/, { message: m.formSchemas_usernameregex() })
			.min(2, { message: m.formSchemas_username_min() })
			.max(24, { message: m.formSchemas_username_max() })
			.trim(),
		email: z.string({ required_error: m.formSchemas_EmailisRequired() }).email({ message: m.formSchemas_Emailvalid() }).trim(),

		password: z
			.string({ required_error: m.formSchemas_PasswordisRequired() })
			.regex(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
				message: m.formSchemas_PasswordMessage()
			})
			.min(8)
			.trim(),

		confirm_password: z.string({ required_error: m.formSchemas_ConfimPassword() }).min(8).trim(),

		lang: z.string(), // used for svelte-email
		token: z.string().min(16) //registration user token
	})
	.refine((data) => data.password === data.confirm_password, {
		message: m.formSchemas_Passwordmatch(),
		path: ['confirm_password'] // Set error on confirm_password field
	});

// Google Oauth token ------------------------------------
export const signUpOAuthFormSchema = z.object({
	// username: z
	// 	.string({ required_error: get(LL).LOGIN_ZOD_Username_string() })
	// 	.regex(/^[a-zA-Z0-9@$!%*#]+$/, { message: get(LL).LOGIN_ZOD_Username_regex() })
	// 	.min(2, { message: get(LL).LOGIN_ZOD_Username_min() })
	// 	.max(24, { message: get(LL).LOGIN_ZOD_Username_max() })
	// 	.trim(),
	// token: z.string().min(16),
	lang: z.string()
});

// Validate New User Token ------------------------------------
export const addUserTokenSchema = z.object({
	email: z
		.string({ required_error: m.formSchemas_EmailisRequired() })
		.email({ message: m.formSchemas_Emailvalid() })
		.transform((value) => value.toLowerCase()), // Convert email to lowercase before validation
	role: z.string(),
	expiresIn: z.string(),
	expiresInLabel: z.string()
});

// Change Password ------------------------------------
export const changePasswordSchema = z
	.object({
		password: z
			.string({ required_error: m.formSchemas_PasswordisRequired() })
			.regex(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
				message: m.formSchemas_PasswordMessage()
			}),
		confirm_password: z
			.string({ required_error: m.formSchemas_ConfimPassword() })
			.regex(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
				message: m.formSchemas_PasswordMessage()
			})
	})
	.refine((data) => data.password === data.confirm_password, {
		message: m.formSchemas_Passwordmatch(),
		path: ['confirmPassword']
	});

// Widget Email Schema ------------------------------------
export const widgetEmailSchema = z.object({
	email: z.string({ required_error: m.formSchemas_EmailisRequired() }).email({ message: m.formSchemas_Emailvalid() })
});
