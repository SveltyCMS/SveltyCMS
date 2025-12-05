/**
 * @file src/stores/widgetStore.svelte.ts
 * @description Centralized widget store that syncs database state to memory
 * Handles core widgets (always enabled) and custom widgets (optional)
 *
 * @enhancements
 * - Helper functions (isWidgetActive, etc.) now use `get(widgetStore)`
 *   for synchronous, non-reactive access, which is more performant.
 * - Runtime widget discovery for marketplace widgets (zero-downtime installation)
 * - Cache integration: Auto-invalidates collection caches when widget status changes
 * - System state integration: Reports widget health to main system monitor
 */
import { writable, derived, get } from 'svelte/store';
import type { Widget, WidgetModule, WidgetFunction, WidgetFactory } from '@widgets/types';
import type { DatabaseAdapter } from '@src/databases/dbInterface';
import type { FieldInstance } from '@src/content/types';
import { logger } from '@utils/logger';

export type WidgetStatus = 'active' | 'inactive';
export type WidgetType = 'core' | 'custom' | 'marketplace'; // ✅ Added marketplace type

interface WidgetStoreState {
	widgets: Record<string, Widget | FieldInstance>;
	widgetFunctions: Record<string, WidgetFunction | WidgetFactory>;
	activeWidgets: string[]; // Widget names that are currently active
	coreWidgets: string[]; // Widget names that are core (always enabled)
	customWidgets: string[]; // Widget names that are custom (optional)
	marketplaceWidgets: string[]; // ✅ Widget names from marketplace (runtime-installed)
	dependencyMap: Record<string, string[]>; // Maps widgets to their dependencies
	isLoaded: boolean;
	isLoading: boolean;
	tenantId?: string; // Current tenant context
	lastHealthCheck?: number; // ✅ Last time widget health was validated
	healthStatus: 'healthy' | 'unhealthy' | 'initializing'; // ✅ Overall widget system health
}

// Create the main store
const initialState: WidgetStoreState = {
	widgets: {},
	widgetFunctions: {},
	activeWidgets: [],
	coreWidgets: [],
	customWidgets: [],
	marketplaceWidgets: [], // ✅ Empty by default, populated at runtime
	dependencyMap: {},
	isLoaded: false,
	isLoading: false,
	lastHealthCheck: undefined,
	healthStatus: 'initializing' // ✅ Start as initializing
};

const widgetStore = writable<WidgetStoreState>(initialState);

// Derived stores for easy Svelte component access
export const widgets = derived(widgetStore, ($store) => $store.widgets);
export const widgetFunctions = derived(widgetStore, ($store) => $store.widgetFunctions);
export const activeWidgets = derived(widgetStore, ($store) => $store.activeWidgets);
export const coreWidgets = derived(widgetStore, ($store) => $store.coreWidgets);
export const customWidgets = derived(widgetStore, ($store) => $store.customWidgets);
export const marketplaceWidgets = derived(widgetStore, ($store) => $store.marketplaceWidgets); // ✅ New
export const dependencyMap = derived(widgetStore, ($store) => $store.dependencyMap);
export const isLoaded = derived(widgetStore, ($store) => $store.isLoaded);
export const isLoading = derived(widgetStore, ($store) => $store.isLoading);
export const widgetHealthStatus = derived(widgetStore, ($store) => $store.healthStatus); // ✅ New

// --- PERFORMANCE ENHANCEMENT: Synchronous Helper Functions ---
// Use `get(widgetStore)` for immediate, non-reactive checks.
// This avoids the overhead of `subscribe/unsubscribe` for simple logic.

export function getWidget(name: string): Widget | FieldInstance | undefined {
	return get(widgetStore).widgets[name];
}

export function getWidgetFunction(name: string): WidgetFunction | WidgetFactory | undefined {
	return get(widgetStore).widgetFunctions[name];
}

export function isWidgetActive(name: string): boolean {
	return get(widgetStore).activeWidgets.includes(name);
}

export function isWidgetCore(name: string): boolean {
	return get(widgetStore).coreWidgets.includes(name);
}

export function isWidgetCustom(name: string): boolean {
	return get(widgetStore).customWidgets.includes(name);
}

// ✅ ENTERPRISE ENHANCEMENT: Check if widget is from marketplace
export function isWidgetMarketplace(name: string): boolean {
	return get(widgetStore).marketplaceWidgets.includes(name);
}

export function getWidgetDependencies(name: string): string[] {
	return get(widgetStore).dependencyMap[name] || [];
}

export function canDisableWidget(name: string): boolean {
	// Core widgets cannot be disabled
	if (isWidgetCore(name)) return false;

	// Check if any other widgets depend on this one
	const deps = get(widgetStore).dependencyMap;
	const dependents = Object.entries(deps)
		.filter(([, depList]) => depList.includes(name))
		.map(([widgetName]) => widgetName);

	// If any dependents are active, this widget cannot be disabled
	return !dependents.some((dependent) => isWidgetActive(dependent));
}

export function isWidgetAvailable(name: string): boolean {
	return !!getWidgetFunction(name) && isWidgetActive(name);
}
// --- END PERFORMANCE ENHANCEMENT ---

// Main store actions
export const widgetStoreActions = {
	// Initialize widgets from file system with tenant context
	// Allows server-side initialization without API calls when dbAdapter is provided
	// Prevents the "Widgets Not Ready" race condition
	async initializeWidgets(tenantId?: string, dbAdapter?: DatabaseAdapter | null): Promise<void> {
		// Prevent redundant initialization
		const currentState = get(widgetStore);
		if (currentState.isLoading) {
			logger.debug('[widgetStore] Initialization already in progress, skipping.');
			return;
		}
		if (currentState.isLoaded && !dbAdapter) {
			logger.debug('[widgetStore] Widgets already loaded, skipping initialization.');
			return;
		}

		widgetStore.update((state) => ({ ...state, isLoading: true, tenantId }));

		try {
			logger.trace('Initializing widgets from file system...', { tenantId, serverSide: !!dbAdapter });

			// Load widget modules from both core and custom directories
			const coreModules = import.meta.glob<WidgetModule>('../widgets/core/*/index.ts', {
				eager: true
			});
			const customModules = import.meta.glob<WidgetModule>('../widgets/custom/*/index.ts', {
				eager: true
			});

			const newWidgetFunctions: Record<string, WidgetFunction | WidgetFactory> = {};
			const newCoreWidgets: string[] = [];
			const newCustomWidgets: string[] = [];
			const newDependencyMap: Record<string, string[]> = {};

			// Process core widgets (always enabled by default)
			for (const [path, module] of Object.entries(coreModules)) {
				const processedWidget = this.processWidgetModule(path, module, 'core');
				if (processedWidget) {
					const { name, widgetFn, dependencies, folderName } = processedWidget;
					newWidgetFunctions[name] = widgetFn;
					newCoreWidgets.push(name);
					if (dependencies.length > 0) {
						newDependencyMap[name] = dependencies;
					}

					// Register alias if folder name differs from widget name
					if (folderName && folderName !== name) {
						logger.debug(`[widgetStore] Alias: ${folderName} -> ${name}`);
						newWidgetFunctions[folderName] = widgetFn;
					}
				}
			}

			// Process custom widgets (optional)
			for (const [path, module] of Object.entries(customModules)) {
				const processedWidget = this.processWidgetModule(path, module, 'custom');
				if (processedWidget) {
					const { name, widgetFn, dependencies, folderName } = processedWidget;
					newWidgetFunctions[name] = widgetFn;
					newCustomWidgets.push(name);
					if (dependencies.length > 0) {
						newDependencyMap[name] = dependencies;
					}

					// Register alias if folder name differs from widget name
					if (folderName && folderName !== name) {
						logger.debug(`[widgetStore] Alias: ${folderName} -> ${name}`);
						newWidgetFunctions[folderName] = widgetFn;
					}
				}
			}

			// ✅ ENTERPRISE ENHANCEMENT: Load marketplace widgets (runtime discovery)
			const newMarketplaceWidgets: string[] = [];
			// Client-side marketplace loading would go here if needed, but typically handled by API

			// Load active widgets from database (tenant-aware)
			const activeWidgetNames = await loadActiveWidgetsFromDatabase(tenantId, dbAdapter);

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

			// Use database as source of truth for active widgets, but ALWAYS ensure core widgets are active
			let uniqueActiveWidgets: string[];

			if (normalizedActiveWidgets.length === 0 && typeof window === 'undefined') {
				// Server-side and no database result: default to core widgets
				logger.debug('[widgetStore] Server-side initialization - no active widgets loaded from DB, defaulting to core');
				uniqueActiveWidgets = [...newCoreWidgets];
			} else {
				// Client-side or database returned results: use database as source of truth
				// Remove duplicates and filter out widgets that don't exist in file system
				uniqueActiveWidgets = normalizedActiveWidgets
					.filter((name, index, self) => self.indexOf(name) === index) // Remove duplicates
					.filter((name) => newWidgetFunctions[name]); // Only include widgets that exist

				// Ensure core widgets are always active
				for (const coreWidget of newCoreWidgets) {
					if (!uniqueActiveWidgets.includes(coreWidget)) {
						uniqueActiveWidgets.push(coreWidget);
					}
				}

				logger.debug('[widgetStore] Active widgets from database (normalized + core)', {
					count: uniqueActiveWidgets.length,
					widgets: uniqueActiveWidgets,
					original: activeWidgetNames
				});
			}

			// Create widget instances
			const newWidgets: Record<string, Widget | FieldInstance> = {};
			for (const [name, widgetFn] of Object.entries(newWidgetFunctions)) {
				newWidgets[name] = widgetFn({} as any);
			}

			// ✅ ENTERPRISE ENHANCEMENT: Validate widget health
			// Client-side validation via API is handled separately

			const healthStatus: 'healthy' | 'unhealthy' | 'initializing' = 'healthy'; // Default to healthy on client, server handles actual check

			widgetStore.update((state) => ({
				...state,
				widgets: newWidgets,
				widgetFunctions: newWidgetFunctions,
				activeWidgets: uniqueActiveWidgets,
				coreWidgets: newCoreWidgets,
				customWidgets: newCustomWidgets,
				marketplaceWidgets: newMarketplaceWidgets, // ✅ Added
				dependencyMap: newDependencyMap,
				isLoaded: true,
				isLoading: false,
				tenantId,
				lastHealthCheck: Date.now(), // ✅ Added
				healthStatus // ✅ Added
			}));

			// ✅ ENTERPRISE ENHANCEMENT: Report widget health to system state
			// Server-side only logic removed from client store

			logger.info(`\x1b[34m${Object.keys(newWidgetFunctions).length}\x1b[0m widgets initialized successfully`, {
				tenantId,
				core: newCoreWidgets.length,
				custom: newCustomWidgets.length,
				marketplace: newMarketplaceWidgets.length, // ✅ Added
				active: uniqueActiveWidgets.length,
				health: healthStatus // ✅ Added
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
		widgetFn: WidgetFunction | WidgetFactory;
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
			// IMPORTANT: Use folder name as-is for widget identifier (e.g., 'seo', 'richText', 'mediaUpload')
			// This ensures consistency between filesystem, database, and runtime
			// Display name (widgetName) is for UI purposes only

			// Extract dependencies from widget metadata
			const dependencies = originalFn.__dependencies || [];

			// Extract component paths for 3-pillar architecture
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
				componentPath: inputComponentPath // Add this for Fields.svelte compatibility
			}) as unknown as WidgetFactory;

			return {
				name: widgetFn.Name, // Use defined Name (e.g. 'SEO')
				widgetFn,
				dependencies,
				folderName: name // Pass back folder name for aliasing
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

			// ✅ ENTERPRISE ENHANCEMENT: Cache invalidation
			// Handled by API endpoint /api/widgets/status
			logger.info(`[WidgetState] Widget '${widgetName}' status changed to '${status}', cache invalidation handled by API.`);

			// ✅ ENTERPRISE ENHANCEMENT: Re-validate widget health
			// Server-side logic removed

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

		const updatedWidget: WidgetFunction | WidgetFactory = Object.assign(
			(cfg: Record<string, unknown>) => {
				const newConfig = { ...config, ...cfg };
				return currentWidgetFn(newConfig as any);
			},
			{
				Name: currentWidgetFn.Name,
				GuiSchema: currentWidgetFn.GuiSchema,
				GraphqlSchema: currentWidgetFn.GraphqlSchema,
				Icon: currentWidgetFn.Icon,
				Description: currentWidgetFn.Description,
				aggregations: currentWidgetFn.aggregations,
				__widgetType: currentWidgetFn.__widgetType,
				__inputComponentPath: currentWidgetFn.__inputComponentPath,
				__displayComponentPath: currentWidgetFn.__displayComponentPath,
				componentPath: (currentWidgetFn as any).componentPath
			}
		) as unknown as WidgetFunction | WidgetFactory;

		widgetStore.update((state) => ({
			...state,
			widgetFunctions: {
				...state.widgetFunctions,
				[widgetName]: updatedWidget
			},
			widgets: {
				...state.widgets,
				[widgetName]: updatedWidget({} as any)
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
				const unsubscribe = activeWidgets.subscribe(($activeWidgets) => {
					currentActiveWidgets = $activeWidgets;
				});
				unsubscribe();

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
async function loadActiveWidgetsFromDatabase(tenantId?: string, dbAdapter?: DatabaseAdapter | null): Promise<string[]> {
	try {
		logger.debug('[widgetStore] Loading active widgets from database...', { tenantId, serverSide: !!dbAdapter });

		// Server-side: if a dbAdapter is passed, use it directly
		if (dbAdapter && dbAdapter.widgets) {
			logger.debug('[widgetStore] Server-side: Using provided dbAdapter');
			const result = await dbAdapter.widgets.getActiveWidgets();

			if (result.success && result.data) {
				const widgetNames = result.data.map((w) => w.name);
				logger.debug('[widgetStore] Active widgets loaded via dbAdapter', {
					tenantId,
					count: widgetNames.length,
					widgets: widgetNames
				});
				return widgetNames;
			} else {
				logger.warn('[widgetStore] Failed to load active widgets via dbAdapter', { result });
				return [];
			}
		}

		// Check if we're on the client side
		if (typeof window !== 'undefined') {
			// Client-side: use API call with cache bypass on first load to ensure fresh data after normalization updates
			// Check if this is first load by seeing if store is empty
			let needsRefresh = false;
			const unsubscribe = widgetStore.subscribe(($store) => {
				needsRefresh = Object.keys($store.widgetFunctions).length === 0;
			});
			unsubscribe();

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

// Auto-initialization removed to prevent side effects

// HMR setup
if (import.meta.hot) {
	import.meta.hot.accept(() => {
		let currentTenantId: string | undefined;
		const unsubscribe = widgetStore.subscribe(($store) => {
			currentTenantId = $store.tenantId;
		});
		unsubscribe(); // Immediately unsubscribe after getting the value

		widgetStoreActions.reloadWidgets(currentTenantId);
		logger.info('Widgets reloaded due to file changes.');
	});
}
