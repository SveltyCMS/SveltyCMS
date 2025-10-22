/**
 * @file src/stores/widgetStore.svelte.ts
 * @description Centralized widget store that syncs database state to memory
 * Handles core widgets (always enabled) and custom widgets (optional)
 */
import { writable, derived } from 'svelte/store';
import type { Widget, WidgetModule, WidgetFunction } from '@widgets/types';
import { logger } from '@utils/logger.svelte';

export type WidgetStatus = 'active' | 'inactive';
export type WidgetType = 'core' | 'custom';

interface WidgetStoreState {
	widgets: Record<string, Widget>;
	widgetFunctions: Record<string, WidgetFunction>;
	activeWidgets: string[]; // Widget names that are currently active
	coreWidgets: string[]; // Widget names that are core (always enabled)
	customWidgets: string[]; // Widget names that are custom (optional)
	dependencyMap: Record<string, string[]>; // Maps widgets to their dependencies
	isLoaded: boolean;
	isLoading: boolean;
	tenantId?: string; // Current tenant context
}

// Create the main store
const initialState: WidgetStoreState = {
	widgets: {},
	widgetFunctions: {},
	activeWidgets: [],
	coreWidgets: [],
	customWidgets: [],
	dependencyMap: {},
	isLoaded: false,
	isLoading: false
};

const widgetStore = writable<WidgetStoreState>(initialState);

// Derived stores for easy access
export const widgets = derived(widgetStore, ($store) => $store.widgets);
export const widgetFunctions = derived(widgetStore, ($store) => $store.widgetFunctions);
export const activeWidgets = derived(widgetStore, ($store) => $store.activeWidgets);
export const coreWidgets = derived(widgetStore, ($store) => $store.coreWidgets);
export const customWidgets = derived(widgetStore, ($store) => $store.customWidgets);
export const dependencyMap = derived(widgetStore, ($store) => $store.dependencyMap);
export const isLoaded = derived(widgetStore, ($store) => $store.isLoaded);
export const isLoading = derived(widgetStore, ($store) => $store.isLoading);

// Helper functions
export function getWidget(name: string): Widget | undefined {
	let widget: Widget | undefined;
	widgets.subscribe(($widgets) => {
		widget = $widgets[name];
	})();
	return widget;
}

export function getWidgetFunction(name: string): WidgetFunction | undefined {
	let widgetFn: WidgetFunction | undefined;
	widgetFunctions.subscribe(($widgetFunctions) => {
		widgetFn = $widgetFunctions[name];
	})();
	return widgetFn;
}

export function isWidgetActive(name: string): boolean {
	let active = false;
	activeWidgets.subscribe(($activeWidgets) => {
		active = $activeWidgets.includes(name);
	})();
	return active;
}

export function isWidgetCore(name: string): boolean {
	let isCore = false;
	coreWidgets.subscribe(($coreWidgets) => {
		isCore = $coreWidgets.includes(name);
	})();
	return isCore;
}

export function isWidgetCustom(name: string): boolean {
	let isCustom = false;
	customWidgets.subscribe(($customWidgets) => {
		isCustom = $customWidgets.includes(name);
	})();
	return isCustom;
}

export function getWidgetDependencies(name: string): string[] {
	let deps: string[] = [];
	dependencyMap.subscribe(($dependencyMap) => {
		deps = $dependencyMap[name] || [];
	})();
	return deps;
}

export function canDisableWidget(name: string): boolean {
	// Core widgets cannot be disabled
	if (isWidgetCore(name)) return false;

	// Check if any other widgets depend on this one
	let dependents: string[] = [];
	dependencyMap.subscribe(($dependencyMap) => {
		dependents = Object.entries($dependencyMap)
			.filter(([, deps]) => deps.includes(name))
			.map(([widgetName]) => widgetName);
	})();

	// If any dependents are active, this widget cannot be disabled
	return !dependents.some((dependent) => isWidgetActive(dependent));
}

export function isWidgetAvailable(name: string): boolean {
	return !!getWidgetFunction(name) && isWidgetActive(name);
}

// Main store actions
export const widgetStoreActions = {
	// Initialize widgets from file system with tenant context
	async initializeWidgets(tenantId?: string): Promise<void> {
		widgetStore.update((state) => ({ ...state, isLoading: true, tenantId }));

		try {
			logger.trace('Initializing widgets from file system...', { tenantId });

			// Load widget modules from both core and custom directories
			const coreModules = import.meta.glob<WidgetModule>('../widgets/core/*/index.ts', {
				eager: true
			});
			const customModules = import.meta.glob<WidgetModule>('../widgets/custom/*/index.ts', {
				eager: true
			});

			const newWidgetFunctions: Record<string, WidgetFunction> = {};
			const newCoreWidgets: string[] = [];
			const newCustomWidgets: string[] = [];
			const newDependencyMap: Record<string, string[]> = {};

			// Process core widgets (always enabled by default)
			for (const [path, module] of Object.entries(coreModules)) {
				const processedWidget = this.processWidgetModule(path, module, 'core');
				if (processedWidget) {
					const { name, widgetFn, dependencies } = processedWidget;
					newWidgetFunctions[name] = widgetFn;
					newCoreWidgets.push(name);
					if (dependencies.length > 0) {
						newDependencyMap[name] = dependencies;
					}
				}
			}

			// Process custom widgets (optional)
			for (const [path, module] of Object.entries(customModules)) {
				const processedWidget = this.processWidgetModule(path, module, 'custom');
				if (processedWidget) {
					const { name, widgetFn, dependencies } = processedWidget;
					newWidgetFunctions[name] = widgetFn;
					newCustomWidgets.push(name);
					if (dependencies.length > 0) {
						newDependencyMap[name] = dependencies;
					}
				}
			}

			// Load active widgets from database (tenant-aware)
			const activeWidgetNames = await loadActiveWidgetsFromDatabase(tenantId);

			// Normalize widget names from database to match file system (folder names are lowercase/camelCase)
			// Database might have "Input" but folder is "input", "RemoteVideo" → "remoteVideo"
			const normalizedActiveWidgets = activeWidgetNames.map((name) => {
				// Try exact match first
				if (newWidgetFunctions[name]) {
					return name;
				}
				// Try camelCase (Input → input, RemoteVideo → remoteVideo)
				const camelCase = name.charAt(0).toLowerCase() + name.slice(1);
				if (newWidgetFunctions[camelCase]) {
					return camelCase;
				}
				// Try full lowercase as fallback
				const lowerCase = name.toLowerCase();
				if (newWidgetFunctions[lowerCase]) {
					return lowerCase;
				}
				// Return original if no match found (will be filtered out below)
				logger.warn(`[widgetStore] Widget from database not found in file system: ${name}`);
				return name;
			});

			// Use database as source of truth for active widgets
			// If database query failed or returned empty (server-side), don't default to core-only
			let uniqueActiveWidgets: string[];
			if (normalizedActiveWidgets.length === 0 && typeof window === 'undefined') {
				// Server-side and no database result: use empty array (will be populated client-side)
				logger.debug('[widgetStore] Server-side initialization - no active widgets loaded yet');
				uniqueActiveWidgets = [];
			} else {
				// Client-side or database returned results: use database as source of truth
				// Remove duplicates and filter out widgets that don't exist in file system
				uniqueActiveWidgets = normalizedActiveWidgets
					.filter((name, index, self) => self.indexOf(name) === index) // Remove duplicates
					.filter((name) => newWidgetFunctions[name]); // Only include widgets that exist
				logger.debug('[widgetStore] Active widgets from database (normalized)', {
					count: uniqueActiveWidgets.length,
					widgets: uniqueActiveWidgets,
					original: activeWidgetNames
				});
			}

			// Create widget instances
			const newWidgets: Record<string, Widget> = {};
			for (const [name, widgetFn] of Object.entries(newWidgetFunctions)) {
				newWidgets[name] = widgetFn({});
			}

			widgetStore.update((state) => ({
				...state,
				widgets: newWidgets,
				widgetFunctions: newWidgetFunctions,
				activeWidgets: uniqueActiveWidgets,
				coreWidgets: newCoreWidgets,
				customWidgets: newCustomWidgets,
				dependencyMap: newDependencyMap,
				isLoaded: true,
				isLoading: false,
				tenantId
			}));

			logger.info(`\x1b[34m${Object.keys(newWidgetFunctions).length}\x1b[0m widgets initialized successfully`, {
				tenantId,
				core: newCoreWidgets.length,
				custom: newCustomWidgets.length,
				active: uniqueActiveWidgets.length
			});
		} catch (error) {
			logger.error('Failed to initialize widgets:', error);
			widgetStore.update((state) => ({ ...state, isLoading: false }));
			throw error;
		}
	},

	// Helper method to process widget modules
	processWidgetModule(
		path: string,
		module: WidgetModule,
		type: WidgetType
	): {
		name: string;
		widgetFn: WidgetFunction;
		dependencies: string[];
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
			// IMPORTANT: Use folder name as-is for widget identifier (e.g., 'seo', 'richText', 'mediaUpload')
			// This ensures consistency between filesystem, database, and runtime
			// Display name (widgetName) is for UI purposes only

			// Extract dependencies from widget metadata
			const dependencies = originalFn.dependencies || [];

			// Extract component paths for 3-pillar architecture
			const inputComponentPath = originalFn.inputComponentPath || originalFn.__inputComponentPath || '';
			const displayComponentPath = originalFn.displayComponentPath || originalFn.__displayComponentPath || '';

			const widgetFn: WidgetFunction = Object.assign((config: Record<string, unknown>) => originalFn(config), {
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
				componentPath: inputComponentPath // Add this for Fields.svelte compatibility
			});

			return {
				name: name, // Use folder name as-is (e.g., 'seo', not 'Seo')
				widgetFn,
				dependencies
			};
		} catch (error) {
			logger.error(`Failed to process widget module ${path}:`, error);
			return null;
		}
	},

	// Update widget status (active/inactive) with dependency checking
	async updateWidgetStatus(widgetName: string, status: WidgetStatus, tenantId?: string): Promise<void> {
		// Prevent disabling core widgets
		if (status === 'inactive' && isWidgetCore(widgetName)) {
			throw new Error(`Cannot disable core widget: ${widgetName}`);
		}

		// Check if widget can be disabled (no active dependents)
		if (status === 'inactive' && !canDisableWidget(widgetName)) {
			throw new Error(`Cannot disable widget ${widgetName}: other widgets depend on it`);
		}

		// Check dependencies when activating a widget
		if (status === 'active') {
			const dependencies = getWidgetDependencies(widgetName);
			const inactiveDeps = dependencies.filter((dep) => !isWidgetActive(dep));
			if (inactiveDeps.length > 0) {
				throw new Error(`Cannot activate widget ${widgetName}: missing dependencies: ${inactiveDeps.join(', ')}`);
			}
		}

		try {
			// Update database first
			await updateWidgetStatusInDatabase(widgetName, status === 'active', tenantId);

			// Update store
			widgetStore.update((state) => {
				const newActiveWidgets = [...state.activeWidgets];
				const isCurrentlyActive = newActiveWidgets.includes(widgetName);

				if (status === 'active' && !isCurrentlyActive) {
					newActiveWidgets.push(widgetName);
				} else if (status === 'inactive' && isCurrentlyActive) {
					const index = newActiveWidgets.indexOf(widgetName);
					newActiveWidgets.splice(index, 1);
				}

				return {
					...state,
					activeWidgets: newActiveWidgets
				};
			});

			logger.info(`Widget ${widgetName} ${status} status updated successfully`, { tenantId });
		} catch (error) {
			logger.error(`Error updating widget status:`, error);
			throw error;
		}
	},

	// Update widget configuration
	async updateWidgetConfig(widgetName: string, config: Record<string, unknown>): Promise<void> {
		const currentWidgetFn = getWidgetFunction(widgetName);
		if (!currentWidgetFn) return;

		const updatedWidget: WidgetFunction = Object.assign(
			(cfg: Record<string, unknown>) => ({
				...currentWidgetFn(cfg),
				config: { ...currentWidgetFn(cfg).config, ...config }
			}),
			{
				Name: currentWidgetFn.Name,
				GuiSchema: currentWidgetFn.GuiSchema,
				GraphqlSchema: currentWidgetFn.GraphqlSchema,
				Icon: currentWidgetFn.Icon,
				Description: currentWidgetFn.Description,
				aggregations: currentWidgetFn.aggregations,
				__widgetType: currentWidgetFn.__widgetType,
				__dependencies: currentWidgetFn.__dependencies
			}
		);

		widgetStore.update((state) => ({
			...state,
			widgetFunctions: {
				...state.widgetFunctions,
				[widgetName]: updatedWidget
			},
			widgets: {
				...state.widgets,
				[widgetName]: updatedWidget({})
			}
		}));
	},

	// Reload widgets (for HMR)
	async reloadWidgets(tenantId?: string): Promise<void> {
		widgetStore.set(initialState);
		await this.initializeWidgets(tenantId);
	},

	// Bulk activate widgets with dependency resolution
	async bulkActivateWidgets(widgetNames: string[], tenantId?: string): Promise<void> {
		const toActivate: string[] = [];
		const errors: string[] = [];

		// Build activation list with dependencies
		for (const widgetName of widgetNames) {
			if (isWidgetActive(widgetName)) continue;

			const dependencies = getWidgetDependencies(widgetName);
			for (const dep of dependencies) {
				if (!isWidgetActive(dep) && !toActivate.includes(dep)) {
					toActivate.push(dep);
				}
			}

			if (!toActivate.includes(widgetName)) {
				toActivate.push(widgetName);
			}
		}

		// Activate widgets
		for (const widgetName of toActivate) {
			try {
				await this.updateWidgetStatus(widgetName, 'active', tenantId);
			} catch (error) {
				errors.push(`${widgetName}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		if (errors.length > 0) {
			throw new Error(`Failed to activate some widgets: ${errors.join('; ')}`);
		}
	},

	// Get widgets required by collections
	async getRequiredWidgetsByCollections(tenantId?: string): Promise<string[]> {
		try {
			// Check if we're on the client side
			if (typeof window !== 'undefined') {
				// Client-side: use API call
				const response = await fetch('/api/widgets/required', {
					method: 'GET',
					headers: {
						'Content-Type': 'application/json',
						...(tenantId && { 'X-Tenant-ID': tenantId })
					}
				});

				if (response.ok) {
					const data = await response.json();
					return data.requiredWidgets || [];
				} else {
					logger.warn('Failed to fetch required widgets from API');
					return [];
				}
			} else {
				// Server-side: return empty for now
				logger.trace('Server-side collection analysis - returning empty array');
				return [];
			}
		} catch (error) {
			logger.error('Failed to analyze collection widget dependencies:', error);
			return [];
		}
	},

	// Validate collections against current widget state
	async validateCollectionsAgainstWidgets(tenantId?: string): Promise<{
		valid: number;
		invalid: number;
		warnings: string[];
	}> {
		try {
			// Check if we're on the client side
			if (typeof window !== 'undefined') {
				// Get current active widgets
				let currentActiveWidgets: string[] = [];
				activeWidgets.subscribe(($activeWidgets) => {
					currentActiveWidgets = $activeWidgets;
				})();

				// Client-side: use API call with active widgets as query param
				const activeWidgetsParam = currentActiveWidgets.join(',');
				const url = `/api/widgets/validate?activeWidgets=${encodeURIComponent(activeWidgetsParam)}`;

				const response = await fetch(url, {
					method: 'GET',
					headers: {
						'Content-Type': 'application/json',
						...(tenantId && { 'X-Tenant-ID': tenantId })
					}
				});

				if (response.ok) {
					const data = await response.json();
					return {
						valid: data.valid || 0,
						invalid: data.invalid || 0,
						warnings: data.warnings || []
					};
				} else {
					return { valid: 0, invalid: 0, warnings: ['API call failed'] };
				}
			} else {
				// Server-side: return empty validation
				return { valid: 0, invalid: 0, warnings: [] };
			}
		} catch (error) {
			logger.error('Failed to validate collections against widgets:', error);
			return { valid: 0, invalid: 0, warnings: ['Validation failed'] };
		}
	}
};

// Database functions with tenant support - use API calls on client side
async function loadActiveWidgetsFromDatabase(tenantId?: string): Promise<string[]> {
	try {
		logger.debug('[widgetStore] Loading active widgets from database...', { tenantId });

		// Check if we're on the client side
		if (typeof window !== 'undefined') {
			// Client-side: use API call with cache bypass on first load to ensure fresh data after normalization updates
			// Check if this is first load by seeing if store is empty
			let needsRefresh = false;
			widgetStore.subscribe(($store) => {
				needsRefresh = Object.keys($store.widgetFunctions).length === 0;
			})();

			const url = `/api/widgets/active${needsRefresh ? '?refresh=true' : ''}`;
			logger.debug(`[widgetStore] Client-side: Fetching from ${url}`, { tenantId, needsRefresh });

			const response = await fetch(url, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
					...(tenantId && { 'X-Tenant-ID': tenantId })
				}
			});

			if (response.ok) {
				const data = await response.json();
				const widgetNames = (data.widgets || []).map((w: { name: string }) => w.name);

				logger.debug('[widgetStore] Active widgets received from API', {
					tenantId,
					count: widgetNames.length,
					widgets: widgetNames
				});

				return widgetNames;
			} else {
				logger.warn('[widgetStore] Failed to fetch active widgets from API', {
					status: response.status,
					statusText: response.statusText
				});
				return [];
			}
		} else {
			// Server-side: return empty for now, will be loaded by server initialization
			logger.debug('[widgetStore] Server-side widget loading - returning empty array');
			return [];
		}
	} catch (error) {
		logger.error('[widgetStore] Failed to load active widgets from database:', error);
		return []; // Return empty array on error, don't fail initialization
	}
}

async function updateWidgetStatusInDatabase(widgetName: string, isActive: boolean, tenantId?: string): Promise<void> {
	try {
		logger.trace(`Updating ${widgetName} to ${isActive ? 'active' : 'inactive'} in database`, { tenantId });

		// Check if we're on the client side
		if (typeof window !== 'undefined') {
			// Client-side: use API call
			const response = await fetch('/api/widgets/status', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(tenantId && { 'X-Tenant-ID': tenantId })
				},
				body: JSON.stringify({
					widgetName,
					isActive
				})
			});

			if (!response.ok) {
				throw new Error(`Failed to update widget status: ${response.statusText}`);
			}
		} else {
			// Server-side: we'll need a different approach for server initialization
			logger.debug('Server-side widget status update - skipping for now');
		}
	} catch (error) {
		logger.error(`Failed to update widget status in database:`, error);
		throw error;
	}
}

// Initialize widgets on module load
if (typeof window !== 'undefined') {
	// Only auto-initialize in browser environment
	widgetStoreActions.initializeWidgets().catch((error) => {
		logger.error('Failed to initialize widgets on module load:', error);
	});
}

// HMR setup
if (import.meta.hot) {
	import.meta.hot.accept(() => {
		let currentTenantId: string | undefined;
		widgetStore.subscribe(($store) => {
			currentTenantId = $store.tenantId;
		})();

		widgetStoreActions.reloadWidgets(currentTenantId);
		logger.info('Widgets reloaded due to file changes.');
	});
}
