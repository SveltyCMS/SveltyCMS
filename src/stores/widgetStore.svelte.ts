/**
 * @file src/stores/widgetStore.svelte.ts
 * @description Centralized widget store that syncs database state to memory
 * Handles core widgets (always enabled) and custom widgets (optional)
 *
 * ### Features:
 * Tenant-aware widget management
 * Dependency resolution between widgets
 * Runtime discovery of marketplace widgets
 * Performance-optimized synchronous accessors
 * System health integration
 * Cache invalidation on widget state changes
 * 3-pillar architecture support with component path metadata
 * TypeScript types for strong typing
 * Server-side initialization support to prevent "Widgets
 *
 */
import { writable, derived, get } from 'svelte/store';
import type { Widget, WidgetModule, WidgetFunction, WidgetType } from '@widgets/types';
import type { DatabaseAdapter } from '@src/databases/dbInterface';
import type { Schema } from '@src/content/types';
import { logger } from '@utils/logger';

// Server-only imports - lazy loaded to prevent client-side bundling
const getFs = async () => (await import('node:fs/promises')).default;
const getPath = async () => (await import('node:path')).default;
const getCacheService = async () => (await import('@src/databases/CacheService')).cacheService;

// System state integration
import { updateServiceHealth } from '@src/stores/system';

export type WidgetStatus = 'active' | 'inactive';

interface WidgetStoreState {
	widgets: Record<string, Widget>;
	widgetFunctions: Record<string, WidgetFunction>;
	activeWidgets: string[]; // Widget names that are currently active
	coreWidgets: string[]; // Widget names that are core (always enabled)
	customWidgets: string[]; // Widget names that are custom (optional)
	marketplaceWidgets: string[]; // Widget names from marketplace (runtime-installed)
	dependencyMap: Record<string, string[]>; // Maps widgets to their dependencies
	isLoaded: boolean;
	isLoading: boolean;
	tenantId?: string; // Current tenant context
	lastHealthCheck?: number; // Last time widget health was validated
	healthStatus: 'healthy' | 'unhealthy' | 'initializing'; // Overall widget system health
}

// Create the main store
const initialState: WidgetStoreState = {
	widgets: {},
	widgetFunctions: {},
	activeWidgets: [],
	coreWidgets: [],
	customWidgets: [],
	marketplaceWidgets: [],
	dependencyMap: {},
	isLoaded: false,
	isLoading: false,
	lastHealthCheck: undefined,
	healthStatus: 'initializing'
};

const widgetStore = writable<WidgetStoreState>(initialState);

// Derived stores for easy access
export const widgets = derived(widgetStore, ($store) => $store.widgets);
export const widgetFunctions = derived(widgetStore, ($store) => $store.widgetFunctions);
export const activeWidgets = derived(widgetStore, ($store) => $store.activeWidgets);
export const coreWidgets = derived(widgetStore, ($store) => $store.coreWidgets);
export const customWidgets = derived(widgetStore, ($store) => $store.customWidgets);
export const marketplaceWidgets = derived(widgetStore, ($store) => $store.marketplaceWidgets);
export const dependencyMap = derived(widgetStore, ($store) => $store.dependencyMap);
export const isLoaded = derived(widgetStore, ($store) => $store.isLoaded);
export const isLoading = derived(widgetStore, ($store) => $store.isLoading);
export const widgetHealthStatus = derived(widgetStore, ($store) => $store.healthStatus);

// --- PERFORMANCE ENHANCEMENT: Synchronous Helper Functions ---
// Use `get(widgetStore)` for immediate, non-reactive checks.
// This avoids the overhead of `subscribe/unsubscribe` for simple logic.

export function getWidget(name: string): Widget | undefined {
	return get(widgetStore).widgets[name];
}

export function getWidgetFunction(name: string): WidgetFunction | undefined {
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

// Check if widget is from marketplace
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

// Main store actions
export const widgetStoreActions = {
	// Initialize widgets from file system with tenant context
	// Allows server-side initialization without API calls when dbAdapter is provided
	// Prevents the "Widgets Not Ready" race condition
	async initializeWidgets(tenantId?: string, dbAdapter?: DatabaseAdapter | null): Promise<void> {
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

			//  Load marketplace widgets (runtime discovery)
			const newMarketplaceWidgets: string[] = [];
			if (typeof window === 'undefined') {
				// Server-side only: Use Node.js fs API to discover runtime-installed widgets
				const fs = await getFs();
				const path = await getPath();
				const marketplaceDir = path.resolve(process.cwd(), 'src/widgets/marketplace');
				try {
					const widgetFolders = await fs.readdir(marketplaceDir, { withFileTypes: true });
					logger.debug(`[widgetStore] Scanning marketplace directory: ${marketplaceDir}`);

					for (const folder of widgetFolders) {
						if (folder.isDirectory()) {
							const indexPath = path.join(marketplaceDir, folder.name, 'index.ts');
							try {
								// Dynamically import the runtime-discovered widget
								// @vite-ignore tells Vite to skip this dynamic import at build time
								const module = (await import(/* @vite-ignore */ indexPath)) as WidgetModule;
								const processedWidget = this.processWidgetModule(indexPath, module, 'marketplace');

								if (processedWidget) {
									const { name, widgetFn, dependencies } = processedWidget;
									newWidgetFunctions[name] = widgetFn;
									newMarketplaceWidgets.push(name);
									if (dependencies.length > 0) {
										newDependencyMap[name] = dependencies;
									}
									logger.info(`✅ Loaded marketplace widget: ${name}`);
								}
							} catch (err) {
								logger.warn(`Failed to load marketplace widget ${folder.name}:`, err);
							}
						}
					}

					if (newMarketplaceWidgets.length > 0) {
						logger.info(`📦 Discovered ${newMarketplaceWidgets.length} marketplace widgets: ${newMarketplaceWidgets.join(', ')}`);
					}
				} catch (e) {
					if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
						logger.debug('[widgetStore] Marketplace directory does not exist yet (this is normal)');
					} else {
						logger.warn('[widgetStore] Error scanning marketplace directory:', e);
					}
				}
			}

			// Create widget instances
			const newWidgets: Record<string, Widget> = {};
			for (const [name, widgetFn] of Object.entries(newWidgetFunctions)) {
				newWidgets[name] = widgetFn({});
			}

			// Health validation skipped in widgetStore - done server-side via API
			// This prevents importing server-only modules (ContentManager, dbAdapter) into client code
			const healthStatus: 'healthy' | 'unhealthy' | 'initializing' = 'initializing';

			widgetStore.update((state) => ({
				...state,
				widgets: newWidgets,
				widgetFunctions: newWidgetFunctions,
				activeWidgets: uniqueActiveWidgets,
				coreWidgets: newCoreWidgets,
				customWidgets: newCustomWidgets,
				marketplaceWidgets: newMarketplaceWidgets,
				dependencyMap: newDependencyMap,
				isLoaded: true,
				isLoading: false,
				tenantId,
				lastHealthCheck: Date.now(),
				healthStatus: healthStatus
			}));

			//  Report widget health to system state
			if (typeof window === 'undefined') {
				// Server-side only
				if (healthStatus === 'unhealthy') {
					const missingWidgets = validation.invalid.map((v) => v.collectionName).join(', ');
					updateServiceHealth('widgets', 'unhealthy', `Missing required widgets for collections: ${missingWidgets}`);
					logger.warn(`⚠️ Widget health check FAILED: ${validation.invalid.length} collections have missing widgets`);
				} else {
					updateServiceHealth('widgets', 'healthy', 'All required widgets available');
					logger.info('✅ Widget health check passed');
				}
			}

			logger.info(`${Object.keys(newWidgetFunctions).length} widgets initialized successfully`, {
				// tenantId,
				// core: newCoreWidgets.length,
				// custom: newCustomWidgets.length,
				// marketplace: newMarketplaceWidgets.length,
				// active: uniqueActiveWidgets.length,
				// health: healthStatus
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
			const dependencies = originalFn.__dependencies || [];

			// Extract component paths for 3-pillar architecture
			const inputComponentPath = originalFn.__inputComponentPath || '';
			const displayComponentPath = originalFn.__displayComponentPath || '';

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

			// Cache invalidation
			// Widget state changed, so ALL collection-related caches are now invalid
			logger.info(`[WidgetState] Widget '${widgetName}' status changed to '${status}', clearing collection caches.`);

			try {
				// Clear collection-related caches
				const cacheService = await getCacheService();
				await cacheService.clearByPattern('query:collections:*');
				await cacheService.clearByPattern('static:page:*'); // Page layouts depend on collections
				await cacheService.clearByPattern('api:widgets:*'); // Active/required widgets API cache
				await cacheService.clearByPattern('api:*:/api/admin/users*'); // Admin UI may show widget data
				logger.debug('[WidgetState] Cache invalidation complete');
			} catch (cacheError) {
				logger.warn('[WidgetState] Cache clearing failed (non-critical):', cacheError);
			}

			// Health validation skipped - done server-side via API to avoid importing server-only modules
			// Widget status change is saved to database, health check happens on next API call

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
			(cfg: Record<string, unknown>) => {
				const newConfig = { ...config, ...cfg };
				return currentWidgetFn(newConfig);
			},
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

// Initialize widgets on module load
if (typeof window !== 'undefined') {
	// Only auto-initialize in browser environment
	// Use setTimeout to avoid blocking initial render
	setTimeout(() => {
		widgetStoreActions.initializeWidgets().catch((error) => {
			logger.error('Failed to initialize widgets on module load:', error);
		});
	}, 0);
}

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
