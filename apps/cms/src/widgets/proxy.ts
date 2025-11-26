/**
 * @file src/widgets/proxy.ts
 * @description A proxy to access widget functions statically.
 * This is used by collection configuration files.
 */
import type { Widget, WidgetModule } from '@widgets/types';
import { logger } from '@utils/logger';

export type WidgetFunction = (config: Record<string, unknown>) => Widget;

const widgetFunctions: Record<string, WidgetFunction> = {};

function processWidgetModule(
	path: string,
	module: WidgetModule
): {
	name: string;
	widgetFn: WidgetFunction;
} | null {
	try {
		const name = path.split('/').at(-2);
		if (!name) {
			logger.warn(`Skipping widget module: ${path} - Unable to extract widget name`);
			return null;
		}

		if (typeof module.default !== 'function') {
			logger.warn(`Skipping widget module: ${path} - No valid widget function found`);
			return null;
		}

		const originalFn = module.default;
		const widgetName = originalFn.Name || name;

		const widgetFn: WidgetFunction = Object.assign((config: Record<string, unknown>) => originalFn(config), {
			Name: widgetName,
			GuiSchema: originalFn.GuiSchema,
			GraphqlSchema: originalFn.GraphqlSchema,
			Icon: originalFn.Icon,
			Description: originalFn.Description,
			aggregations: originalFn.aggregations
		});

		return {
			name: name,
			widgetFn
		};
	} catch (error) {
		logger.error(`Failed to process widget module ${path}:`, error);
		return null;
	}
}

const coreModules = import.meta.glob<WidgetModule>('./core/*/index.ts', {
	eager: true
});
const customModules = import.meta.glob<WidgetModule>('./custom/*/index.ts', {
	eager: true
});

for (const [path, module] of Object.entries(coreModules)) {
	const processedWidget = processWidgetModule(path, module);
	if (processedWidget) {
		const { name, widgetFn } = processedWidget;
		widgetFunctions[name] = widgetFn;
	}
}

for (const [path, module] of Object.entries(customModules)) {
	const processedWidget = processWidgetModule(path, module);
	if (processedWidget) {
		const { name, widgetFn } = processedWidget;
		widgetFunctions[name] = widgetFn;
	}
}

export const widgetProxy = new Proxy(widgetFunctions, {
	get(target, prop) {
		if (typeof prop === 'string' && prop in target) {
			return target[prop];
		}
		// Return a dummy function to avoid breaking the app
		// This will be caught by svelte-check
		return () => ({});
	}
});
