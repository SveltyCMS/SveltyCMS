/**
 * @file shared/plugins/src/registry.ts
 * @description Plugin registry for managing registered plugins
 *
 * Maintains a centralized registry of all plugins and handles:
 * - Plugin registration and unregistration
 * - Migration execution tracking
 * - Plugin state management
 *
 * Note: Full implementation pending until database structure is migrated to shared/
 */

import type { Plugin, PluginRegistryEntry } from './types';

/**
 * Plugin Registry (Singleton)
 * Stores all registered plugins in memory
 */
class PluginRegistry {
	private plugins: Map<string, PluginRegistryEntry> = new Map();
	private initialized = false;

	/**
	 * Register a plugin
	 */
	async register(plugin: Plugin): Promise<void> {
		if (this.plugins.has(plugin.metadata.id)) {
			console.warn(`Plugin ${plugin.metadata.id} already registered`);
			return;
		}

		this.plugins.set(plugin.metadata.id, {
			plugin,
			registeredAt: new Date()
		});
	}

	/**
	 * Get a registered plugin
	 */
	getPlugin(id: string): Plugin | undefined {
		return this.plugins.get(id)?.plugin;
	}

	/**
	 * Get all registered plugins
	 */
	getAllPlugins(): Plugin[] {
		return Array.from(this.plugins.values()).map(entry => entry.plugin);
	}

	/**
	 * Mark registry as initialized
	 */
	markInitialized(): void {
		this.initialized = true;
	}

	/**
	 * Check if registry is initialized
	 */
	isInitialized(): boolean {
		return this.initialized;
	}
}

// Export singleton instance
export const pluginRegistry = new PluginRegistry();
