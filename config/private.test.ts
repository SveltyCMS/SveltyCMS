import { privateConfigSchema } from '@src/databases/schemas';
import type { InferOutput } from 'valibot';

// Dummy configuration for testing purposes
export const privateEnv: Partial<InferOutput<typeof privateConfigSchema>> = {
	DB_TYPE: 'mongodb',
	DB_HOST: 'localhost',
	DB_PORT: 27017,
	DB_NAME: 'sveltycms_test',
	DB_USER: '',
	DB_PASSWORD: '',
	JWT_SECRET_KEY: 'test-secret-key',
	ENCRYPTION_KEY: 'test-encryption-key-must-be-32-bytes-long!'
};
