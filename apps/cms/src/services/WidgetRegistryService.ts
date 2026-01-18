/**
 * @file shared/services/src/WidgetRegistryService.ts
 * @description A server-side singleton service that discovers and holds all widget blueprints.
 */

import type { WidgetFactory, WidgetModule, WidgetType } from '@cms-types';
import { logger } from '@shared/utils/logger';

class WidgetRegistryService {
	private static instance: WidgetRegistryService;
	private widgets: Map<string, WidgetFactory> = new Map();

	private constructor() {
		logger.debug('WidgetRegistryService instance created.');
	}

	public static getInstance(): WidgetRegistryService {
		if (!WidgetRegistryService.instance) {
			WidgetRegistryService.instance = new WidgetRegistryService();
		}
		return WidgetRegistryService.instance;
	}

	/**
	 * Registers a single widget manually.
	 */
	public registerWidget(name: string, widgetFn: WidgetFactory): void {
		this.widgets.set(name, widgetFn);
		logger.trace(`[WidgetRegistryService] Registered widget: ${name}`);
	}

	/**
	 * Registers multiple widgets at once.
	 */
	public registerWidgets(widgets: Record<string, WidgetFactory>): void {
		for (const [name, widgetFn] of Object.entries(widgets)) {
			this.registerWidget(name, widgetFn);
		}
	}

	public getWidget(name: string): WidgetFactory | undefined {
		return this.widgets.get(name);
	}

	public getAllWidgets(): Map<string, WidgetFactory> {
		return this.widgets;
	}

	/**
	 * Processes a raw widget module into a standard factory (internal use)
	 */
	public processWidgetModule(
		path: string,
		module: WidgetModule,
		type: WidgetType
	): {
		name: string;
		widgetFn: WidgetFactory;
		dependencies: string[];
		folderName: string;
	} | null {
		try {
			const name = path.split('/').at(-2);
			if (!name) return null;

			if (typeof module.default !== 'function') return null;

			const originalFn = module.default;
			const widgetName = originalFn.Name || name;
			const dependencies = originalFn.__dependencies || [];

			const widgetFn: WidgetFactory = Object.assign((config: any) => originalFn(config), {
				Name: widgetName,
				GuiSchema: originalFn.GuiSchema,
				GraphqlSchema: originalFn.GraphqlSchema,
				Icon: originalFn.Icon,
				Description: originalFn.Description,
				aggregations: originalFn.aggregations,
				__widgetType: type,
				__dependencies: dependencies,
				__inputComponentPath: originalFn.__inputComponentPath || '',
				__displayComponentPath: originalFn.__displayComponentPath || '',
				componentPath: originalFn.__inputComponentPath || ''
			}) as unknown as WidgetFactory;

			return {
				name: widgetFn.Name,
				widgetFn,
				dependencies,
				folderName: name
			};
		} catch (error) {
			logger.error(`Failed to process widget module ${path}:`, error);
			return null;
		}
	}
}

export const widgetRegistryService = WidgetRegistryService.getInstance();
