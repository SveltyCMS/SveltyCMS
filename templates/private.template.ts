/**
 * @file templates/private.template.ts
 * @description Template for private configuration file - will be populated during setup
 */

import { createPrivateConfig } from '../config/types.ts';

export const privateEnv = createPrivateConfig({
	// Database Configuration
	DB_TYPE: 'mongodb',
	DB_HOST: '',
	DB_PORT: 27017,
	DB_NAME: '',
	DB_USER: '',
	DB_PASSWORD: '',

	// Security Keys
	JWT_SECRET_KEY: '',
	ENCRYPTION_KEY: '',

	// Multi-tenancy
	MULTI_TENANT: false

	// If you have any essential static private config, add here. Otherwise, leave empty.
});



