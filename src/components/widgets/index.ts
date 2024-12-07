/**
 * @file src/components/widgets/index.ts
 * @description Widget Index - Main entry point for widget system
 */

import { initializeWidgets, type WidgetFunction } from './widgetManager.svelte';

// Initialize widgets immediately and store the promise
const initPromise = initializeWidgets().catch(error => {
    console.error('Failed to initialize widgets:', error);
    throw error;
});

// Create a proxy that ensures widgets are initialized before use
const widgetProxy = new Proxy({} as Record<string, WidgetFunction>, {
    get(target, prop: string) {
        // Return a function that matches our widget module structure
        return async (config: Record<string, unknown>) => {
            // Ensure widgets are initialized before creating the placeholder
            await initPromise;

            const widgetName = prop.charAt(0).toUpperCase() + prop.slice(1);
            return {
                __widgetName: widgetName,
                __widgetConfig: config,
                __isWidgetPlaceholder: true,
                // Add required widget interface properties
                label: config.label as string || prop,
                db_fieldName: config.db_fieldName,
                translated: config.translated,
                required: config.required,
                icon: config.icon,
                width: config.width,
                helper: config.helper,
                permissions: config.permissions,
                // Add any widget-specific properties
                display: config.display,
                validate: config.validate,
                callback: config.callback,
                modifyRequest: config.modifyRequest,
                // Add widget object structure
                widget: {
                    Name: widgetName,
                    GuiFields: config.GuiFields
                }
            };
        };
    }
});

// Export the proxy as the default export
export default widgetProxy;

// Re-export everything from widgetManager for direct access
export * from './widgetManager.svelte';

// Export the initialization function for explicit initialization
export { initializeWidgets };
