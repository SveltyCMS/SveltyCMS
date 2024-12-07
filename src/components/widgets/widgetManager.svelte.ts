/**
 * @file src/components/widgets/widgetManager.svelte.ts
 * @description Widget Manager for handling widget loading, activation, and configuration
 */

import type { User, WidgetId } from '@src/auth/types';
import type { Schema } from '@src/collections/types';
import { store } from '@utils/reactivity.svelte';

// System Logger
import { logger } from '@utils/logger.svelte';

export type WidgetStatus = 'active' | 'inactive';

export type ModifyRequestParams<T extends (...args: unknown[]) => unknown> = {
	collection: Schema;
	id?: WidgetId;
	field: ReturnType<T>;
	data: { get: () => unknown; update: (newData: unknown) => void };
	user: User;
	type: 'GET' | 'POST' | 'DELETE' | 'PATCH';
	meta_data?: Record<string, unknown>;
};

export interface Widget {
	Name: string;
	component?: unknown;
	config?: Record<string, unknown>;
	modifyRequest?: (args: ModifyRequestParams<(...args: unknown[]) => unknown>) => Promise<Record<string, unknown>>;
	GuiFields?: unknown;
	Icon?: string;
	Description?: string;
	aggregations?: unknown;
}

export type WidgetFunction = ((config: Record<string, unknown>) => Widget) & {
	Name: string;
	GuiSchema?: unknown;
	GraphqlSchema?: unknown;
	Icon?: string;
	Description?: string;
	aggregations?: unknown;
};

interface WidgetModule {
	default: WidgetFunction;
}

// State management with reactive stores
const widgetFunctions = store<Record<string, WidgetFunction>>({});
const activeWidgetList = store<string[]>([]);
let initialized = false;
let initializationPromise: Promise<void> | null = null;

function createWidgetFunction(widgetModule: WidgetModule, name: string): WidgetFunction {
	const widget = widgetModule.default;
	// Copy static properties
	widget.Name = widget.Name || name;
	return widget;
}

export async function initializeWidgets(): Promise<void> {
	// If already initialized or initializing, return the existing promise
	if (initialized) return;
	if (initializationPromise) return initializationPromise;

	initializationPromise = (async () => {
		try {
			// Dynamically import all widget modules from the widgets directory
			const widgetModules = await Promise.all(
				Object.entries(import.meta.glob<WidgetModule>('./*/index.ts', { eager: true }))
					.map(async ([path, module]) => {
						try {
							// Extract widget name from path (e.g., './input/index.ts' -> 'input')
							const name = path.match(/\.\/([^/]+)\//)?.[1];
							if (!name) {
								logger.warn(`Skipping widget module: ${path} - Unable to extract widget name`);
								return null;
							}

							// Ensure the module has a default export that can be used as a widget
							if (typeof module.default !== 'function') {
								logger.warn(`Skipping widget module: ${path} - No valid widget function found`);
								return null;
							}

							return { name, module };
						} catch (error) {
							logger.error(`Failed to process widget module ${path}:`, error);
							return null;
						}
					})
			);

			const validModules = widgetModules.filter((m): m is NonNullable<typeof m> => m !== null);

			if (validModules.length === 0) {
				throw new Error('No valid widgets found');
			}

			const newWidgetFunctions: Record<string, WidgetFunction> = {};
			const widgetNames: string[] = [];

			for (const { name, module } of validModules) {
				const widgetFn = createWidgetFunction(module, name);
				const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);
				newWidgetFunctions[capitalizedName] = widgetFn;
				widgetNames.push(capitalizedName);
				logger.debug(`Loaded widget: \x1b[34m${name}\x1b[0m`);
			}

			// Update widget functions store
			widgetFunctions.set(newWidgetFunctions);

			// Set all widgets as active by default
			activeWidgetList.set(widgetNames);

			logger.info('Widgets initialized successfully', widgetNames);

			initialized = true;
		} catch (error) {
			logger.error('Failed to initialize widgets:', error);
			// Clear the initialization promise so we can try again
			initializationPromise = null;
			initialized = false;
			throw error;
		}
	})();

	return initializationPromise;
}

export async function resolveWidgetPlaceholder(placeholder: { __widgetName: string; __widgetConfig: Record<string, unknown> }): Promise<Widget> {
	await initializeWidgets();

	const widgetName = placeholder.__widgetName;
	const widgetFn = widgetFunctions.value[widgetName];

	if (!widgetFn) {
		throw new Error(`Widget ${widgetName} not found`);
	}

	return widgetFn(placeholder.__widgetConfig);
}

export function getWidgets(): Record<string, WidgetFunction> {
	return widgetFunctions.value;
}

export function getActiveWidgets(): string[] {
	return activeWidgetList.value;
}

export async function updateWidgetStatus(widgetName: string, status: WidgetStatus): Promise<void> {
	try {
		// Update the active widgets list
		if (status === 'active' && !activeWidgetList.value.includes(widgetName)) {
			activeWidgetList.set([...activeWidgetList.value, widgetName]);
		} else if (status === 'inactive') {
			activeWidgetList.set(activeWidgetList.value.filter(w => w !== widgetName));
		}

		logger.info(`Widget ${widgetName} ${status} status updated successfully`);
	} catch (error) {
		logger.error(`Error updating widget status:`, error);
		throw error;
	}
}

export function getWidgetConfig(widgetName: string): Record<string, unknown> | undefined {
	const widget = widgetFunctions.value[widgetName];
	return widget ? widget({}).config : undefined;
}

export async function updateWidgetConfig(widgetName: string, config: Record<string, unknown>): Promise<void> {
	const widget = widgetFunctions.value[widgetName];
	if (!widget) return;

	widgetFunctions.set({
		...widgetFunctions.value,
		[widgetName]: (cfg: Record<string, unknown>) => ({
			...widget(cfg),
			config: { ...widget(cfg).config, ...config }
		})
	});
}

export async function loadWidgets(): Promise<Record<string, Widget>> {
	await initializeWidgets();
	const widgets = Object.entries(widgetFunctions.value).reduce((acc, [name, widgetFn]) => {
		acc[name] = widgetFn({});
		return acc;
	}, {} as Record<string, Widget>);
	return widgets;
}

// Initialize widgets immediately
initializeWidgets().catch(error => {
	logger.error('Failed to initialize widgets:', error);
});
