import { z } from 'zod';
import { publicEnv } from '@root/config/public';

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
		token
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
	password: z.string(),
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
