/**
 * @file src/stores/widget-store.svelte.ts
 * @description Centralized widget state management using Svelte 5 runes.
 *
 * This store handles:
 * - Scanning and loading both core and custom widgets.
 * - Initializing widgets with tenant-specific and database-driven status.
 * - Providing a unified registry for widget functions.
 * - Tracking active widgets and their dependencies.
 */

import type { FieldInstance } from '@src/content/types';
import type { DatabaseAdapter } from '@src/databases/db-interface';
import { coreModules, customModules } from '@src/widgets/scanner';
import type { WidgetDefinition, WidgetFactory } from '@src/widgets/types';
import { logger } from '@utils/logger';

export type WidgetStatus = 'active' | 'inactive';

/**
 * Registry for all available widget functions
 */
export type WidgetRegistry = Record<string, WidgetFactory | WidgetDefinition>;

class WidgetState {
	widgets = $state<Record<string, FieldInstance>>({});
	widgetFunctions = $state<WidgetRegistry>({});
	coreWidgets = $state<string[]>([]);
	customWidgets = $state<string[]>([]);
	marketplaceWidgets = $state<string[]>([]);
	activeWidgets = $state<string[]>([]);
	dependencyMap = $state<Record<string, string[]>>({});

	tenantId = $state<string>('default');
	isLoaded = $state(false);
	loading = $state(false);
	healthStatus = $state<'healthy' | 'unhealthy' | 'initializing'>('initializing');
	lastHealthCheck = $state<number | undefined>(undefined);

	async initialize(tenantId = 'default', dbAdapter?: DatabaseAdapter | null) {
		if (this.loading) {
			logger.debug('[WidgetStore] Initialization already in progress, skipping.');
			return;
		}
		if (this.isLoaded && this.tenantId === tenantId && !dbAdapter) {
			logger.debug('[WidgetStore] Widgets already loaded, skipping initialization.');
			return;
		}

		this.loading = true;
		this.tenantId = tenantId;
		logger.info(`[WidgetStore] Initializing for tenant: ${tenantId}`);

		try {
			// 1. Load modules from scanner
			const newWidgetFunctions: WidgetRegistry = {};
			const newCoreWidgets: string[] = [];
			const newCustomWidgets: string[] = [];
			const newDependencyMap: Record<string, string[]> = {};

			logger.info(`[WidgetStore] Core modules found: ${Object.keys(coreModules).length}`);
			logger.info(`[WidgetStore] Custom modules found: ${Object.keys(customModules).length}`);

			// Process core widgets
			for (const [path, module] of Object.entries(coreModules)) {
				const name = path.split('/').at(-2);
				if (!name) {
					continue;
				}

				try {
					const fn = (module as { default: WidgetFactory }).default;
					if (typeof fn !== 'function') {
						continue;
					}

					const widgetName = fn.Name || name;
					fn.Name = widgetName;
					fn.__widgetType = 'core';

					newWidgetFunctions[widgetName] = fn;
					newCoreWidgets.push(widgetName);

					const deps = (fn as any).__dependencies;
					if (deps && Array.isArray(deps) && deps.length > 0) {
						newDependencyMap[widgetName] = deps;
					}

					if (name && name !== widgetName) {
						newWidgetFunctions[name] = fn;
					}
				} catch (err) {
					logger.error(`[WidgetStore] Failed to load core widget at ${path}:`, err);
				}
			}

			// Process custom widgets
			for (const [path, module] of Object.entries(customModules)) {
				const name = path.split('/').at(-2);
				if (!name) {
					continue;
				}

				try {
					const fn = (module as { default: WidgetFactory }).default;
					if (typeof fn !== 'function') {
						continue;
					}

					const widgetName = fn.Name || name;
					fn.Name = widgetName;
					fn.__widgetType = 'custom';

					newWidgetFunctions[widgetName] = fn;
					newCustomWidgets.push(widgetName);

					const deps = (fn as any).__dependencies;
					if (deps && Array.isArray(deps) && deps.length > 0) {
						newDependencyMap[widgetName] = deps;
					}

					if (name && name !== widgetName) {
						newWidgetFunctions[name] = fn;
					}
				} catch (err) {
					logger.error(`[WidgetStore] Failed to load custom widget at ${path}:`, err);
				}
			}

			this.widgetFunctions = newWidgetFunctions;
			this.coreWidgets = newCoreWidgets;
			this.customWidgets = newCustomWidgets;
			this.dependencyMap = newDependencyMap;

			// 2. Load active status from DB if available
			let activeWidgetNames: string[] = [];
			if (dbAdapter) {
				const activeRes = await dbAdapter.system.widgets.getActiveWidgets();
				if (activeRes.success) {
					activeWidgetNames = (activeRes.data ?? []).map((w) => w.name);
				}
			} else if (typeof window !== 'undefined') {
				// Fallback to API if adapter not passed (client-side)
				const res = await fetch(`/api/widgets/active${this.isLoaded ? '' : '?refresh=true'}`, {
					headers: { 'X-Tenant-ID': tenantId }
				});
				if (res.ok) {
					const data = await res.json();
					activeWidgetNames = (data.widgets || []).map((w: { name: string }) => w.name);
				}
			}

			// Normalize and merge core
			const normalizedActive = activeWidgetNames
				.map((name) => {
					if (this.widgetFunctions[name]) {
						return name;
					}
					const camelCase = name.charAt(0).toLowerCase() + name.slice(1);
					if (this.widgetFunctions[camelCase]) {
						return camelCase;
					}
					const lowerCase = name.toLowerCase();
					if (this.widgetFunctions[lowerCase]) {
						return lowerCase;
					}
					return null;
				})
				.filter((name): name is string => name !== null);

			// IMPORTANT: Core widgets are ALWAYS active and cannot be deactivated
			// Merge core widgets with active widgets from database
			const allActiveWidgets = [...new Set([...normalizedActive, ...newCoreWidgets])];

			this.activeWidgets = allActiveWidgets;

			// Create instances
			const newWidgets: Record<string, FieldInstance> = {};
			for (const [name, fn] of Object.entries(this.widgetFunctions)) {
				// Cast to any first to bypass complex union mismatch if necessary, or better, to its known factory signature
				newWidgets[name] = (fn as any)({ label: name });
			}
			this.widgets = newWidgets;

			this.isLoaded = true;
			this.loading = false;
			this.healthStatus = 'healthy';
			this.lastHealthCheck = Date.now();

			logger.info(`[WidgetStore] Initialized: ${this.coreWidgets.length} core, ${this.customWidgets.length} custom widgets.`);
		} catch (e) {
			this.loading = false;
			this.healthStatus = 'unhealthy';
			logger.error('[WidgetStore] Initialization failed:', e);
		}
	}

	async updateStatus(name: string, status: WidgetStatus, tenantId?: string) {
		const targetTenant = tenantId || this.tenantId;
		const active = status === 'active';

		if (active && isWidgetCore(name)) {
			return; // Core always active
		}

		if (!(active || canDisableWidget(name))) {
			throw new Error(`Cannot disable widget ${name}: other widgets depend on it`);
		}

		if (active) {
			const deps = getWidgetDependencies(name);
			const inactiveDeps = deps.filter((dep) => !isWidgetActive(dep));
			if (inactiveDeps.length > 0) {
				throw new Error(`Cannot activate widget ${name}: missing dependencies: ${inactiveDeps.join(', ')}`);
			}
		}

		// Update DB
		try {
			await this.updateInDatabase(name, active, targetTenant);

			// Update state
			if (active) {
				if (!this.activeWidgets.includes(name)) {
					this.activeWidgets.push(name);
				}
			} else {
				this.activeWidgets = this.activeWidgets.filter((w) => w !== name);
			}

			logger.info(`[WidgetStore] Widget '${name}' status changed to '${status}'`);
		} catch (e) {
			logger.error(`[WidgetStore] Failed to update status for ${name}:`, e);
			throw e;
		}
	}

	async updateConfig(name: string, config: Record<string, unknown>) {
		const currentFn = this.widgetFunctions[name];
		if (!currentFn || typeof currentFn !== 'function') {
			return;
		}

		const updatedFn = Object.assign((cfg: Record<string, unknown>) => (currentFn as any)({ ...config, ...cfg }), currentFn);

		this.widgetFunctions[name] = updatedFn;
		this.widgets[name] = (updatedFn as any)({ label: name });
	}

	async reload(tenantId?: string) {
		this.isLoaded = false;
		await this.initialize(tenantId || this.tenantId);
	}

	private async updateInDatabase(name: string, active: boolean, tenantId: string) {
		if (typeof window !== 'undefined') {
			const res = await fetch('/api/widgets/status', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Tenant-ID': tenantId
				},
				body: JSON.stringify({ widgetName: name, isActive: active })
			});
			if (!res.ok) {
				throw new Error('Database sync failed');
			}
		}
	}
}

const widgetStateInstance = new WidgetState();

/**
 * Single export for both store state and widget factory functions.
 * Enables widgets.Date(), widgets.Group(), etc. in collection schemas while keeping store methods.
 */
export const widgets = new Proxy(widgetStateInstance, {
	get(target, prop: string) {
		const own = (target as unknown as Record<string, unknown>)[prop];
		if (own !== undefined) return own;
		return target.widgetFunctions[prop];
	}
}) as WidgetState & Record<string, WidgetFactory>;

// --- Helper Functions ---

export function getWidget(name: string) {
	return widgetStateInstance.widgets[name];
}

export function getWidgetFunction(name: string) {
	return widgetStateInstance.widgetFunctions[name];
}

export function isWidgetActive(name: string): boolean {
	return widgets.activeWidgets.includes(name);
}

export function isWidgetCore(name: string): boolean {
	return widgets.coreWidgets.includes(name);
}

export function isWidgetCustom(name: string): boolean {
	return widgets.customWidgets.includes(name);
}

export function isWidgetMarketplace(name: string): boolean {
	return widgets.marketplaceWidgets.includes(name);
}

export function getWidgetDependencies(name: string): string[] {
	return widgetStateInstance.dependencyMap[name] || [];
}

export function canDisableWidget(name: string): boolean {
	if (isWidgetCore(name)) {
		return false;
	}
	const dependents = Object.entries(widgetStateInstance.dependencyMap)
		.filter(([, deps]) => deps.includes(name))
		.map(([n]) => n);
	return !dependents.some(isWidgetActive);
}

export function isWidgetAvailable(name: string): boolean {
	return !!getWidgetFunction(name) && isWidgetActive(name);
}

// Compatibility export for theme branch components
export const widgetStoreActions = {
	updateStatus: widgetStateInstance.updateStatus.bind(widgetStateInstance),
	updateConfig: widgetStateInstance.updateConfig.bind(widgetStateInstance),
	reload: widgetStateInstance.reload.bind(widgetStateInstance),
	initializeWidgets: widgetStateInstance.initialize.bind(widgetStateInstance)
};

// Compatibility store for legacy components
export const widgetFunctions = {
	subscribe(fn: (value: WidgetRegistry) => void) {
		fn(widgetStateInstance.widgetFunctions);
		return () => {}; // Non-reactive for now, sufficient for initial load or use $effect if needed
	}
};

// HMR
if (import.meta.hot) {
	import.meta.hot.accept(() => {
		widgetStateInstance.reload();
	});
}
