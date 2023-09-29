import { z } from 'zod';
import { get } from 'svelte/store';
import LL from '@src/i18n/i18n-svelte.js';

// SignIn Schema ------------------------------------
export const loginFormSchema = z.object({
	email: z.string({ required_error: get(LL).LOGIN_ZOD_Email_string() }).email({ message: get(LL).LOGIN_ZOD_Email_email() }),
	password: z.string({ required_error: get(LL).LOGIN_ZOD_Password_string() }).min(4),
	isToken: z.boolean()
});

// SignIn Forgotten Password ------------------------------------
export const forgotFormSchema = z.object({
	email: z.string({ required_error: get(LL).LOGIN_ZOD_Email_string() }).email({ message: get(LL).LOGIN_ZOD_Email_email() }),
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
			.string({ required_error: get(LL).LOGIN_ZOD_Password_string() })
			.regex(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
				message: get(LL).LOGIN_ZOD_Password_regex()
			}),
		confirm_password: z
			.string({ required_error: get(LL).LOGIN_ZOD_Confirm_password_string() })
			.regex(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
				message: get(LL).LOGIN_ZOD_Confirm_password_regex()
			}),
		//token: z.string({ required_error: get(LL).LOGIN_ZOD_Token_string() }).min(1),
		token: z.string(),
		lang: z.string(), // used for svelte-email
		email: z.string()
	})
	.refine((data: SignInResetFormData) => data.password === data.confirm_password, get(LL).LOGIN_ZOD_Password_match());

// Sign Up User ------------------------------------
export const signUpFormSchema = z
	.object({
		username: z
			.string({ required_error: get(LL).LOGIN_ZOD_Username_string() })
			.regex(/^[a-zA-Z0-9@$!%*#]+$/, { message: get(LL).LOGIN_ZOD_Username_regex() })
			.min(2, { message: get(LL).LOGIN_ZOD_Username_min() })
			.max(24, { message: get(LL).LOGIN_ZOD_Username_max() })
			.trim(),
		email: z
			.string({ required_error: get(LL).LOGIN_ZOD_Email_string() })
			.email({ message: get(LL).LOGIN_ZOD_Email_email() })
			.trim(),

		password: z
			.string({ required_error: get(LL).LOGIN_ZOD_Password_string() })
			.regex(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
				message: get(LL).LOGIN_ZOD_Password_regex()
			})
			.min(8)
			.trim(),

		confirm_password: z
			.string({ required_error: get(LL).LOGIN_ZOD_Confirm_password_string() })
			.min(8)
			.trim(),

		lang: z.string(), // used for svelte-email
		token: z.string().min(16) //registrtion user token
	})
	.refine((data) => data.password === data.confirm_password, {
		message: get(LL).LOGIN_ZOD_Password_match(),
		path: ['confirm_password'] // Set error on confirm_password field
	});

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
	email: z.string({ required_error: get(LL).LOGIN_ZOD_Email_string() }).email({ message: get(LL).LOGIN_ZOD_Email_email() }),
	role: z.string(),
	expiresIn: z.string()
});

// Change Password ------------------------------------
export const changePasswordSchema = z
	.object({
		password: z
			.string({ required_error: get(LL).LOGIN_ZOD_Password_string() })
			.regex(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
				message: get(LL).LOGIN_ZOD_Password_regex()
			}),
		confirm_password: z
			.string({ required_error: get(LL).LOGIN_ZOD_Confirm_password_string() })
			.regex(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
				message: get(LL).LOGIN_ZOD_Confirm_password_regex()
			})
	})
	.refine((data) => data.password === data.confirm_password, {
		message: get(LL).LOGIN_ZOD_Password_match(),
		path: ['confirmPassword']
	});

// Widget Email Schema ------------------------------------
export const widgetEmailSchema = z.object({
	email: z.string({ required_error: get(LL).LOGIN_ZOD_Email_string() }).email({ message: get(LL).LOGIN_ZOD_Email_email() })
});
