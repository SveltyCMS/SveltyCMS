/**
 * @file src/plugins/client.ts
 * @description Client-side plugin registry and UI component management
 */

import { logger } from '@utils/logger';

/**
 * Registry of plugin UI components (lazy-loaded)
 */
export const pluginUIComponents: Record<string, Record<string, () => Promise<{ default: any }>>> = {
	pagespeed: {
		// score: () => import('@components/plugins/PageSpeedScore.svelte')
	}
};

// Cached loaded components to avoid repeated dynamic imports
const loadedComponents = new Map<string, any>();

/**
 * Get a plugin UI component
 *
 * @param pluginId - ID of the plugin
 * @param componentName - Name of the component provided by the plugin
 * @returns The component or null if not found
 */
export async function getPluginComponent(pluginId: string, componentName: string): Promise<any | null> {
	const cacheKey = `${pluginId}:${componentName}`;
	if (loadedComponents.has(cacheKey)) {
		return loadedComponents.get(cacheKey);
	}

	const plugin = pluginUIComponents[pluginId];
	if (!plugin || !plugin[componentName]) {
		logger.warn(`Plugin component not found: ${pluginId}.${componentName}`);
		return null;
	}

	try {
		const module = await plugin[componentName]();
		const component = module.default;
		loadedComponents.set(cacheKey, component);
		return component;
	} catch (error) {
		logger.error(`Failed to load plugin component: ${pluginId}.${componentName}`, error);
		return null;
	}
}
