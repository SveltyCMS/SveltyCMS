/**
 * @file src/widgets/widgetManager.svelte.ts
 * @description Widget Manager for handling widget loading, activation, and configuration
 */
import { mount } from "svelte";
import type { User, WidgetId } from '@src/auth/types';
import type { Schema } from '@src/content/types';

// System Logger
import { logger } from '@utils/logger.svelte';
import type { Widget, WidgetModule } from './types';
import MissingWidget from './MissingWidget.svelte';

// Import reactive stores and initialization from a centralized module (e.g., index.ts)
import { widgetFunctions, activeWidgetList, initializeWidgets } from './index';

export type WidgetStatus = 'active' | 'inactive'; // Define widget status types

export type ModifyRequestParams<T extends (...args: unknown[]) => unknown> = {
	collection: Schema; // Collection schema
	id?: WidgetId; // Optional widget ID
	field: ReturnType<T>; // Field type
	data: { get: () => unknown; update: (newData: unknown) => void }; // Data getter and setter
	user: User; // User information
	type: 'GET' | 'POST' | 'DELETE' | 'PATCH'; // HTTP request type
	meta_data?: Record<string, unknown>; // Optional metadata
};

const widgets = new Map<string, Widget>();
export default widgets;

// Function to resolve a widget placeholder
export async function resolveWidgetPlaceholder(placeholder: {
	__widgetId: string;
	__widgetName: string;
	__widgetConfig: Record<string, unknown>;
}): Promise<Widget> {
	await ensureWidgetsInitialized(); // Ensure widgets are initialized

	// Check if the widget is active using the reactive store
	const isActive = activeWidgetList.get().has(placeholder.__widgetName);
	if (!isActive) {
		logger.debug(`Widget "${placeholder.__widgetName}" is inactive. Rendering placeholder.`);
		return {
			__widgetId: placeholder.__widgetId,
			Name: placeholder.__widgetName,
			component: mount(MissingWidget, { props: { config: placeholder } }),
			config: placeholder.__widgetConfig
		};
	}

	// Find the widget by UUID from the reactive store
	const widgetFn = Array.from(widgetFunctions.get().values()).find(
		(widget) => widget.__widgetId === placeholder.__widgetId
	);

	if (!widgetFn) {
		throw new Error(`Widget with ID ${placeholder.__widgetId} not found`);
	}

	return widgetFn(placeholder.__widgetConfig); // Return the resolved widget
}

// Function to check if a widget is available
export function isWidgetAvailable(widgetName: string): boolean {
	const widgetFn = widgetFunctions.get().get(widgetName); // Get widget function from store
	const isActive = activeWidgetList.get().has(widgetName); // Check active status from store
	return !!widgetFn && isActive; // Return true if available and active
}

// Function to get all widget functions
export function getWidgets() {
	return widgetFunctions.get(); // Return widget functions from store
}

// Function to get active widgets
export function getActiveWidgets() {
	return activeWidgetList.get(); // Return active widgets from store
}

// Function to update widget status
export async function updateWidgetStatus(widgetName: string, status: WidgetStatus): Promise<void> {
	try {
		// Attempt to update the database
		try {
			const { updateWidget } = await import('../databases/dbInterface');
			if (typeof updateWidget === 'function') {
				await updateWidget(widgetName, { isActive: status === 'active' });
			} else {
				logger.debug(`updateWidget is not a function for widget: ${widgetName}`);
			}
		} catch (error) {
			logger.debug(`Failed to update widget status in database: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}

		// Update the reactive active widget list
		const currentActiveWidgets = activeWidgetList.get();
		if (status === 'active') {
			currentActiveWidgets.add(widgetName);
		} else {
			currentActiveWidgets.delete(widgetName);
		}
		activeWidgetList.set(new Set(currentActiveWidgets));

		logger.info(`Widget ${widgetName} ${status} status updated successfully`);
	} catch (error) {
		logger.error(`Error updating widget status:`, error);
		throw error;
	}
}

// Function to get widget configuration
export function getWidgetConfig(widgetName: string) {
	const widgetFn = widgetFunctions.get().get(widgetName); // Get widget function from store
	return widgetFn ? widgetFn({}).config : undefined; // Return widget configuration
}

// Function to update widget configuration
export async function updateWidgetConfig(widgetName: string, config: Record<string, unknown>): Promise<void> {
	const widgetFn = widgetFunctions.get().get(widgetName); // Get widget function from store
	if (!widgetFn) return;

	const updatedWidget = (cfg: Record<string, unknown>) => ({
		...widgetFn(cfg),
		config: { ...widgetFn(cfg).config, ...config } // Update widget configuration
	});
	widgetFunctions.set(new Map(widgetFunctions.get()).set(widgetName, updatedWidget)); // Update store
}

// Function to load all widgets
export async function loadWidgets(): Promise<Map<string, Widget>> {
	await ensureWidgetsInitialized(); // Ensure widgets are initialized
	const widgets = new Map<string, Widget>();
	for (const [name, widgetFn] of widgetFunctions.get().entries()) {
		widgets.set(name, widgetFn({}));
	}
	return widgets;
}

// Helper function to ensure widgets are initialized
async function ensureWidgetsInitialized() {
	await initializeWidgets(); // Use centralized initialization
}

// HMR setup
if (import.meta.hot) {
	import.meta.hot.accept(() => {
		initializeWidgets();
		logger.info('Widgets reloaded due to file changes.');
	});
}