/**
 * @file src/widgets/index.ts
 * @description Widget Index - Main entry point for widget system
 *
 * @example
 * import { widgets, initializeWidgets } from '@widgets/index';
 *
 * Features:
 * - Widget registration and management
 * - Widget initialization
 * - Widget activation and deactivation
 * - Widget configuration
 */

import type { WidgetFunction, WidgetModule } from './types';
import type { GuiSchema } from './core/group/types';
import { v4 as uuidv4 } from 'uuid'; // Import UUID generator for unique widget IDs

// Reactive stores
import { store } from '@utils/reactivity.svelte'; // Import reactive store utility

// System Logger
import { logger } from '@utils/logger.svelte';

// Function to check widget dependencies
function checkDependencies(widget: WidgetFunction): boolean {
	if (!widget.dependencies) {
		return true; // No dependencies, so it's valid
	}
	for (const dep of widget.dependencies) {
		if (!widgetFunctions.get().has(dep)) {
			logger.info(`Checking dependencies for widget: ${widget.Name} - missing dependency: ${dep}`);
			return false; // Dependency is missing
		}
	}
	logger.info('Checking dependencies for widget:', widget.Name);
	return true; // All dependencies are met
}

const widgets: Record<string, WidgetFunction> = {};

export default widgets;

// State management with reactive stores
export const widgetFunctions = store<Map<string, WidgetFunction>>(new Map()); // Store for widget functions
const activeWidgetList = store<Set<string>>(new Set()); // Store for active widgets

// init state
let initialized = false; // Initialization status
let dbInitPromise: Promise<void> | null = null; // Database initialization promise

export function getGuiFields(params: Record<string, unknown>, schema: GuiSchema) {
	return schema.properties;
}

// Function to create a widget function from a module
function createWidgetFunction(widgetModule: WidgetModule, name: string): WidgetFunction {
	const widget = widgetModule.default; // Get the default widget function
	widget.Name = widget.Name || name; // Set the widget name
	widget.__widgetId = uuidv4().replace(/-/g, ''); // Add a UUID to the widget function
	return widget; // Return the widget function
}

// Function to initialize widgets
export async function initializeWidgets(): Promise<void> {
	if (initialized) return;
	if (dbInitPromise) return;

	dbInitPromise = (async () => {
		try {
			const startTime = performance.now();
			// logger.debug('Initializing widgets from index...');

			// Load core and custom widgets
			const coreWidgetModules = await import.meta.glob<WidgetModule>('./core/**/index.ts', {
				eager: true
			});
			const customWidgetModules = await import.meta.glob<WidgetModule>('./custom/**/index.ts', {
				eager: true
			});
			const widgetModules = { ...coreWidgetModules, ...customWidgetModules };

			const validModules = Object.entries(widgetModules)
				.map(([path, module]) => {
					const match = path.match(/\.\/(core|custom)\/([^/]+)\//);
					if (!match) {
						logger.warn(`Skipping widget module: ${path} - Unable to extract widget name`);
						return null;
					}
					// eslint-disable-next-line @typescript-eslint/no-unused-vars
					const [_fullMatch, folderType, name] = match;

					// Capitalize the first letter of the widget name
					const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);

					// Construct the full component path
					const componentPath = path.replace(/index\.ts$/, `${capitalizedName}.svelte`).replace(/^\.\//, `/src/widgets/`);

					if (!name) {
						logger.warn(`Skipping widget module: ${path} - Unable to extract widget name`);
						return null;
					}
					if (typeof module.default !== 'function') {
						logger.warn(`Skipping widget module: ${path} - No valid widget function found`);
						return null;
					}

					return { name, module, isCore: folderType === 'core', componentPath };
				})
				.filter((m): m is NonNullable<typeof m> => m !== null)
				.sort((a, b) => {
					// Load core widgets first, then custom widgets
					if (a.isCore && !b.isCore) return -1;
					if (!a.isCore && b.isCore) return 1;
					return a.name.localeCompare(b.name); // Then alphabetically
				});

			const newWidgetFunctions = new Map<string, WidgetFunction>();
			const loadedWidgetNames = new Set<string>();

			// Load all widgets in order (core first, then custom)
			for (const { name, module, isCore, componentPath } of validModules) {
				try {
					const widgetFn = createWidgetFunction(module, name);

					if (!widgetFn) {
						logger.warn(`Skipping widget ${name} - No widget function found`);
						continue;
					}
					if (!checkDependencies(widgetFn({}))) {
						logger.warn(`Skipping widget ${name} - Missing dependencies`);
						continue;
					}
					const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);

					widgetFn.__isCore = isCore;
					widgetFn.componentPath = componentPath;
					newWidgetFunctions.set(capitalizedName, widgetFn);
					widgets[capitalizedName] = widgetFn;
					loadedWidgetNames.add(capitalizedName);
				} catch (error) {
					logger.warn(`Skipping widget ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
					continue;
				}
			}

			// Fetch activation status from the database with fallback
			let activeWidgets: string[] = [];
			try {
				//const { fetchWidgets } = await import('../databases/dbInterface');
				//const dbWidgets = await fetchWidgets();
				//activeWidgets = dbWidgets.filter((widget) => widget.is_active).map((widget) => widget.name);
			} catch (error: unknown) {
				// If any error occurs, activate all widgets
				activeWidgets = Array.from(newWidgetFunctions.keys());
				logger.warn(`Failed to fetch widget status: ${error instanceof Error ? error.message : 'Unknown error'}, activating all widgets`);
			}

			// Update widget functions store with ALL widgets
			widgetFunctions.set(newWidgetFunctions);
			// Set active widgets based on database status
			activeWidgetList.set(new Set(activeWidgets));

			// Log Initialization Summary
			const coreWidgets = Array.from(newWidgetFunctions.values()).filter((w) => w.__isCore);
			const customWidgets = Array.from(newWidgetFunctions.values()).filter((w) => !w.__isCore);

			const startupTime = performance.now() - startTime;
			logger.info(`⚡ \x1b[34m${coreWidgets.length} core widgets\x1b[0m loaded: \x1b[34m${coreWidgets.map((w) => w.Name).join(', ')}\x1b[0m`);
			if (customWidgets.length > 0) {
				logger.info(`📦 \x1b[32m${customWidgets.length} custom widgets\x1b[0m loaded: \x1b[33m${customWidgets.map((w) => w.Name).join(', ')}\x1b[0m`);
			}
			logger.info(`🚀 All \x1b[32m${newWidgetFunctions.size} widgets\x1b[0m loaded Successfully in \x1b[32m${startupTime.toFixed(2)}ms\x1b[0m`);

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

// Widget initialization state
let widgetsInitialized = false;

export async function ensureWidgetsInitialized() {
	if (!widgetsInitialized) {
		try {
			await initializeWidgets();
			// Make widgets available globally for eval context
			globalThis.widgets = widgets;
			widgetsInitialized = true;
		} catch (error) {
			logger.error('Failed to initialize widgets:', error);
			throw error;
		}
	}
}

// Re-export everything from widgetManager for direct access
export * from './widgetManager.svelte.ts';
