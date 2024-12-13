/**
 * @file src/components/widgets/index.ts
 * @description Widget Index - Main entry point for widget system
 */

import { getWidgets, initializeWidgets, type WidgetFunction } from './widgetManager.svelte';

// Create a proxy that ensures widgets are initialized before use
const widgetProxy = new Proxy({} as Record<string, WidgetFunction>, {
    get(target, prop) {
        // Return a function that matches our widget module structure
        return (config: Record<string, unknown>) => {
            const widgetName = prop.toString().charAt(0).toUpperCase() + prop.toString().slice(1);
            return {
                __widgetName: widgetName,
                __widgetConfig: config,
                __isWidgetPlaceholder: true,
                // Add required widget interface properties
                label: config.label as string || prop.toString(),
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

// Initialize widgets immediately
initializeWidgets().catch(error => {
    console.error('Failed to initialize widgets:', error);
});

// Export the proxy as the default export
export default widgetProxy;

// Re-export everything from widgetManager for direct access
export * from './widgetManager.svelte';

// Export the initialization function for explicit initialization
export { initializeWidgets };
