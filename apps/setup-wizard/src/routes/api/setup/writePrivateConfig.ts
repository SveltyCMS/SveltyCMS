/**
 * @file src/routes/api/setup/writePrivateConfig.ts
 * @description Utility to write private.ts configuration file during setup
 * Now uses shared-config library to eliminate circular dependencies
 */

import { writePrivateConfig as sharedWritePrivateConfig } from '@sveltycms/shared-config/writePrivateConfig';
import type { DatabaseConfig } from '@sveltycms/shared-config/schemas';
import { logger } from '@utils/logger.svelte';

/**
 * Writes database credentials and security keys to private.ts
 * Delegates to shared-config library
 */
export async function writePrivateConfig(dbConfig: DatabaseConfig): Promise<void> {
	await sharedWritePrivateConfig(dbConfig, logger);
}
