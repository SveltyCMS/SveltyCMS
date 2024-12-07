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
	component: unknown;
	config?: Record<string, unknown>;
	modifyRequest?: (args: ModifyRequestParams<(...args: unknown[]) => unknown>) => Promise<Record<string, unknown>>;
}

export type WidgetFunction = (config: Record<string, unknown>) => Widget;

// State management with reactive stores
const widgetFunctions = store<Record<string, WidgetFunction>>({});
const activeWidgetList = store<string[]>([]);

interface WidgetModule {
	default: unknown;
	config?: Record<string, unknown>;
	modifyRequest?: Widget['modifyRequest'];
}

function createWidgetFunction(widgetModule: WidgetModule, name: string): WidgetFunction {
	return (config: Record<string, unknown>) => ({
		Name: name,
		component: widgetModule.default || widgetModule,
		config: { ...widgetModule.config, ...config },
		modifyRequest: widgetModule.modifyRequest
	});
}

// Proxy for accessing widget functions
export const widgets = new Proxy({} as Record<string, WidgetFunction>, {
	get(_, prop: string) {
		return widgetFunctions.value[prop];
	}
});

export async function initializeWidgets(): Promise<void> {
	try {
		// Dynamically import all widget modules from the widgets directory
		const widgetModules = import.meta.glob<WidgetModule>('./*/index.ts', { eager: false });
		const newWidgetFunctions: Record<string, WidgetFunction> = {};

		// Iterate through all widget modules
		for (const path in widgetModules) {
			try {
				// Extract widget name from path (e.g., './input/index.ts' -> 'input')
				const name = path.match(/\.\/([^/]+)\//)?.[1];

				if (!name) {
					logger.warn(`Skipping widget module: ${path} - Unable to extract widget name`);
					continue;
				}

				// Dynamically import the module
				const module = await widgetModules[path]();

				// Ensure the module has a default export that can be used as a widget
				if (typeof module.default !== 'function') {
					logger.warn(`Skipping widget module: ${path} - No valid widget function found`);
					continue;
				}

				// Create and store the widget function
				const widgetFn = createWidgetFunction(module, name);
				newWidgetFunctions[name.charAt(0).toUpperCase() + name.slice(1)] = widgetFn;

				logger.debug(`Loaded widget: \x1b[34m${name}\x1b[0m`);
			} catch (moduleError) {
				logger.error(`Failed to load widget module ${path}:`, moduleError);
			}
		}

		// Update widget functions store
		widgetFunctions.set(newWidgetFunctions);
		logger.info('Widgets initialized successfully', Object.keys(newWidgetFunctions));

		// Load active widgets from the database
		try {
			const response = await fetch('/api/widgets/active');
			if (!response.ok) {
				throw new Error(`Failed to fetch active widgets: ${response.statusText}`);
			}
			const activeWidgets = await response.json();
			activeWidgetList.set(activeWidgets);
		} catch (error) {
			logger.error(`Error fetching active widgets:`, error);
		}
	} catch (error) {
		logger.error('Failed to initialize widgets:', error);
		throw error;
	}
}

export function getWidgets(): Record<string, WidgetFunction> {
	return widgetFunctions.value;
}

export function getActiveWidgets(): string[] {
	return activeWidgetList.value;
}

export async function updateWidgetStatus(widgetName: string, status: WidgetStatus): Promise<void> {
	try {
		const response = await fetch('/api/widgets/status', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ widgetName, status })
		});

		if (!response.ok) {
			throw new Error(`Failed to update widget status: ${response.statusText}`);
		}

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
