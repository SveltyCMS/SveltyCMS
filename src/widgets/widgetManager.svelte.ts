/**
 * @file src/widgets/widgetManager.svelte.ts
 * @description Widget Manager for handling widget loading, activation, and configuration
 */

import type { SvelteComponent } from 'svelte';
import type { User, WidgetId } from '@src/auth/types';
import type { Schema } from '@src/shared/types';

// System Logger
import { logger } from '@utils/logger.svelte';


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

export interface Widget {
	__widgetId: string; // UUID for the widget instance
	Name: string; // Widget name
	dependencies?: string[]; // List of required widget names or libraries
	component?: typeof SvelteComponent; // Widget component
	config?: Record<string, unknown>; // Widget configuration
	modifyRequest?: (args: ModifyRequestParams<(...args: unknown[]) => unknown>) => Promise<Record<string, unknown>>; // Function to modify requests
	GuiFields?: unknown; // GUI fields for the widget
	Icon?: string; // Icon for the widget
	Description?: string; // Description of the widget
	aggregations?: unknown; // Aggregation settings
}

export interface WidgetFunction {
	(config: Record<string, unknown>): WidgetPlaceholder;
}

export interface WidgetPlaceholder {
	__widgetId: string;
	__widgetName: string;
	__widgetConfig: Record<string, unknown>;
}

const widgets = new Map<string, Widget>();

export default widgets;

export type WidgetFunction = ((config: Record<string, unknown>) => Widget) & {
	__widgetId?: string; // UUID for the widget function
	Name: string; // Widget name
	GuiSchema?: unknown; // GUI schema
	GraphqlSchema?: unknown; // GraphQL schema
	Icon?: string; // Icon for the widget
	Description?: string; // Description of the widget
	aggregations?: unknown; // Aggregation settings
};

const widgetFunctions = $state(new Map<string, WidgetFunction>()); // Store for widget functions
const activeWidgetList = $state(new Set<string>()); // Store for active widgets

// Function to resolve a widget placeholder
export async function resolveWidgetPlaceholder(placeholder: {
	__widgetId: string;
	__widgetName: string;
	__widgetConfig: Record<string, unknown>;
}): Promise<Widget> {
	await initializeWidgets(); // Ensure widgets are initialized

	// Check if the widget is active
	const isActive = activeWidgetList.get().has(placeholder.__widgetName);
	if (!isActive) {
		console.warn(`Widget "${placeholder.__widgetName}" is inactive. Rendering placeholder.`); // Log warning if widget is inactive
		return {
			__widgetId: placeholder.__widgetId,
			Name: placeholder.__widgetName,
			component: 'MissingWidget', // Use the placeholder widget
			config: placeholder.__widgetConfig
		};
	}

	// Find the widget by UUID
	const widgetFn = Array.from(widgetFunctions.get().values()).find(
		(widget) => widget.__widgetId === placeholder.__widgetId
	);

	if (!widgetFn) {
		throw new Error(`Widget with ID ${placeholder.__widgetId} not found`); // Throw error if widget not found
	}

	return widgetFn(placeholder.__widgetConfig); // Return the resolved widget
}

// Function to check if a widget is available
export function isWidgetAvailable(widgetName: string): boolean {
	const widgetFn = widgetFunctions.get().get(widgetName); // Get widget function
	const isActive = activeWidgetList.get().has(widgetName); // Check if widget is active
	return !!widgetFn && isActive; // Return true if widget is available and active
}

// Function to get all widget functions
export function getWidgets() {
	return widgetFunctions.get(); // Return widget functions
}

// Function to get active widgets
export function getActiveWidgets() {
	return activeWidgetList.get(); // Return active widgets
}

// Function to update widget status
export async function updateWidgetStatus(widgetName: string, status: WidgetStatus): Promise<void> {
	try {
		// Update the database
		await updateWidgetStatusInDatabase(widgetName, status === 'active');

		// Update the active widget list
		if (status === 'active') {
			activeWidgetList.update((value) => value.add(widgetName)); // Add widget to active list
		} else if (status === 'inactive') {
			activeWidgetList.update((value) => {
				value.delete(widgetName); // Remove widget from active list
				return value;
			});
		}

		logger.info(`Widget ${widgetName} ${status} status updated successfully`); // Log success message
	} catch (error) {
		logger.error(`Error updating widget status:`, error); // Log error
		throw error; // Re-throw error
	}
}

// Function to get widget configuration
export function getWidgetConfig(widgetName: string) {
	const widget = widgetFunctions.get().get(widgetName); // Get widget function
	return widget ? widget({}).config : undefined; // Return widget configuration
}

// Function to update widget configuration
export async function updateWidgetConfig(widgetName: string, config: Record<string, unknown>): Promise<void> {
	const widget = widgetFunctions.get().get(widgetName); // Get widget function
	if (!widget) return;

	widgetFunctions.update((currentWidgets) => {
		const updatedWidget = (cfg: Record<string, unknown>) => ({
			...widget(cfg),
			config: { ...widget(cfg).config, ...config } // Update widget configuration
		});
		currentWidgets.set(widgetName, updatedWidget); // Update widget in the map
		return currentWidgets;
	});
}

// Function to load all widgets
export async function loadWidgets() {
	await initializeWidgets(); // Ensure widgets are initialized
	const widgets = new Map<string, Widget>(); // Map to store widgets
	for (const [name, widgetFn] of widgetFunctions.get().entries()) {
		widgets.set(name, widgetFn({})); // Add widget to map
	}
	return widgets; // Return widgets
}
