/* Moved from src/widgets/WidgetRegistryService.ts */
/**
 * @file src/services/WidgetRegistryService.ts
 * @description A server-side singleton service that discovers and holds all widget blueprints.
 */
import type { WidgetFactory, WidgetModule, WidgetType } from '@src/widgets/types';
import { logger } from '@utils/logger';

class WidgetRegistryService {
	private static instance: WidgetRegistryService;
	private widgets: Map<string, WidgetFactory> = new Map();
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
			// Already initialized - silently return (called multiple times during collection processing)
			return;
		}

		const startTime = performance.now();
		logger.info('Initializing WidgetRegistryService, scanning for widgets...');

		try {
			const coreModules = import.meta.glob<WidgetModule>('../widgets/core/*/index.ts', { eager: true });
			const customModules = import.meta.glob<WidgetModule>('../widgets/custom/*/index.ts', { eager: true });
			const allModules = { ...coreModules, ...customModules };

			for (const [path, module] of Object.entries(allModules)) {
				const pathParts = path.split('/');

				// Robust type detection based on path segments
				let type: WidgetType = 'custom';
				if (path.includes('/core/')) {
					type = 'core';
				} else if (path.includes('/custom/')) {
					type = 'custom';
				}

				const processed = this._processWidgetModule(path, module, type); // Call the private method
				if (processed) {
					const { name, widgetFn } = processed;
					this.widgets.set(name, widgetFn);
					logger.debug(`[WidgetRegistryService] Registered: ${name} (from ${path})`);

					// The alias logic (PascalCase to all-caps) should be handled within the _processWidgetModule itself
					// if that is desired. Here, we just store by the resolved name.
				}
			}

			// Process custom widgets
			for (const [path, module] of Object.entries(customModules)) {
				const processed = this._processWidgetModule(path, module, 'custom'); // Use this.processWidgetModule here
				if (processed) {
					const { name, widgetFn, folderName } = processed;
					this.widgets.set(name, widgetFn);
					logger.debug(`[WidgetRegistryService] Registered: ${name} (from ${path})`);

					// Register aliases (folder name if different)
					if (folderName && folderName !== name) {
						logger.debug(`[WidgetRegistryService] Alias: ${folderName} -> ${name}`);
						this.widgets.set(folderName, widgetFn);
					}
				}
			}
			logger.debug('[WidgetRegistryService] All registered widget names:', Array.from(this.widgets.keys()));

			// Scan marketplace widgets (runtime discovery)
			// ... (rest of the initialize method)

			// Scan marketplace widgets (runtime discovery)
			try {
				const fs = await import('fs/promises');
				const path = await import('path');
				const marketplaceDir = path.resolve(process.cwd(), 'src/widgets/marketplace');

				try {
					const widgetFolders = await fs.readdir(marketplaceDir, { withFileTypes: true });
					logger.debug(`[WidgetRegistry] Scanning marketplace directory: ${marketplaceDir}`);

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
									widgetFn.__widgetType = 'marketplace'; // Assuming 'marketplace' is a valid WidgetType or cast it

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
						logger.debug('[WidgetRegistry] Marketplace directory does not exist yet (this is normal)');
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
