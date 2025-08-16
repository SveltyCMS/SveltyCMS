/**
 * @file config/private.ts
 * @description Private configuration file - will be populated during setup
 */

export const privateEnv = {
	// Database (filled by setup wizard)
	DB_TYPE: 'mongodb',
	DB_HOST: '',
	DB_PORT: 27017,
	DB_NAME: '',
	DB_USER: '',
	DB_PASSWORD: '',

	// JWT secret (generated during setup if left blank)
	JWT_SECRET_KEY: ''
};
