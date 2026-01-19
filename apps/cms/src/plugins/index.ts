/**
 * @file src/plugins/index.ts
 * @description Plugin system initialization and exports
 *
 * This module:
 * - Exports plugin registry and types
 * - Registers all available plugins
 * - Initializes plugins during server startup
 */

export * from './types';
export { pluginRegistry } from './registry';

// Import all plugins
import { pageSpeedPlugin } from './pagespeed';
import type { Plugin } from './types';

/**
 * All available plugins
 */
export const availablePlugins: Plugin[] = [pageSpeedPlugin];

/**
 * Initialize plugin system
 * Registers all plugins and runs migrations
 *
 * Called during server startup (from hooks.server.ts or db.ts)
 */
export async function initializePlugins(dbAdapter: any, tenantId: string = 'default'): Promise<void> {
	const { pluginRegistry } = await import('./registry');
	const { logger } = await import('@shared/utils/logger.server');

	try {
		logger.info('🔌 Initializing plugin system...');

		// Register all available plugins
		for (const plugin of availablePlugins) {
			await pluginRegistry.register(plugin);
		}

		// Run migrations for all plugins
		await pluginRegistry.runAllMigrations(dbAdapter, tenantId);

		// Mark registry as initialized
		pluginRegistry.markInitialized();

		logger.info('✅ Plugin system initialized');
	} catch (error) {
		logger.error('Failed to initialize plugin system', { error });
		// Don't throw - allow server to start even if plugins fail
	}
}
