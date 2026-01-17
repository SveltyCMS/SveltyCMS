import {
	pipe,
	string,
	trim,
	minLength,
	maxLength,
	regex,
	transform,
	email,
	strictObject,
	boolean,
	object,
	forward,
	partialCheck,
	optional,
	nullable,
	check,
	picklist,
	custom,
	number,
	array
} from 'valibot';
const MIN_PPASSWORD_LENGTH = 8;
const usernameSchema = pipe(
	string(),
	trim(),
	minLength(2, 'Username must be at least 2 characters'),
	maxLength(50, 'Username must be at most 50 characters'),
	regex(/^[a-zA-Z0-9@$!%*#._-]+$/, 'Username contains invalid characters')
);
const emailSchema = pipe(
	string(),
	trim(),
	transform((value) => value.toLowerCase()),
	email('Invalid email address')
);
const passwordSchema = pipe(
	string(),
	trim(),
	minLength(MIN_PPASSWORD_LENGTH, `Password must be at least ${MIN_PPASSWORD_LENGTH} characters and include a letter, number, and special character`),
	regex(
		/^(?=.*[A-Za-z])(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>?]).{8,}$/,
		`Password must be at least ${MIN_PPASSWORD_LENGTH} characters and include a letter, number, and special character`
	)
);
const confirmPasswordSchema = pipe(string(), trim());
const tokenSchema = pipe(string(), trim(), minLength(16, 'Token must be at least 16 characters'));
const loginFormSchema = strictObject({
	email: emailSchema,
	password: passwordSchema,
	isToken: boolean()
});
const forgotFormSchema = object({
	email: emailSchema
});
const resetFormSchema = pipe(
	object({
		password: passwordSchema,
		confirm_password: confirmPasswordSchema,
		token: tokenSchema,
		email: emailSchema
	}),
	forward(
		partialCheck([['password'], ['confirm_password']], (input) => input.password === input.confirm_password, 'Passwords do not match'),
		['confirm_password']
	)
);
const signUpFormSchema = pipe(
	strictObject({
		username: usernameSchema,
		email: emailSchema,
		password: passwordSchema,
		confirm_password: confirmPasswordSchema,
		token: optional(nullable(string()))
	}),
	check((input) => input.password === input.confirm_password, 'Passwords do not match')
);
object({
	lang: nullable(string())
});
const addUserTokenSchema = object({
	email: emailSchema,
	role: string(),
	expiresIn: picklist(['2 hrs', '12 hrs', '2 days', '1 week', '2 weeks', '1 month'])
});
object({
	old_password: string(),
	password: passwordSchema,
	confirm_password: string()
});
object({
	email: emailSchema
});
object({
	email: emailSchema,
	role: string()
});
pipe(
	object({
		user_id: string(),
		username: usernameSchema,
		email: emailSchema,
		role: optional(string()),
		password: optional(string()),
		confirmPassword: optional(string())
	}),
	forward(
		check((input) => {
			if (input.password && input.password.length > 0) {
				return input.password === input.confirmPassword;
			}
			return true;
		}, 'Passwords do not match'),
		['confirmPassword']
	)
);
pipe(
	strictObject({
		username: usernameSchema,
		email: emailSchema,
		password: passwordSchema,
		confirmPassword: confirmPasswordSchema
	}),
	check((input) => input.password === input.confirmPassword, 'Passwords do not match')
);
const smtpHostSchema = pipe(
	string(),
	trim(),
	minLength(1, 'SMTP host is required'),
	maxLength(255, 'SMTP host is too long'),
	custom((value) => {
		if (typeof value !== 'string') return false;
		if (value.includes('@')) {
			return false;
		}
		return /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(value);
	}, 'Invalid hostname format. Use "smtp.domain.com" not "email@domain.com"')
);
const smtpPortSchema = pipe(
	number(),
	custom((value) => {
		if (typeof value !== 'number') return false;
		return value >= 1 && value <= 65535;
	}, 'Port must be between 1 and 65535')
);
const smtpUserSchema = pipe(string(), trim(), minLength(1, 'SMTP username is required'), maxLength(255, 'SMTP username is too long'));
const smtpPasswordSchema = pipe(string(), trim(), minLength(1, 'SMTP password is required'));
const smtpFromSchema = pipe(string(), trim());
object({
	host: smtpHostSchema,
	port: smtpPortSchema,
	user: smtpUserSchema,
	password: smtpPasswordSchema,
	from: smtpFromSchema,
	secure: boolean()
});
const dbTypeSchema = picklist(['mongodb', 'mongodb+srv', 'postgresql', 'mysql', 'mariadb'], 'Invalid database type');
const dbHostSchema = pipe(string(), trim(), minLength(1, 'Database host is required'), maxLength(255, 'Database host is too long'));
const dbPortSchema = optional(
	pipe(
		string(),
		trim(),
		transform((value) => (value ? parseInt(value, 10) : void 0)),
		custom((value) => {
			if (value === void 0) return true;
			if (typeof value !== 'number') return false;
			return value >= 1 && value <= 65535;
		}, 'Port must be between 1 and 65535')
	)
);
const dbNameSchema = pipe(
	string(),
	trim(),
	minLength(1, 'Database name is required'),
	maxLength(63, 'Database name is too long'),
	regex(/^[a-zA-Z0-9_-]+$/, 'Database name can only contain letters, numbers, hyphens, and underscores')
);
const dbUserSchema = pipe(string(), trim(), maxLength(63, 'Database user is too long'));
const dbPasswordSchema = pipe(string(), trim());
pipe(
	object({
		type: dbTypeSchema,
		host: dbHostSchema,
		port: dbPortSchema,
		name: dbNameSchema,
		user: dbUserSchema,
		password: dbPasswordSchema
	}),
	check((input) => {
		if (input.type === 'postgresql' || input.type === 'mysql' || input.type === 'mariadb') {
			return input.user.length > 0 && input.password.length > 0;
		}
		return true;
	}, 'Username and password are required for this database type.')
);
const siteNameSchema = pipe(string(), trim(), minLength(1, 'Site name is required'), maxLength(100, 'Site name is too long'));
const hostProdSchema = pipe(
	string(),
	trim(),
	minLength(1, 'Production URL is required'),
	maxLength(255, 'Production URL is too long'),
	regex(/^https?:\/\/.+/, 'Production URL must start with http:// or https://')
);
const languageCodeSchema = pipe(
	string(),
	trim(),
	transform((value) => value.toLowerCase()),
	regex(/^[a-z]{2}$/, 'Language code must be a valid ISO 639-1 two-letter code')
);
const timezoneSchema = pipe(string(), trim(), minLength(1, 'Timezone is required'));
const mediaStorageTypeSchema = picklist(['local', 's3', 'r2', 'cloudinary'], 'Invalid media storage type');
const mediaFolderSchema = pipe(
	string(),
	trim(),
	minLength(1, 'Media folder/bucket name is required'),
	maxLength(255, 'Media folder/bucket name is too long')
);
object({
	siteName: siteNameSchema,
	hostProd: hostProdSchema,
	defaultSystemLanguage: languageCodeSchema,
	systemLanguages: array(languageCodeSchema, 'System languages must be an array of valid language codes.'),
	defaultContentLanguage: languageCodeSchema,
	contentLanguages: array(languageCodeSchema, 'Content languages must be an array of valid language codes.'),
	timezone: timezoneSchema,
	mediaStorageType: mediaStorageTypeSchema,
	mediaFolder: mediaFolderSchema
});
export { addUserTokenSchema as a, forgotFormSchema as f, loginFormSchema as l, resetFormSchema as r, signUpFormSchema as s };
//# sourceMappingURL=formSchemas.js.map
