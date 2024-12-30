/**
 * @file src/widgets/index.ts
 * @description Widget Index - Main entry point for widget system
 */

import type { WidgetFunction, Widget, WidgetModule } from './types';
import type { GuiSchema } from './core/group/types';
import { v4 as uuidv4 } from 'uuid'; // Import UUID generator for unique widget IDs

// System Logger
import { logger } from '@utils/logger.svelte'; // Import logger for system logging
import { store } from '@utils/reactivity.svelte'; // Import reactive store utility

// Function to check widget dependencies
function checkDependencies(widget: WidgetFunction): boolean {
	if (!widget.dependencies) {
		return true; // No dependencies, so it's valid
	}
	for (const dep of widget.dependencies) {
		if (!widgetFunctions.get().has(dep)) {
			console.log(`Checking dependencies for widget: ${widget.Name} - missing dependency: ${dep}`);
			return false; // Dependency is missing
		}
	}
	console.log('Checking dependencies for widget:', widget.Name);
	return true; // All dependencies are met
}

const widgets = new Map<string, Widget>();

export default widgets;

interface WidgetModule {
	default: WidgetFunction; // Default export of a widget module
}

// State management with reactive stores
const widgetFunctions = store<Map<string, WidgetFunction>>(new Map()); // Store for widget functions
const activeWidgetList = store<Set<string>>(new Set()); // Store for active widgets
let initialized = false; // Initialization status
let dbInitPromise: Promise<void> | null = null; // Database initialization promise

export function getGuiFields(params: Record<string, unknown>, schema: GuiSchema) {
	return schema.properties;
}

// Function to create a widget function from a module
function createWidgetFunction(widgetModule: WidgetModule, name: string): WidgetFunction {
	const widget = widgetModule.default; // Get the default widget function
	widget.Name = widget.Name || name; // Set the widget name
	widget.__widgetId = uuidv4(); // Add a UUID to the widget function
	return widget; // Return the widget function
}

// Function to initialize widgets
export async function initializeWidgets(): Promise<void> {
	if (initialized) return dbInitPromise;
	if (dbInitPromise) return dbInitPromise;

	dbInitPromise = (async () => {
		try {
			// Load core and custom widgets
			const coreWidgetModules = await import.meta.glob<WidgetModule>('./core/**/index.ts', { eager: true });
			const customWidgetModules = await import.meta.glob<WidgetModule>('./custom/**/index.ts', { eager: true });
			const widgetModules = { ...coreWidgetModules, ...customWidgetModules };

			const validModules = Object.entries(widgetModules).map(([path, module]) => {
				const name = path.match(/\.\/(core|custom)\/([^/]+)\//)?.[2];
				if (!name) {
					logger.warn(`Skipping widget module: ${path} - Unable to extract widget name`);
					return null;
				}

				if (typeof module.default !== 'function') {
					logger.warn(`Skipping widget module: ${path} - No valid widget function found`);
					return null;
				}

				return { name, module, isCore: path.includes('/core/') };
			}).filter((m): m is NonNullable<typeof m> => m !== null);

			if (validModules.length === 0) {
				throw new Error('No valid widgets found');
			}

			const newWidgetFunctions = new Map<string, WidgetFunction>();
			const loadedWidgetNames = new Set<string>();

			for (const { name, module, isCore } of validModules) {
				try {
					const widgetFn = createWidgetFunction(module, name);
					if (!checkDependencies(widgetFn({}))) {
						logger.warn(`Skipping widget ${name} - Missing dependencies`);
						continue;
					}
					const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);
					// @ts-expect-error __isCore is not a standard property
					widgetFn.__isCore = isCore;
					newWidgetFunctions.set(capitalizedName, widgetFn);
					loadedWidgetNames.add(capitalizedName);
				} catch (error) {
					logger.error(`Failed to load widget ${name}:`, error);
				}
			}

			// Fetch activation status from the database
			const dbWidgets = await fetchWidgetsFromDatabase();
			const activeWidgets = dbWidgets.filter((widget) => widget.is_active).map((widget) => widget.name);

			// Update widget functions store
			widgetFunctions.set(newWidgetFunctions);

			// Set active widgets based on database status
			activeWidgetList.set(new Set(activeWidgets));

			logger.info(`\x1b[34m${loadedWidgetNames.size}\x1b[0m Widgets initialized successfully \x1b[34m${Array.from(loadedWidgetNames).join(', ')}\x1b[0m`);

			initialized = true;
		} catch (error) {
			logger.error('Failed to initialize widgets');
			console.error(error);
			dbInitPromise = null;
			initialized = false;
			throw error;
		}
	})();

	return dbInitPromise;
}

// Initialize widgets immediately
initializeWidgets().catch((error) => {
	console.error('Failed to initialize widgets:', error); // Log initialization errors
});

// Export the proxy as the default export

// Re-export everything from widgetManager for direct access
export * from './widgetManager.svelte.ts';
