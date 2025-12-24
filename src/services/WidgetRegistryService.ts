/**
 * @file src/services/WidgetRegistryService.ts
 * @description A server-side singleton service that discovers and holds all widget blueprints.
 */

import type { WidgetFactory, WidgetModule, WidgetType } from '@src/widgets/types';
import { logger } from '@utils/logger';
import { coreModules, customModules } from '@src/widgets/scanner';

class WidgetRegistryService {
	private static instance: WidgetRegistryService;
	private widgets: Map<string, WidgetFactory> = new Map();
	private isInitialized = false;
	private initializationPromise: Promise<void> | null = null;

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
			return;
		}

		if (this.initializationPromise) {
			return this.initializationPromise;
		}

		this.initializationPromise = (async () => {
			const startTime = performance.now();
			logger.info('Initializing WidgetRegistryService, registering pre-scanned widgets...');

			try {
				// Register core widgets
				for (const [path, module] of Object.entries(coreModules)) {
					const processed = this._processWidgetModule(path, module, 'core');
					if (processed) {
						this.widgets.set(processed.name, processed.widgetFn);
						logger.trace(`[WidgetRegistryService] Registered core: ${processed.name}`);
					}
				}

				// Register custom widgets
				for (const [path, module] of Object.entries(customModules)) {
					const processed = this._processWidgetModule(path, module, 'custom');
					if (processed) {
						this.widgets.set(processed.name, processed.widgetFn);
						logger.trace(`[WidgetRegistryService] Registered custom: ${processed.name}`);
					}
				}

				// Process custom widgets specifically if needed, or just rely on allModules loop above.
				// The previous code looped over allModules AND customModules again?
				// Looking at the original file:
				// Line 39 looped allModules. Line 60 looped customModules.
				// This seems redundant if allModules contains customModules.
				// I will stick to looping allModules only to avoid duplicates, assuming customModules are in allModules.
				// Wait, the original code had:
				// const allModules = { ...coreModules, ...customModules };
				// Loop allModules...
				// Then Loop customModules...
				// This DEFINITELY caused double registration for custom widgets.
				// I will REMOVE the second redundant loop.

				logger.trace('[WidgetRegistryService] All registered widget names:', Array.from(this.widgets.keys()));

				// Scan marketplace widgets (runtime discovery)
				try {
					const fs = await import('fs/promises');
					const path = await import('path');
					const marketplaceDir = path.resolve(process.cwd(), 'src/widgets/marketplace');

					try {
						const widgetFolders = await fs.readdir(marketplaceDir, { withFileTypes: true });
						logger.trace(`[WidgetRegistry] Scanning marketplace directory: ${marketplaceDir}`);

						for (const folder of widgetFolders) {
							if (folder.isDirectory()) {
								const indexPath = path.join(marketplaceDir, folder.name, 'index.ts');
								try {
									// Dynamically import the runtime-discovered widget
									// @vite-ignore tells Vite to skip this dynamic import at build time
									const module = (await import(/* @vite-ignore */ indexPath)) as WidgetModule;

									if (module.default && typeof module.default === 'function') {
										const widgetFn = module.default as WidgetFactory;
										const widgetName = widgetFn.Name || folder.name;
										widgetFn.Name = widgetName;
										widgetFn.__widgetType = 'marketplace';

										this.widgets.set(widgetName, widgetFn);
										logger.info(`✅ Loaded marketplace widget: ${widgetName}`);
									}
								} catch (err) {
									logger.warn(`Failed to load marketplace widget ${folder.name}:`, err);
								}
							}
						}
					} catch (e) {
						if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
							logger.trace('[WidgetRegistry] Marketplace directory does not exist yet (this is normal)');
						} else {
							logger.warn('[WidgetRegistry] Error scanning marketplace directory:', e);
						}
					}
				} catch (err) {
					logger.warn('[WidgetRegistry] Failed to import fs/path for marketplace scanning (likely client-side environment)', err);
				}

				this.isInitialized = true;
				const duration = (performance.now() - startTime).toFixed(2);
				logger.info(` 705 WidgetRegistryService initialized with ${this.widgets.size} widgets in ${duration}ms.`);
			} catch (error) {
				logger.error('Failed to initialize WidgetRegistryService', error);
				throw error;
			}
		})();

		return this.initializationPromise;
	}

	public getWidget(name: string): WidgetFactory | undefined {
		return this.widgets.get(name);
	}

	public getAllWidgets(): Map<string, WidgetFactory> {
		if (!this.isInitialized) {
			logger.warn(' 6a0  getAllWidgets() called before initialization! Returning empty map.');
		}
		return this.widgets;
	}
	private _processWidgetModule(
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

			const dependencies = originalFn.__dependencies || [];

			const inputComponentPath = originalFn.__inputComponentPath || '';
			const displayComponentPath = originalFn.__displayComponentPath || '';

			const widgetFn: WidgetFactory = Object.assign((config: Record<string, unknown>) => originalFn(config as any), {
				Name: widgetName,
				GuiSchema: originalFn.GuiSchema,
				GraphqlSchema: originalFn.GraphqlSchema,
				Icon: originalFn.Icon,
				Description: originalFn.Description,
				aggregations: originalFn.aggregations,
				__widgetType: type,
				__dependencies: dependencies,
				__inputComponentPath: inputComponentPath,
				__displayComponentPath: displayComponentPath,
				componentPath: inputComponentPath
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
