/**
 * @file src/services/widgetDiscovery.ts
 * @description Widget Discovery Service
 *
 * Responsibilities:
 * 1. Scan filesystem for available widgets
 * 2. Compare with database state
 * 3. Auto-register new widgets
 * 4. Mark missing widgets as unavailable
 * 5. Provide widget status to Widget Store
 */

import { logger } from '@utils/logger.server';
import type { WidgetModule } from '@widgets/types';

export interface DiscoveredWidget {
	name: string;
	type: 'core' | 'custom';
	path: string;
	isAvailable: boolean; // Exists in filesystem
	isRegistered: boolean; // Exists in database
	isActive: boolean; // Enabled by tenant/admin
	metadata: {
		Name: string;
		Icon?: string;
		Description?: string;
		dependencies?: string[];
	};
}

export interface WidgetDiscoveryResult {
	available: DiscoveredWidget[]; // In filesystem
	registered: DiscoveredWidget[]; // In database
	new: DiscoveredWidget[]; // In filesystem but not database
	missing: DiscoveredWidget[]; // In database but not filesystem
	active: DiscoveredWidget[]; // Active widgets
}

export interface WidgetModel {
	create: (data: Record<string, unknown>) => Promise<unknown>;
}

export class WidgetDiscoveryService {
	private static instance: WidgetDiscoveryService;

	private constructor() {}

	static getInstance(): WidgetDiscoveryService {
		if (!WidgetDiscoveryService.instance) {
			WidgetDiscoveryService.instance = new WidgetDiscoveryService();
		}
		return WidgetDiscoveryService.instance;
	}

	/**
	 * Discover all widgets from filesystem and compare with database
	 */
	async discoverWidgets(dbWidgets: Array<{ name: string; isActive: boolean }> = []): Promise<WidgetDiscoveryResult> {
		const startTime = performance.now();
		logger.debug('🔍 Starting widget discovery...');

		// Step 1: Scan filesystem for widgets
		const filesystemWidgets = await this.scanFilesystem();
		const coreCount = filesystemWidgets.filter((w) => w.type === 'core').length;
		const customCount = filesystemWidgets.filter((w) => w.type === 'custom').length;
		logger.debug(`📂 Scanning filesystem: ${coreCount} core, ${customCount} custom widgets`);

		// Step 2: Build maps for comparison
		const fsMap = new Map(filesystemWidgets.map((w) => [w.name, w]));
		const dbMap = new Map(dbWidgets.map((w) => [w.name, w]));

		// Step 3: Categorize widgets
		const available: DiscoveredWidget[] = [];
		const registered: DiscoveredWidget[] = [];
		const newWidgets: DiscoveredWidget[] = [];
		const missing: DiscoveredWidget[] = [];
		const active: DiscoveredWidget[] = [];

		// Process filesystem widgets
		for (const widget of filesystemWidgets) {
			const dbWidget = dbMap.get(widget.name);

			if (dbWidget) {
				// Widget exists in both filesystem and database
				const discoveredWidget: DiscoveredWidget = {
					...widget,
					isRegistered: true,
					isActive: dbWidget.isActive
				};
				registered.push(discoveredWidget);
				if (dbWidget.isActive) {
					active.push(discoveredWidget);
				}
			} else {
				// Widget exists in filesystem but not database (NEW)
				const discoveredWidget: DiscoveredWidget = {
					...widget,
					isRegistered: false,
					isActive: widget.type === 'core' // Core widgets active by default
				};
				newWidgets.push(discoveredWidget);
				if (discoveredWidget.isActive) {
					active.push(discoveredWidget);
				}
			}

			available.push(widget);
		}

		// Find widgets in database but not in filesystem (MISSING)
		for (const [name, dbWidget] of dbMap.entries()) {
			if (!fsMap.has(name)) {
				missing.push({
					name,
					type: 'custom', // Assume custom if not found
					path: '',
					isAvailable: false,
					isRegistered: true,
					isActive: dbWidget.isActive,
					metadata: { Name: name }
				});
			}
		}

		const duration = (performance.now() - startTime).toFixed(2);

		// Concise summary log
		const summary = [
			`${available.length} available`,
			registered.length > 0 ? `${registered.length} registered` : null,
			newWidgets.length > 0 ? `${newWidgets.length} new` : null,
			missing.length > 0 ? `${missing.length} missing` : null,
			`${active.length} active`
		]
			.filter(Boolean)
			.join(', ');

		logger.info(`✅ Widget discovery completed in ${duration}ms: ${summary}`);

		// Only log details if there are new widgets (first run)
		if (newWidgets.length > 0) {
			logger.debug(`🆕 New widgets: ${newWidgets.map((w) => w.name).join(', ')}`);
		}
		if (missing.length > 0) {
			logger.warn(`⚠️  Missing widgets: ${missing.map((w) => w.name).join(', ')}`);
		}

		return {
			available,
			registered,
			new: newWidgets,
			missing,
			active
		};
	}

	/**
	 * Scan filesystem for widget modules
	 */
	private async scanFilesystem(): Promise<DiscoveredWidget[]> {
		const discovered: DiscoveredWidget[] = [];

		try {
			// Scan core widgets
			const coreModules = import.meta.glob<WidgetModule>('/src/widgets/core/*/index.ts', { eager: true });
			for (const [path, module] of Object.entries(coreModules)) {
				const widget = this.processModule(path, module, 'core');
				if (widget) discovered.push(widget);
			}

			// Scan custom widgets
			const customModules = import.meta.glob<WidgetModule>('/src/widgets/custom/*/index.ts', { eager: true });
			for (const [path, module] of Object.entries(customModules)) {
				const widget = this.processModule(path, module, 'custom');
				if (widget) discovered.push(widget);
			}
		} catch (error) {
			logger.error('Failed to scan filesystem for widgets:', error);
			throw error;
		}

		return discovered;
	}

	/**
	 * Process a widget module into DiscoveredWidget
	 */
	private processModule(path: string, module: WidgetModule, type: 'core' | 'custom'): DiscoveredWidget | null {
		try {
			const name = path.split('/').at(-2);
			if (!name || typeof module.default !== 'function') {
				return null;
			}

			const widgetFn = module.default;
			// Use folder name as-is for widget identifier (lowercase like 'seo')
			// Display name comes from widget.Name property

			return {
				name: name, // Use folder name as-is (e.g., 'seo', 'richText', 'mediaUpload')
				type,
				path,
				isAvailable: true,
				isRegistered: false, // Will be determined during comparison
				isActive: type === 'core', // Core widgets active by default
				metadata: {
					Name: widgetFn.Name || name, // Display name from widget or fallback to folder name
					Icon: widgetFn.Icon,
					Description: widgetFn.Description,
					dependencies: widgetFn.__dependencies || []
				}
			};
		} catch (error) {
			logger.error(`Failed to process widget module ${path}:`, error);
			return null;
		}
	}

	// Auto-register new widgets in database
	async autoRegisterNewWidgets(newWidgets: DiscoveredWidget[], widgetModel: WidgetModel): Promise<void> {
		if (newWidgets.length === 0) return;

		logger.info(`📝 Auto-registering ${newWidgets.length} new widgets...`);

		for (const widget of newWidgets) {
			try {
				await widgetModel.create({
					name: widget.name,
					displayName: widget.metadata.Name,
					description: widget.metadata.Description || '',
					icon: widget.metadata.Icon || 'mdi:puzzle',
					isCore: widget.type === 'core',
					isActive: widget.isActive,
					dependencies: widget.metadata.dependencies || [],
					version: '1.0.0',
					author: 'SveltyCMS'
				});

				logger.info(`✅ Auto-registered widget: ${widget.name}`);
			} catch (error) {
				logger.error(`Failed to auto-register widget ${widget.name}:`, error);
			}
		}
	}
}

// Export singleton instance
export const widgetDiscovery = WidgetDiscoveryService.getInstance();
