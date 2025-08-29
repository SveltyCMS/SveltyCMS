/**
 * @file src/lib/env.server.ts
 * @description Server-side environment configuration following SvelteKit best practices
 *
 * This file handles ONLY essential environment variables needed for initial setup:
 * - Database credentials (for initial connection)
 * - JWT secret (for authentication)
 * - Encryption key (for data security)
 *
 * All other configuration is stored in the database and accessed via config.server.ts
 */

import { env } from '$env/dynamic/private';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

// Essential private configuration (server-only, never exposed to client)
// These are the ONLY environment variables we need for initial setup
export function getEssentialEnv() {
	// Try to load environment variables from files directly as fallback
	const fileEnv: Record<string, string> = {};
	try {
		const envPath = resolve(process.cwd(), '.env');
		const envLocalPath = resolve(process.cwd(), '.env.local');

		if (existsSync(envPath)) {
			const envContent = readFileSync(envPath, 'utf8');
			envContent.split('\n').forEach((line) => {
				const trimmed = line.trim();
				if (trimmed && !trimmed.startsWith('#')) {
					const [key, ...valueParts] = trimmed.split('=');
					if (key && valueParts.length > 0) {
						fileEnv[key] = valueParts.join('=');
					}
				}
			});
		}

		if (existsSync(envLocalPath)) {
			const envLocalContent = readFileSync(envLocalPath, 'utf8');
			envLocalContent.split('\n').forEach((line) => {
				const trimmed = line.trim();
				if (trimmed && !trimmed.startsWith('#')) {
					const [key, ...valueParts] = trimmed.split('=');
					if (key && valueParts.length > 0) {
						fileEnv[key] = valueParts.join('=');
					}
				}
			});
		}
	} catch (error) {
		console.warn('Failed to load environment files directly:', error);
	}

	// Try to load from config/private.ts file
	const configEnv: Record<string, string> = {};
	try {
		const configPath = resolve(process.cwd(), 'config/private.ts');
		if (existsSync(configPath)) {
			const configContent = readFileSync(configPath, 'utf8');

			// Extract values from the privateEnv object
			const dbHostMatch = configContent.match(/DB_HOST:\s*['"`]([^'"`]+)['"`]/);
			const dbNameMatch = configContent.match(/DB_NAME:\s*['"`]([^'"`]+)['"`]/);
			const dbUserMatch = configContent.match(/DB_USER:\s*['"`]([^'"`]+)['"`]/);
			const dbPasswordMatch = configContent.match(/DB_PASSWORD:\s*['"`]([^'"`]+)['"`]/);
			const jwtSecretMatch = configContent.match(/JWT_SECRET_KEY:\s*['"`]([^'"`]+)['"`]/);
			const encryptionKeyMatch = configContent.match(/ENCRYPTION_KEY:\s*['"`]([^'"`]+)['"`]/);

			if (dbHostMatch) configEnv.DB_HOST = dbHostMatch[1];
			if (dbNameMatch) configEnv.DB_NAME = dbNameMatch[1];
			if (dbUserMatch) configEnv.DB_USER = dbUserMatch[1];
			if (dbPasswordMatch) configEnv.DB_PASSWORD = dbPasswordMatch[1];
			if (jwtSecretMatch) configEnv.JWT_SECRET_KEY = jwtSecretMatch[1];
			if (encryptionKeyMatch) configEnv.ENCRYPTION_KEY = encryptionKeyMatch[1];

			// Set default values
			configEnv.DB_TYPE = 'mongodb';
			configEnv.DB_PORT = '27017';
		}
	} catch (error) {
		console.warn('Failed to load config/private.ts:', error);
	}

	return {
		// Database credentials (required for initial connection)
		// Priority: config/private.ts > .env files > SvelteKit env vars > defaults
		DB_TYPE: configEnv.DB_TYPE || env?.DB_TYPE || fileEnv.DB_TYPE || 'mongodb',
		DB_HOST: configEnv.DB_HOST || env?.DB_HOST || fileEnv.DB_HOST || '',
		DB_PORT: parseInt(configEnv.DB_PORT || env?.DB_PORT || fileEnv.DB_PORT || '27017'),
		DB_NAME: configEnv.DB_NAME || env?.DB_NAME || fileEnv.DB_NAME || '',
		DB_USER: configEnv.DB_USER || env?.DB_USER || fileEnv.DB_USER || '',
		DB_PASSWORD: configEnv.DB_PASSWORD || env?.DB_PASSWORD || fileEnv.DB_PASSWORD || '',

		// JWT configuration (required for authentication)
		JWT_SECRET_KEY: configEnv.JWT_SECRET_KEY || env?.JWT_SECRET_KEY || fileEnv.JWT_SECRET_KEY || '',

		// Encryption key (required for data security)
		ENCRYPTION_KEY: configEnv.ENCRYPTION_KEY || env?.ENCRYPTION_KEY || fileEnv.ENCRYPTION_KEY || ''
	} as const;
}

// For backwards compatibility, export a getter
export const essentialEnv = new Proxy({} as EssentialEnv, {
	get(target, prop) {
		return getEssentialEnv()[prop as keyof ReturnType<typeof getEssentialEnv>];
	}
});

// Type definitions for better type safety
export interface EssentialEnv {
	DB_TYPE: string;
	DB_HOST: string;
	DB_PORT: number;
	DB_NAME: string;
	DB_USER: string;
	DB_PASSWORD: string;
	JWT_SECRET_KEY: string;
	ENCRYPTION_KEY: string;
}

// Type-safe environment validation
export function validateEssentialEnv(): void {
	const env = getEssentialEnv();
	const required = ['DB_HOST', 'DB_NAME', 'JWT_SECRET_KEY', 'ENCRYPTION_KEY'] as const;
	const missing = required.filter((key) => !env[key]);

	if (missing.length > 0) {
		throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
	}

	if (env.ENCRYPTION_KEY.length !== 64) {
		throw new Error('ENCRYPTION_KEY must be exactly 64 characters (32 bytes hex-encoded)');
	}
}

// Helper function to check if database is configured
export function isDatabaseConfigured(): boolean {
	// Check if we have a host and database name
	// For MongoDB, the host can be a connection string or hostname
	const env = getEssentialEnv();
	return !!(env.DB_HOST && env.DB_NAME);
}

// Helper function to check if JWT is configured
export function isJWTConfigured(): boolean {
	const env = getEssentialEnv();
	return !!env.JWT_SECRET_KEY;
}

// Helper function to check if encryption is configured
export function isEncryptionConfigured(): boolean {
	const env = getEssentialEnv();
	return !!env.ENCRYPTION_KEY;
}

// Helper function to check if setup is complete
export function isSetupComplete(): boolean {
	// First check if environment variables are configured
	const envConfigured = isDatabaseConfigured() && isJWTConfigured() && isEncryptionConfigured();

	// If environment variables are not configured, setup is definitely not complete
	if (!envConfigured) {
		return false;
	}

	// For a more accurate check, we should check the database setting
	// But this function is called during initialization, so we can't access the database yet
	// The actual setup completion check should be done in hooks.server.ts after config initialization
	return true;
}

// Helper function to get database connection string
export function getDatabaseConnectionString(): string {
	const { DB_TYPE, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = essentialEnv;

	if (DB_TYPE === 'mongodb') {
		if (DB_USER && DB_PASSWORD) {
			return `mongodb://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
		} else {
			return `mongodb://${DB_HOST}:${DB_PORT}/${DB_NAME}`;
		}
	}

	// Add support for other database types here
	return '';
}

// Legacy compatibility - redirect to new structure
export const privateConfig = essentialEnv;
export type PrivateConfig = EssentialEnv;
