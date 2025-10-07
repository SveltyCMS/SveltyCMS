/**
 * @file src/widgets/WidgetRegistryService.ts
 * @description A server-side singleton service that discovers and holds all widget blueprints.
 */
import type { WidgetFunction, WidgetModule } from '@src/widgets/types';
import { logger } from '@utils/logger.svelte';

class WidgetRegistryService {
	private static instance: WidgetRegistryService;
	private widgets: Map<string, WidgetFunction> = new Map();
	private isInitialized = false;

	private constructor() {
		logger.debug('WidgetRegistryService instance created.');
	}

	public static getInstance(): WidgetRegistryService {
		if (!WidgetRegistryService.instance) {
			WidgetRegistryService.instance = new WidgetRegistryService();
		}
		return WidgetRegistryService.instance;
	}

	public async initialize(): Promise<void> {
		if (this.isInitialized) {
			logger.trace('WidgetRegistryService already initialized. Skipping.');
			return;
		}

		const startTime = performance.now();
		logger.info('Initializing WidgetRegistryService, scanning for widgets...');

		try {
			const coreModules = import.meta.glob<WidgetModule>('/src/widgets/core/*/index.ts', { eager: true });
			const customModules = import.meta.glob<WidgetModule>('/src/widgets/custom/*/index.ts', { eager: true });
			const allModules = { ...coreModules, ...customModules };

			for (const [path, module] of Object.entries(allModules)) {
				const pathParts = path.split('/');
				const folderName = pathParts.at(-2);
				const type = pathParts.at(-4) as 'core' | 'custom';

				if (!folderName || typeof module.default !== 'function') {
					logger.warn(`Skipping invalid widget module at: ${path}`);
					continue;
				}

				const widgetFn = module.default;
				// Use the widget's Name property if available, otherwise use folder name
				const widgetName = widgetFn.Name || folderName;
				widgetFn.Name = widgetName;
				widgetFn.__isCore = type === 'core';

				// Store by the widget's Name (should be PascalCase like "Input", "Text", etc.)
				this.widgets.set(widgetName, widgetFn);

				// Also store with a PascalCase normalized version if the name is all-caps (e.g., "SEO" -> "Seo")
				const normalizedName = widgetName.charAt(0).toUpperCase() + widgetName.slice(1).toLowerCase();
				if (normalizedName !== widgetName && widgetName === widgetName.toUpperCase()) {
					this.widgets.set(normalizedName, widgetFn);
					logger.trace(`Registered widget: \x1b[34m${widgetName}\x1b[0m with alias \x1b[33m${normalizedName}\x1b[0m (from \x1b[32m${path}\x1b[0m)`);
				} else {
					logger.trace(`Registered widget: \x1b[34m${widgetName}\x1b[0m (from \x1b[32m${path}\x1b[0m)`);
				}
			}

			this.isInitialized = true;
			const duration = (performance.now() - startTime).toFixed(2);
			logger.info(`✅ WidgetRegistryService initialized with \x1b[32m${this.widgets.size}\x1b[0m widgets in ${duration}ms.`);
		} catch (error) {
			logger.error('Failed to initialize WidgetRegistryService', error);
			throw error;
		}
	}

	public getWidget(name: string): WidgetFunction | undefined {
		return this.widgets.get(name);
	}

	public getAllWidgets(): Map<string, WidgetFunction> {
		if (!this.isInitialized) {
			logger.warn('⚠️ getAllWidgets() called before initialization! Returning empty map.');
		}
		return this.widgets;
	}
}

export const widgetRegistryService = WidgetRegistryService.getInstance();
