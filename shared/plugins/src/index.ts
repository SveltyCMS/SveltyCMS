/**
 * @file shared/plugins/src/index.ts
 * @description Main entry point for the SveltyCMS plugin system
 *
 * Exports:
 * - Plugin types and interfaces
 * - Plugin registry for managing plugins
 * - Plugin initialization function
 */

// Export all plugin types
export * from './types';

// Export plugin registry
export { pluginRegistry } from './registry';

/**
 * Available plugins
 * TODO: Import plugins from apps/cms/src/plugins/ when implemented
 */
export const availablePlugins: any[] = [];

/**
 * Initialize plugin system
 * Called during application startup
 */
export async function initializePlugins() {
	console.log('Plugin system: Initialization pending - see shared/plugins/README.md');
	// TODO: Implement full plugin initialization
	// - Register plugins from availablePlugins
	// - Run database migrations
	// - Initialize plugin state
}
