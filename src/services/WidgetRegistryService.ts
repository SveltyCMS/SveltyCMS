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
			const coreModules = import.meta.glob<WidgetModule>('/src/widgets/core/*/index.ts', { eager: true });
			const customModules = import.meta.glob<WidgetModule>('/src/widgets/custom/*/index.ts', { eager: true });
			const allModules = { ...coreModules, ...customModules };

			for (const [path, module] of Object.entries(allModules)) {
				const pathParts = path.split('/');
				const folderName = pathParts.at(-2);

				// Robust type detection based on path segments
				let type: WidgetType = 'custom';
				if (path.includes('/core/')) {
					type = 'core';
				} else if (path.includes('/custom/')) {
					type = 'custom';
				}

				if (!folderName || typeof module.default !== 'function') {
					logger.warn(`Skipping invalid widget module at: ${path}`);
					continue;
				}

				const widgetFn = module.default as WidgetFactory;
				// Use the widget's Name property if available, otherwise use folder name
				const widgetName = widgetFn.Name || folderName;
				widgetFn.Name = widgetName;
				widgetFn.__widgetType = type;

				// Store by the widget's Name (should be PascalCase like "Input", "Text", etc.)
				this.widgets.set(widgetName, widgetFn);

				// Also store with a PascalCase normalized version if the name is all-caps (e.g., "SEO" -> "Seo")
				const normalizedName = widgetName.charAt(0).toUpperCase() + widgetName.slice(1).toLowerCase();
				if (normalizedName !== widgetName && widgetName === widgetName.toUpperCase()) {
					this.widgets.set(normalizedName, widgetFn);
					logger.trace(`Registered widget: ${widgetName} with alias ${normalizedName} (from ${path})`);
				} else {
					logger.trace(`Registered widget: ${widgetName} (from ${path})`);
				}
			}

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
}

export const widgetRegistryService = WidgetRegistryService.getInstance();
