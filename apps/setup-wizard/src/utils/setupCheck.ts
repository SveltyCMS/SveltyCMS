/**
 * @file apps/setup-wizard/src/utils/setupCheck.ts
 * @description Setup-wizard-specific setup check that only validates the config file.
 * It imports the generic file checker from shared-utils.
 *
 * NOTE: Setup-wizard does NOT check the database because it doesn't have DB access.
 * It only checks if the config file exists and is populated.
 */

import { join } from 'node:path';
import { isConfigFilePopulated, invalidateConfigCache } from '@utils/configCheck';

// --- Path Configuration ---
// In monorepo: config is at workspace root (../../config from apps/setup-wizard)
const workspaceRoot = join(process.cwd(), '..', '..');
const configDir = join(workspaceRoot, 'config');
const privateConfigPath = join(configDir, 'private.ts');

/**
 * Checks if the setup is complete by validating the config file.
 * This is a synchronous check that only looks at the config file.
 *
 * @returns {boolean} True if config file exists and has required values populated
 */
export function isSetupComplete(): boolean {
	return isConfigFilePopulated(privateConfigPath);
}

/**
 * Invalidates the cached setup status, forcing a recheck on the next call.
 * This should be called after setup completion to ensure the cache is updated.
 */
export function invalidateSetupCache(): void {
	invalidateConfigCache();
}
