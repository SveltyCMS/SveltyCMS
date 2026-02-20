/**
 * @file src\databases\config-state.ts
 * @description
 * Configuration state management.
 *
 * This module holds the loaded private configuration state to avoid circular dependencies
 * between db.ts and other modules like secureQuery.ts or settingsService.ts.
 */

import type { privateConfigSchema } from '@src/databases/schemas';
import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger';
import type { InferOutput } from 'valibot';

export let privateEnv: InferOutput<typeof privateConfigSchema> | null = null;

export function setPrivateEnv(env: InferOutput<typeof privateConfigSchema> | null) {
	privateEnv = env;
}

// Function to load private config when needed
export async function loadPrivateConfig(forceReload = false) {
	if (privateEnv && !forceReload) {
		return privateEnv;
	}

	try {
		// SAFETY: Force TEST_MODE if running in test environment (Bun test)
		if (process.env.NODE_ENV === 'test' && !process.env.TEST_MODE) {
			console.warn('⚠️ Running in TEST environment but TEST_MODE is not set. Forcing usage of private.test.ts to protect live database.');
			process.env.TEST_MODE = 'true';
		}

		try {
			logger.debug('Loading @config/private configuration...');
			let module: any;
			if (process.env.TEST_MODE) {
				const pathUtil = await import('node:path');
				const { pathToFileURL } = await import('node:url');
				const configPath = pathUtil.resolve(process.cwd(), 'config/private.test.ts').replace(/\\/g, '/');
				const configURL = pathToFileURL(configPath).href;
				module = await import(/* @vite-ignore */ configURL);
			} else {
				// STRICT SAFETY: Never allow loading live config if NODE_ENV is 'test'
				if (process.env.NODE_ENV === 'test') {
					const msg =
						'CRITICAL SAFETY ERROR: Attempted to load live config/private.ts in TEST environment. Strict isolation requires config/private.test.ts.';
					logger.error(msg);
					throw new AppError(msg, 500, 'TEST_ENV_SAFETY_VIOLATION');
				}
				module = await import('@config/private');
			}
			privateEnv = module.privateEnv;

			// SAFETY: Double-check we are not connecting to production in test mode
			if (
				(process.env.TEST_MODE || process.env.NODE_ENV === 'test') &&
				privateEnv?.DB_NAME &&
				!privateEnv.DB_NAME.includes('test') &&
				!privateEnv.DB_NAME.endsWith('_functional')
			) {
				const msg = `⚠️ SAFETY ERROR: DB_NAME '${privateEnv.DB_NAME}' does not look like a test database! Tests must use isolated databases.`;
				logger.error(msg);
				throw new AppError(msg, 500, 'TEST_DB_SAFETY_VIOLATION');
			}

			logger.debug(
				module.__VIRTUAL__ ? 'Using fallback configuration (Setup Mode active)' : 'Private config loaded successfully from config/private.ts',
				{
					hasConfig: !!privateEnv,
					dbType: privateEnv?.DB_TYPE,
					dbHost: privateEnv?.DB_HOST ? '***' : 'missing'
				}
			);
			return privateEnv;
		} catch (error) {
			// Private config doesn't exist during setup - this is expected
			logger.trace('Private config not found during setup - this is expected during initial setup', {
				error: error instanceof Error ? error.message : String(error)
			});
			return null;
		}
	} catch (error) {
		// Private config doesn't exist during setup - this is expected
		logger.trace('Private config not found during setup - this is expected during initial setup', {
			error: error instanceof Error ? error.message : String(error)
		});
		return null;
	}
}

/**
 * Get the in-memory private config if available.
 * Returns null if config hasn't been loaded yet (e.g., during setup).
 * Used by settingsService to avoid filesystem imports when config is already in memory.
 */
export function getPrivateEnv(): InferOutput<typeof privateConfigSchema> | null {
	return privateEnv;
}

// Function to clear private config cache (used after setup completion)
export function clearPrivateConfigCache(keepPrivateEnv = false) {
	logger.debug('Clearing private config cache', {
		keepPrivateEnv,
		hadPrivateEnv: !!privateEnv
	});
	if (!keepPrivateEnv) {
		privateEnv = null;
	}
}
