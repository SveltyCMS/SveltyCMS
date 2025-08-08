/**
 * @file src/widgets/widgetManager.svelte.ts
 * @description Widget Manager for handling widget loading, activation, and configuration
 * @deprecated Use widgetStore.svelte.ts instead for new implementations


// Define ModifyRequestParams with constrained genericwidgetManager.svelte.ts
 * @description Widget Manager for handling widget loading, activation, and configuration
 * @deprecated Use widgetStore.svelte.ts instead for new implementations
 */
import { mount } from 'svelte';
import MissingWidget from './MissingWidget.svelte';
import type { Widget, WidgetId } from './types';
import type { User } from '@src/auth/types';
import type { Schema } from '../content/types';

// Import the new widget store
import {
	widgets,
	widgetFunctions,
	activeWidgets,
	widgetStoreActions,
	getWidgetFunction,
	isWidgetActive,
	type WidgetStatus
} from '@stores/widgetStore.svelte';

export type { WidgetStatus };

// Define ModifyRequestParams with constrained generic
export type ModifyRequestParams<T extends (...args: unknown[]) => unknown> = {
	collection: Schema;
	id?: WidgetId;
	field: ReturnType<T>;
	data: { get: () => unknown; update: (newData: unknown) => void };
	user: User;
	type: 'GET' | 'POST' | 'DELETE' | 'PATCH';
	meta_data?: Record<string, unknown>;
};

// Function to resolve a widget placeholder
export async function resolveWidgetPlaceholder(placeholder: {
	__widgetId: string;
	__widgetName: string;
	__widgetConfig: Record<string, unknown>;
}): Promise<Widget> {
	await widgetStoreActions.initializeWidgets();

	const isActive = isWidgetActive(placeholder.__widgetName);
	if (!isActive) {
		console.warn(`Widget "${placeholder.__widgetName}" is inactive. Rendering placeholder.`);
		return {
			__widgetId: placeholder.__widgetId,
			Name: placeholder.__widgetName,
			component: mount(MissingWidget, { props: { config: placeholder } }),
			config: placeholder.__widgetConfig
		};
	}

	const widgetFn = getWidgetFunction(placeholder.__widgetName);
	if (!widgetFn) {
		throw new Error(`Widget with ID ${placeholder.__widgetId} not found`);
	}

	return widgetFn(placeholder.__widgetConfig);
}

// Function to check if a widget is available
export function isWidgetAvailable(widgetName: string): boolean {
	const widget = getWidgetFunction(widgetName);
	const isActive = isWidgetActive(widgetName);
	return !!widget && isActive;
}

// Function to get all widget functions
export function getWidgets() {
	return widgetFunctions;
}

// Function to get active widgets
export function getActiveWidgets() {
	return activeWidgets;
}

// Function to update widget status
export async function updateWidgetStatus(widgetName: string, status: WidgetStatus): Promise<void> {
	return widgetStoreActions.updateWidgetStatus(widgetName, status);
}

// Function to get widget configuration
export function getWidgetConfig(widgetName: string): Record<string, unknown> | undefined {
	const widget = getWidgetFunction(widgetName);
	return widget ? widget({}).config : undefined;
}

// Function to update widget configuration
export async function updateWidgetConfig(widgetName: string, config: Record<string, unknown>): Promise<void> {
	return widgetStoreActions.updateWidgetConfig(widgetName, config);
}

// Function to load all widgets
export async function loadWidgets(): Promise<Record<string, Widget>> {
	await widgetStoreActions.initializeWidgets();
	let currentWidgets: Record<string, Widget> = {};
	widgets.subscribe(($widgets) => {
		currentWidgets = $widgets;
	})();
	return currentWidgets;
}
