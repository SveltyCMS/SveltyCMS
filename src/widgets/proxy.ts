/**
 * @file src/widgets/proxy.ts
 * @description Improved widget proxy aligned with factory pattern
 *
 * Key improvements:
 * - Better type safety with WidgetFactory
 * - Proper error handling and logging
 * - Support for widget metadata
 * - Graceful fallback for missing widgets
 */

import { coreModules, customModules } from '@src/widgets/scanner';
import { logger } from '@utils/logger';
import type { WidgetFactory, WidgetModule, WidgetType } from '@widgets/types';

// ============================================================================
// Widget Processing
// ============================================================================

interface ProcessedWidget {
	factory: WidgetFactory;
	name: string;
	path: string;
	type: WidgetType;
}

/**
 * Process a widget module and extract its factory function
 */
function processWidgetModule(path: string, module: WidgetModule, type: WidgetType): ProcessedWidget | null {
	try {
		// Extract widget name from path (e.g., './core/input/index.ts' -> 'input')
		const pathParts = path.split('/');
		const name = pathParts.at(-2);

		if (!name) {
			logger.warn(`[Widget Proxy] Unable to extract widget name from path: ${path}`);
			return null;
		}

		// Validate module structure
		if (!module.default) {
			logger.warn(`[Widget Proxy] No default export in widget module: ${path}`);
			return null;
		}

		if (typeof module.default !== 'function') {
			logger.warn(`[Widget Proxy] Default export is not a function in: ${path}`);
			return null;
		}

		const factory = module.default as WidgetFactory;

		// Validate required factory properties
		if (!factory.Name) {
			logger.warn(`[Widget Proxy] Widget factory missing Name property: ${path}`);
			return null;
		}

		// Enhance factory with metadata
		factory.__widgetType = type;

		logger.trace(`[Widget Proxy] Successfully loaded widget: ${name} (${type})`);

		return {
			name: factory.Name,
			factory,
			type,
			path
		};
	} catch (error) {
		logger.error(`[Widget Proxy] Failed to process widget module ${path}:`, error);
		return null;
	}
}

// ============================================================================
// Widget Registry
// ============================================================================

class WidgetRegistryImpl {
	private readonly widgets = new Map<string, WidgetFactory>();
	private readonly metadata = new Map<string, { type: WidgetType; path: string }>();

	register(name: string, factory: WidgetFactory, type: WidgetType, path: string): void {
		this.widgets.set(name, factory);
		this.metadata.set(name, { type, path });
		logger.trace(`[Widget Registry] Registered widget: ${name}`);
	}

	get(name: string): WidgetFactory | undefined {
		return this.widgets.get(name);
	}

	has(name: string): boolean {
		return this.widgets.has(name);
	}

	list(): string[] {
		return Array.from(this.widgets.keys());
	}

	getByType(type: WidgetType): string[] {
		return Array.from(this.metadata.entries())
			.filter(([_, meta]) => meta.type === type)
			.map(([name]) => name);
	}

	getMetadata(name: string): { type: WidgetType; path: string } | undefined {
		return this.metadata.get(name);
	}
}

const registry = new WidgetRegistryImpl();

// ============================================================================
// Load Widgets
// ============================================================================

// Process core widgets
for (const [path, module] of Object.entries(coreModules)) {
	const processed = processWidgetModule(path, module, 'core');
	if (processed) {
		registry.register(processed.name, processed.factory, processed.type, processed.path);

		// Register aliases (folder name if different)
		const folderName = path.split('/').at(-2);
		if (folderName && folderName !== processed.name) {
			logger.trace(`[Widget Proxy] Alias: ${folderName} -> ${processed.name}`);
			registry.register(folderName, processed.factory, processed.type, processed.path);
		}
	}
}

// Process custom widgets
for (const [path, module] of Object.entries(customModules)) {
	const processed = processWidgetModule(path, module, 'custom');
	if (processed) {
		registry.register(processed.name, processed.factory, processed.type, processed.path);

		// Register aliases (folder name if different)
		const folderName = path.split('/').at(-2);
		if (folderName && folderName !== processed.name) {
			logger.debug(`[Widget Proxy] Alias: ${folderName} -> ${processed.name}`);
			registry.register(folderName, processed.factory, processed.type, processed.path);
		}
	}
}

// Log summary
const coreCount = registry.getByType('core').length;
const customCount = registry.getByType('custom').length;
logger.info(`[Widget Proxy] Loaded ${coreCount} core widgets and ${customCount} custom widgets`);

// ============================================================================
// Widget Proxy
// ============================================================================

/**
 * Create a fallback widget factory for missing widgets
 */
function createMissingWidgetFactory(name: string): WidgetFactory {
	const factory = ((config: Record<string, unknown>) => {
		logger.warn(`[Widget Proxy] Attempted to use missing widget: ${name}`);
		return {
			widget: {
				widgetId: 'missing',
				Name: 'MissingWidget',
				Description: `Widget "${name}" is missing or disabled`,
				validationSchema: () => true
			},
			label: (config.label as string) || 'Missing Widget',
			db_fieldName: (config.db_fieldName as string) || 'missing_field',
			required: false,
			translated: false,
			__isMissing: true,
			__missingWidgetName: name
		};
	}) as unknown as WidgetFactory;

	factory.Name = 'MissingWidget';
	factory.Icon = 'mdi:alert-circle';
	factory.Description = `Widget "${name}" is not available`;
	factory.__widgetType = 'custom';
	factory.toString = () => '';

	return factory;
}

/**
 * Proxy for accessing widgets with intelligent fallback
 */
export const widgetProxy = new Proxy(registry, {
	get(target, prop) {
		if (typeof prop !== 'string') {
			return undefined;
		}

		if (prop in target) {
			const member = target[prop as keyof WidgetRegistryImpl];
			if (typeof member === 'function') {
				return member.bind(target);
			}
		}

		// Handle widget access
		const factory = target.get(prop);

		if (factory) {
			return factory;
		}

		// Widget not found - provide helpful feedback
		logger.warn(`[Widget Proxy] Widget "${prop}" not found. Available widgets: ${target.list().join(', ')}`);

		// Return fallback factory in production, undefined in development
		if (process.env.NODE_ENV === 'production') {
			return createMissingWidgetFactory(prop);
		}

		return undefined;
	},

	has(target, prop) {
		if (typeof prop !== 'string') {
			return false;
		}
		return target.has(prop);
	},

	ownKeys(target) {
		return target.list();
	},

	getOwnPropertyDescriptor(target, prop) {
		if (typeof prop !== 'string') {
			return undefined;
		}

		if (target.has(prop)) {
			return {
				enumerable: true,
				configurable: true
			};
		}

		return undefined;
	}
});

// ============================================================================
// Type-safe exports
// ============================================================================

/**
 * Type-safe widget accessor with autocomplete
 */
export interface Widgets {
	[K: string]: WidgetFactory;
}

// Export with type information
export const widgets = widgetProxy as unknown as Widgets;

// Export registry for advanced use cases
export { registry as widgetRegistry };

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a widget is available
 */
export function isWidgetAvailable(name: string): boolean {
	return registry.has(name);
}

/**
 * Get list of all available widgets
 */
export function getAvailableWidgets(): string[] {
	return registry.list();
}

/**
 * Get widgets by type
 */
export function getWidgetsByType(type: WidgetType): string[] {
	return registry.getByType(type);
}

/**
 * Get widget metadata
 */
export function getWidgetMetadata(name: string): { type: WidgetType; path: string } | undefined {
	return registry.getMetadata(name);
}
