<!--
@file src/components/collection-display/entry-list.svelte
@description
High-performance data table for managing collection entries.
This component provides a robust interface for content orchestration, including search,
bulk actions, and predictive preloading.

@component
**EntryList component to display collections data in a tabular format.**

### Features:
- **Search & Filter**: Server-side search plus schema-aware `createSmartFilter` (text/select/date/number/boolean).
- **Status facets**: Server `getStatusFacets` chips for quick status filtering.
- **Saved views**: Named filter/sort/layout presets via Smart Table views menu.
- **Column resize**: Drag headers; widths persist per collection `layoutKey`.
- **List metrics**: `?debug=table` shows p50/p95/hit% from SSR `listMetrics`.
- **Pagination**: Configurable rows per page and page navigation.
- **Selection**: Multi-select entries for bulk actions.
- **Sorting**: Clickable headers for server-side sorting.
- **Preloading**: Hover-based predictive data preloading for faster navigation.
- **Smart Actions**: Integrated with `EntryList_MultiButton` for context-aware operations.

### Props
- `entries` (Array): The raw collection entry data from the server.
- `pagination` (Object): Pagination metadata (currentPage, pageSize, totalItems, pagesCount).
- `contentLanguage` (String): The language for displaying translatable field data.
- `breadcrumb` (Array, optional): Breadcrumb navigation paths.
- `collectionStats` (Object, optional): Stats like count and last modified.
- `statusFacets` (Record, optional): Status counts for facet chips.
- `listMetrics` (Object, optional): SSR list-query metrics for `?debug=table`.

### Keyboard Shortcuts
- `Alt + N`: Create new entry
- `Alt + P`: Publish selected
- `Alt + U`: Unpublish selected
- `Alt + D`: Move selected to Draft
- `Alt + Del`: Delete selected

### features:
- search and filter orchestration
- batch processing automation
- predictive data preloading
- drag-and-drop column management
- multi-tenant aware selection
- responsive layout for all screen sizes
-->

<script module lang="ts">
	import Button from '@components/ui/button.svelte';
	export type SortOrder = 0 | 1 | -1; // Strict type for sort order
</script>

<script lang="ts">
	// Components
	import SystemTooltip from '@components/system/system-tooltip.svelte';
	import Status from '@components/system/table/status.svelte';
	import TableFilter from '@components/system/table/table-filter.svelte';
	import TableIcons from '@components/system/table/table-icons.svelte';
	import PluginComponent from '@src/components/plugins/plugin-component.svelte';
	// Types
	// =================================================================
	// 1. RECEIVE DATA AS PROPS (From +page.server.ts)
	// =================================================================
	import type { EntryListProps, PaginationSettings, TableHeader, CollectionEntry } from '@src/content/types';
	import { StatusTypes } from '@src/content/types';
	// ParaglideJS
	import { EntryList_no_collection, entrylist_all, entrylist_dnd } from '@src/paraglide/messages';
	// Stores
	import {
		collection,
		collectionValue,
		mode,
		setCollectionValue,
		setModifyEntry,
		type statusMap
	} from '@src/stores/collection-store.svelte.ts';
	import { modeTransitionGuard } from '@src/stores/mode-transition-guard.svelte';
	// Config
	import { publicEnv } from '@src/stores/global-settings.svelte';
	import { screen } from '@src/stores/screen-size-store.svelte.ts';
	import { app } from '@src/stores/store.svelte';
	import { ui } from '@src/stores/ui-store.svelte.ts';
	import Sanitize from '@src/utils/sanitize.svelte';
	// Utils
	import { batchDeleteEntries, deleteEntry, invalidateCollectionCache, updateEntryStatus } from '@utils/api';
	import { formatDisplayDate } from '@utils/date';
	import { cloneEntries, setEntriesStatus } from '@utils/entry-actions';
	// Using iconify-icon web component
	import { logger } from '@utils/logger';
	// Native UI Components
	import { showDeleteConfirm, showStatusChangeConfirm } from '@utils/modal.svelte';
	import { preloadEntry, reflectModeInURL } from '@utils/navigation';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { getFieldName, meta_data } from '@utils/utils';
	import { untrack } from 'svelte';
	import { flip } from 'svelte/animate';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	// Svelte-dnd-action
	// @ts-ignore - IDE module resolution issue
	import { dndzone } from 'svelte-dnd-action';
	import Checkbox from '@components/ui/checkbox.svelte';
	import { browser } from '$app/environment';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import {
		createSmartTable,
		pinCellClass,
		SMART_TABLE,
		SMART_TABLE_SCROLL,
		SMART_TABLE_THEAD
	} from '@components/ui/smart-table';
	import SmartTableShell from '@components/ui/smart-table/smart-table-shell.svelte';
	import SmartTableSavedViewsMenu from '@components/ui/smart-table/smart-table-saved-views-menu.svelte';
	import SmartTableStatusFacets from '@components/ui/smart-table/smart-table-status-facets.svelte';
	import SmartTableMetricsBadge from '@components/ui/smart-table/smart-table-metrics-badge.svelte';
	import ColumnResizeHandle from '@components/ui/smart-table/column-resize-handle.svelte';
	import type { SmartTableSavedView } from '@utils/smart-table-saved-views';
	import EntryListMultiButton from './entry-list-multi-button.svelte';
	import TranslationStatus from './translation-status.svelte';
	import EntryListCell from './entry-list-cell.svelte';
	import { createSmartFilter } from './create-smart-filter.svelte';
	import SmartFilterRow from './smart-filter-row.svelte';

	// =================================================================
	// 1. RECEIVE DATA AS PROPS (From +page.server.ts)
	// =================================================================
	const {
		entries: serverEntries = [],
		pagination: serverPagination = { currentPage: 1, pageSize: 10, totalItems: 0, pagesCount: 1 },
		contentLanguage: propContentLanguage,
		breadcrumb = [],
		collectionStats = null,
		statusFacets = {},
		listMetrics = null
	}: EntryListProps & {
		breadcrumb?: Array<{ name: string; path: string }>;
		collectionStats?: { _id: string; name: string; count: number; lastModified: string } | null;
		statusFacets?: Record<string, number>;
		listMetrics?: {
			count: number;
			hitRate: number;
			p50Ms: number;
			p95Ms: number;
			avgMs: number;
		} | null;
	} = $props();

	// =================================================================
	// 2. USE SERVER DATA (Simple $derived - No Client-Side State)
	// =================================================================
	const tableData = $derived(serverEntries);
	const pagesCount = $derived(serverPagination.pagesCount);
	const totalItems = $derived(serverPagination.totalItems);

	// =================================================================
	// 3. URL-BASED NAVIGATION (Replaces All Client-Side Fetching)
	// =================================================================
	function updateURL(updates: Record<string, string | number | null>) {
		const newUrl = new URL(page.url);
		Object.entries(updates).forEach(([key, value]) => {
			if (value === null || value === '') {
				newUrl.searchParams.delete(key);
			} else {
				newUrl.searchParams.set(key, String(value));
			}
		});
		goto(newUrl, { keepFocus: true, noScroll: true });
	}

	// Unified Smart Table (server mode) — selection, virtualization, density, sort/page callbacks
	// layoutKey is per-collection (EntryList remounts via {#key collectionSchema?._id})
	const smartTable = createSmartTable<CollectionEntry>({
		mode: 'server',
		layoutKey: collection.value?._id ? `entry-list:${collection.value._id}` : 'entry-list',
		onQueryChange: (updates) => updateURL(updates),
		getRowId: (row) => String(row._id ?? '')
	});

	// Keep controller in sync with SSR props
	$effect(() => {
		smartTable.setRows(tableData as CollectionEntry[]);
		smartTable.setPaginationMeta({
			currentPage: serverPagination.currentPage,
			pageSize: serverPagination.pageSize,
			totalItems: serverPagination.totalItems,
			pagesCount: serverPagination.pagesCount
		});
	});

	function onUpdatePage(newPage: number) {
		entryListPaginationSettings.currentPage = newPage;
		smartTable.setPage(newPage);
	}

	function onUpdateRowsPerPage(rows: number) {
		entryListPaginationSettings.rowsPerPage = rows;
		entryListPaginationSettings.currentPage = 1;
		smartTable.setPageSize(rows);
	}

	function onSortChange(fieldName: string) {
		smartTable.setSort(fieldName);
		entryListPaginationSettings.sorting = {
			sortedBy: smartTable.sort.sortedBy,
			isSorted: smartTable.sort.isSorted as SortOrder
		};
	}

	let filterTimeoutId: ReturnType<typeof setTimeout>;
	const filterDebounce = (fn: () => void) => {
		clearTimeout(filterTimeoutId);
		filterTimeoutId = setTimeout(fn, 500);
	};
	let searchTimeoutId: ReturnType<typeof setTimeout>;
	const searchDebounce = (fn: () => void) => {
		clearTimeout(searchTimeoutId);
		searchTimeoutId = setTimeout(fn, 400);
	};

	// Schema-aware filter controller (platform pure defs + URL; server enforces FLAC)
	const smartFilter = createSmartFilter(() => collection.value);

	// Virtual scroll shell (math owned by smartTable)
	let scrollContainerEl = $state<HTMLDivElement | null>(null);
	const useRowVirtualization = $derived(smartTable.virtual.enabled);
	const visibleRows = $derived(smartTable.virtual.visibleRows);
	const spacerTop = $derived(smartTable.virtual.spacerTop);
	const spacerBottom = $derived(smartTable.virtual.spacerBottom);
	const virtualStartIndex = $derived(smartTable.virtual.startIndex);

	function onVirtualScroll() {
		if (scrollContainerEl) {
			smartTable.virtual.onScroll(scrollContainerEl.scrollTop, scrollContainerEl.clientHeight || 600);
		}
	}

	/** Push smart-filter state into pagination settings (localStorage) + URL. */
	function commitFiltersToURL(resetPage = true) {
		const plain = smartFilter.toPlainObject();
		entryListPaginationSettings.filters = { ...plain };

		const filterUpdates: Record<string, string | null> = {
			...smartFilter.toURLParams()
		};
		if (resetPage) {
			filterUpdates.page = '1';
		}
		updateURL(filterUpdates);
	}

	function onFilterChange(filterName: string, value: string) {
		filterDebounce(() => {
			smartFilter.setFilter(filterName, value);
			commitFiltersToURL(true);
		});
	}

	function onClearFilter(filterId: string) {
		smartFilter.clearFilter(filterId);
		commitFiltersToURL(true);
	}

	function onClearAllFilters() {
		smartFilter.clearAll();
		commitFiltersToURL(true);
	}

	const viewsScope = $derived(
		collection.value?._id ? `entry-list:${collection.value._id}` : 'entry-list:unknown'
	);

	const activeStatusFacet = $derived(smartFilter.filters['status'] ?? '');

	function onStatusFacetSelect(status: string) {
		if (!status) {
			smartFilter.clearFilter('status');
		} else {
			smartFilter.setFilter('status', status);
		}
		// Open filter row so status control is visible
		filterShow = true;
		commitFiltersToURL(true);
	}

	function getSavedViewSnapshot() {
		return {
			filters: smartFilter.toFilterQuery() as Record<string, string>,
			search: globalSearchValue,
			sort: {
				sortedBy: smartTable.sort.sortedBy,
				isSorted: smartTable.sort.isSorted
			},
			pageSize: smartTable.pagination.pageSize || serverPagination.pageSize,
			layout: {
				density: entryListPaginationSettings.density,
				columnOrder: displayTableHeaders.map((h) => h.name || ''),
				visibility: Object.fromEntries(displayTableHeaders.map((h) => [h.name || '', !!h.visible])),
				columnWidths: { ...smartTable.columnWidths }
			}
		};
	}

	function applySavedView(view: SmartTableSavedView) {
		// Filters
		smartFilter.clearAll();
		const filters = view.filters || {};
		for (const [k, v] of Object.entries(filters)) {
			if (typeof v === 'string') {
				smartFilter.setFilter(k, v);
			} else if (v && typeof v === 'object' && 'contains' in v) {
				smartFilter.setFilter(k, String((v as { contains: string }).contains));
			} else if (v && typeof v === 'object' && 'eq' in v) {
				smartFilter.setFilter(k, String((v as { eq: unknown }).eq));
			}
		}
		// Search
		globalSearchValue = view.search || '';
		// Sort / page size → URL
		const sortField = view.sort?.sortedBy || null;
		let order: 'asc' | 'desc' | null = null;
		if (view.sort?.isSorted === 1) order = 'asc';
		else if (view.sort?.isSorted === -1) order = 'desc';
		if (view.layout?.density) {
			entryListPaginationSettings.density = view.layout.density;
			smartTable.setDensity(view.layout.density);
		}
		// Column visibility
		if (view.layout?.visibility && displayTableHeaders.length) {
			displayTableHeaders = displayTableHeaders.map((h) => ({
				...h,
				visible: view.layout!.visibility![h.name || ''] ?? h.visible
			}));
		}
		// Widths
		if (view.layout?.columnWidths) {
			for (const [k, w] of Object.entries(view.layout.columnWidths)) {
				smartTable.setColumnWidth(k, w);
			}
		}
		filterShow = smartFilter.activeCount > 0;
		updateURL({
			...smartFilter.toURLParams(),
			search: globalSearchValue || null,
			sort: sortField,
			order,
			page: '1',
			pageSize: view.pageSize ?? null
		});
	}

	async function onActionSuccess() {
		smartTable.clearSelection();
		await invalidateAll();
	}

	// =================================================================
	// 4. SELECTION (via unified Smart Table — id-based, virtualization-safe)
	// =================================================================

	const SelectAll = {
		get value() {
			return smartTable.allSelected;
		},
		set value(v: boolean) {
			smartTable.setSelectAll(v);
		}
	};

	const hasSelections = $derived(smartTable.hasSelections);

	// =================================================================
	// 5. HOVER PRELOADING FOR EDIT MODE (Enterprise UX Optimization)
	// =================================================================
	let hoverPreloadTimeout: ReturnType<typeof setTimeout> | null = null;
	const preloadedEntries = new SvelteMap<string, { data: any; timestamp: number; hoverCount: number }>();

	const PRELOAD_CACHE_TTL = 30_000; // ms - keep preloaded data for 30 seconds

	// Phase 2: Connection-aware preloading
	let isSlowConnection = $state(false);
	let isPreloadEnabled = $state(true);

	// Phase 2: Predictive preloading - track hover patterns
	const hoverPatterns = new SvelteMap<string, number>(); // entryId -> hover count
	const predictivePreloadQueue: string[] = [];

	// Detect connection speed
	$effect(() => {
		if (browser && 'connection' in navigator) {
			const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
			if (conn) {
				const checkConnection = () => {
					const effectiveType = conn.effectiveType;
					const saveData = (conn as any).saveData;
					isSlowConnection = saveData || effectiveType === 'slow-2g' || effectiveType === '2g';
					isPreloadEnabled = !isSlowConnection;
				};
				checkConnection();
				conn.addEventListener('change', checkConnection);
				return () => conn.removeEventListener('change', checkConnection);
			}
		}
	});

	function handleRowHoverStart(entryId: string) {
		// Phase 2: Respect connection awareness
		if (!isPreloadEnabled) {
			logger.debug('[Preload] Disabled on slow connection');
			return;
		}

		// ✅ Use SvelteKit's preloadData
		preloadEntry(entryId, page.url.pathname);

		// Phase 2: Track hover patterns for predictive preloading
		const currentCount = hoverPatterns.get(entryId) || 0;
		hoverPatterns.set(entryId, currentCount + 1);

		// Phase 2: Predictive preloading - queue frequently hovered entries
		if (currentCount >= 2) {
			predictivePreloadQueue.push(entryId);
		}
	}

	function handleRowHoverEnd() {
		// Cancel pending preload if user moves mouse away quickly
		if (hoverPreloadTimeout) {
			clearTimeout(hoverPreloadTimeout);
			hoverPreloadTimeout = null;
		}
	}

	// Batch warm-cache: single POST for all visible row IDs (not one request per entry)
	async function batchPreloadVisibleEntries() {
		if (!(isPreloadEnabled && browser && currentCollection?._id)) {
			return;
		}

		const entriesToPreload = tableData.slice(0, 5);
		const entryIds = entriesToPreload
			.map((e) => e._id as string)
			.filter((id) => {
				if (!id) return false;
				const cached = preloadedEntries.get(id);
				return !cached || Date.now() - cached.timestamp > PRELOAD_CACHE_TTL;
			});

		if (entryIds.length === 0) return;

		const warm = async () => {
			try {
				await fetch('/api/collections/warm-cache', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						collectionId: currentCollection._id,
						entryIds
					})
				});

				const now = Date.now();
				for (const id of entryIds) {
					preloadedEntries.set(id, { data: null, timestamp: now, hoverCount: 0 });
				}
				logger.debug(`[Batch Preload] Warmed ${entryIds.length} entries in one request`);
			} catch (error) {
				logger.warn('[Batch Preload] Failed:', error);
			}
		};

		if ('requestIdleCallback' in window) {
			(window as any).requestIdleCallback(warm, { timeout: 2000 });
		} else {
			await warm();
		}
	}

	// Trigger batch preload when data changes
	$effect(() => {
		if (tableData.length > 0 && currentMode === 'view') {
			// Delay to avoid interfering with initial page load
			setTimeout(() => batchPreloadVisibleEntries(), 2000);
		}
	});

	// Cleanup preload cache periodically
	$effect(() => {
		const cleanupInterval = setInterval(() => {
			const now = Date.now();
			for (const [entryId, cached] of preloadedEntries.entries()) {
				if (now - cached.timestamp > PRELOAD_CACHE_TTL) {
					preloadedEntries.delete(entryId);
				}
			}
		}, 10_000); // Cleanup every 10 seconds

		return () => clearInterval(cleanupInterval);
	});

	// DND Logic for Headers
	function handleDndConsider(event: CustomEvent) {
		displayTableHeaders = event.detail.items;
	}

	function handleDndFinalize(event: CustomEvent) {
		displayTableHeaders = event.detail.items;
		entryListPaginationSettings.displayTableHeaders = displayTableHeaders;
	}

	// Pagination
	const defaultPaginationSettings = (collectionId: string | null): PaginationSettings => ({
		collectionId,
		density: 'normal',
		sorting: { sortedBy: '', isSorted: 0 as SortOrder },
		currentPage: 1,
		rowsPerPage: 10,
		filters: {}, // Will be populated by an effect based on tableHeaders
		displayTableHeaders: []
	});
	let entryListPaginationSettings = $state(defaultPaginationSettings(collection.value?._id ?? null));

	// Load settings from localStorage
	$effect(() => {
		if (browser && collection.value?._id) {
			const key = `entryListPaginationSettings_${collection.value._id}`;
			const saved = localStorage.getItem(key);
			if (saved) {
				try {
					const parsed = JSON.parse(saved);
					// Ensure we don't overwrite with stale data structure, merge carefully if needed
					// For now, assume saved state is valid but ensure collectionId matches
					if (parsed.collectionId === collection.value._id) {
						// We need to match the Shape of PaginationSettings
						entryListPaginationSettings = {
							...defaultPaginationSettings(collection.value._id),
							...parsed
							// Ensure displayTableHeaders are re-verified against current schema later by existing effects
						};
					}
				} catch (e) {
					console.error('Failed to load entry list settings', e);
				}
			}
		}
	});

	// Save settings to localStorage
	$effect(() => {
		if (browser && collection.value?._id && entryListPaginationSettings) {
			const key = `entryListPaginationSettings_${collection.value._id}`;
			// Debounce save slightly or just save? $effect runs after render.
			// Use untrack? No, we want to track entryListPaginationSettings.
			const stringified = JSON.stringify(entryListPaginationSettings);
			localStorage.setItem(key, stringified);
		}
	});

	// Simplified stable state management
	let showDeleted = $state(false); // Controls whether to view active or archived entries
	let globalSearchValue = $state('');
	let expand = $state(false);
	let filterShow = $state(false);
	let columnShow = $state(false);
	const currentStates = $derived.by(() => ({
		language: app.contentLanguage,
		systemLanguage: app.systemLanguage,
		mode: mode.value,
		collection: collection.value,
		screenSize: screen.size
	}));

	// Initialize globalSearchValue from URL parameter on mount/navigation
	$effect(() => {
		const urlSearch = page.url.searchParams.get('search') || '';
		if (urlSearch !== globalSearchValue) {
			globalSearchValue = urlSearch;
		}
	});

	// Debounced search → URL (triggers server FTS via collection-service query.search)
	$effect(() => {
		const searchValue = globalSearchValue;
		const currentUrlSearch = page.url.searchParams.get('search') || '';

		if (searchValue === currentUrlSearch) {
			return;
		}

		untrack(() => {
			searchDebounce(() => {
				updateURL({
					search: searchValue || null,
					page: searchValue ? 1 : null
				});
			});
		});
	});

	// Sync filters from URL → smartFilter (whitelist-aware) + pagination settings
	$effect(() => {
		const searchParams = page.url.searchParams;
		untrack(() => {
			const changed = smartFilter.syncFromURL(searchParams);
			const plain = smartFilter.toPlainObject();
			const hasActiveUrlFilters = smartFilter.activeCount > 0;

			if (changed) {
				entryListPaginationSettings.filters = { ...plain };
			}

			// Auto-open filter row if filters are present in URL
			if (hasActiveUrlFilters && !filterShow) {
				filterShow = true;
			}
		});
	});

	// Destructure for easier access
	const currentLanguage = $derived(propContentLanguage || currentStates.language);
	const currentMode = $derived(currentStates.mode);
	const currentCollection = $derived(currentStates.collection);

	import { availablePlugins } from '@src/plugins/index';

	// ... (helper to map entry data to component props)
	function mapPluginProps(propMapping: Record<string, string> | undefined, entry: any) {
		if (!propMapping) {
			return {};
		}
		const props: Record<string, any> = {};
		for (const [propName, entryPath] of Object.entries(propMapping)) {
			// Simple path resolution (e.g. "pluginData.performanceScore" or just "performanceScore" if typical flat entry)
			// Assuming pluginData structure for plugins: entry.pluginData[field]
			if (entryPath === 'performanceScore' && entry.pluginData?.performanceScore !== undefined) {
				props[propName] = entry.pluginData.performanceScore;
			} else {
				// Fallback or generic mapping
				props[propName] = entry[entryPath];
			}
		}
		return props;
	}

	// Optimized table headers with better caching
	const tableHeaders = $derived.by((): TableHeader[] => {
		if (!currentCollection?.fields) {
			return [];
		}

		const cacheKey = `${currentCollection._id}-${currentCollection.fields.length}`;

		const schemaHeaders: TableHeader[] = currentCollection.fields.map(
			(field: any): TableHeader => ({
				id: `${cacheKey}-${getFieldName(field)}`,
				label: field.label,
				name: getFieldName(field),
				widgetName: field.widget?.Name || field.type || 'Input',
				visible: true
			})
		);

		const systemHeaders: TableHeader[] = [
			{ id: `${cacheKey}-createdAt`, label: 'createdAt', name: 'createdAt', visible: true },
			{ id: `${cacheKey}-updatedAt`, label: 'updatedAt', name: 'updatedAt', visible: true },
			{ id: `${cacheKey}-status`, label: 'status', name: 'status', visible: true }
		];

		const schemaHeaderNames = new Set(schemaHeaders.map((h) => h.name));
		const filteredSystemHeaders = systemHeaders.filter((h) => !schemaHeaderNames.has(h.name));

		// Plugin Headers (Dynamic detection)
		// Iterate over registered plugins and add their columns
		for (const plugin of availablePlugins) {
			if (plugin.ui?.columns) {
				for (const col of plugin.ui.columns) {
					// Only add if relevant? For now add all enabled plugin columns.
					// Check if any entry actually has data for this plugin to avoid clutter?
					// Or just always show if plugin is active. Let's show if plugin is active.

					// Optional: Check if plugin is enabled for this collection?
					// if (plugin.enabledCollections && !plugin.enabledCollections.includes(currentCollection._id)) continue;

					filteredSystemHeaders.unshift({
						id: `${plugin.metadata.id}-${col.id}`,
						label: col.label,
						name: col.id,
						visible: true,
						width: col.width ? Number.parseInt(col.width, 10) : undefined,
						sortable: col.sortable,
						component: col.component,
						props: col.props
					});
				}
			}
		}

		return [...schemaHeaders, ...filteredSystemHeaders];
	});

	// displayTableHeaders are the actual headers shown, considering user's order/visibility preferences from localStorage
	let displayTableHeaders: TableHeader[] = $state([]);

	$effect(() => {
		// Sync displayTableHeaders with settings or defaults from tableHeaders
		const currentCollId = currentCollection?._id;
		const settings = entryListPaginationSettings;

		if (tableHeaders.length > 0) {
			if (settings.collectionId === currentCollId && Array.isArray(settings.displayTableHeaders) && settings.displayTableHeaders.length > 0) {
				const schemaHeaderMap = new SvelteMap(tableHeaders.map((th) => [th.name, th]));
				const reconciledHeaders: TableHeader[] = [];
				const addedNames = new SvelteSet();

				for (const savedHeader of settings.displayTableHeaders) {
					const schemaHeader = schemaHeaderMap.get(savedHeader.name);
					if (schemaHeader) {
						reconciledHeaders.push({
							...schemaHeader,
							id: savedHeader.id || schemaHeader.id,
							visible: typeof savedHeader.visible === 'boolean' ? savedHeader.visible : schemaHeader.visible
						});
						addedNames.add(savedHeader.name);
					}
				}
				for (const schemaHeader of tableHeaders) {
					if (!addedNames.has(schemaHeader.name)) {
						reconciledHeaders.push({ ...schemaHeader, visible: true });
					}
				}
				displayTableHeaders = reconciledHeaders;
			} else {
				displayTableHeaders = tableHeaders.map((h) => ({ ...h, visible: true }));
			}
		} else {
			displayTableHeaders = [];
		}
	});

	const visibleTableHeaders = $derived(displayTableHeaders.filter((header) => header.visible));

	const selectAllColumns = {
		get value() {
			return displayTableHeaders.length > 0 ? displayTableHeaders.every((h) => h.visible) : false;
		},
		set value(v: boolean) {
			displayTableHeaders = displayTableHeaders.map((h) => ({ ...h, visible: v }));
		}
	};

	const cellPaddingClass = $derived(smartTable.cellPaddingClass);

	// Sync density from pagination settings ↔ smart table
	$effect(() => {
		const d = entryListPaginationSettings.density;
		if (d && d !== smartTable.density) {
			smartTable.setDensity(d);
		}
	});

	$effect(() => {
		if (currentMode === 'view') {
			untrack(() => {
				meta_data.clear();
				const currentValue = collectionValue;
				if (currentValue && Object.keys(currentValue).length > 0) {
					setCollectionValue({});
				}
				const currentCollId = collection.value?._id;
				if (currentCollId) {
					invalidateCollectionCache(currentCollId);
				}
			});
		}
		if (currentMode === 'edit') {
			untrack(() => {
				smartTable.clearSelection();
			});
		}
	});

	const hasActiveFilters = $derived(smartFilter.activeCount > 0 || !!globalSearchValue);

	setModifyEntry(async (status: keyof typeof statusMap | undefined = undefined): Promise<void> => {
		const selectedIds = getSelectedIds();
		if (!selectedIds.length) {
			toast.warning('No entries selected');
			return;
		}

		showStatusChangeConfirm({
			status: String(status ?? ''),
			count: selectedIds.length,
			onConfirm: async () => {
				await setEntriesStatus(selectedIds, status as any, onActionSuccess);
			}
		});
	});

	const pathSegments = $derived(page.url.pathname.split('/').filter(Boolean));
	const categoryName = $derived.by(() => {
		if (breadcrumb && breadcrumb.length > 0) {
			return breadcrumb.map((b: { name: string; path: string }) => b.name).join(' > ');
		}
		const segments = pathSegments?.slice() ?? [];
		if (segments.length > 0) {
			segments.shift();
		}
		return segments.slice(0, -1).join('>') || '';
	});

	const getSelectedIds = () => smartTable.getSelectedIds();

	const getSelectedRawEntries = () => smartTable.getSelectedRows() as CollectionEntry[];

	const onCreate = async () => {
		const newEntry: Record<string, any> = {};
		if (currentCollection?.fields) {
			for (const field of currentCollection.fields) {
				if (typeof field === 'object' && field !== null && 'label' in field && 'type' in field) {
					const fieldName = getFieldName(field as any, false);
					newEntry[fieldName] = null;
				}
			}
		}
		if (collection.value?.status) {
			newEntry.status = collection.value.status;
		}

		// ✅ GUI-FIRST PATTERN: Instant mode switch (no data loading needed for create)
		// 1. Update stores INSTANTLY (no navigation wait)
		modeTransitionGuard.setMode('create');
		setCollectionValue(newEntry);

		// 2. Reflect in URL (passive, no reload)
		reflectModeInURL('create');

		// 3. Toggle UI
		await Promise.resolve();
		ui.forceUpdate();

		logger.debug('[Create] INSTANT - New entry mode');
	};

	const onPublish = () => setEntriesStatus(getSelectedIds(), StatusTypes.publish, onActionSuccess);
	const onUnpublish = () => setEntriesStatus(getSelectedIds(), StatusTypes.unpublish, onActionSuccess);
	const onDraft = () => setEntriesStatus(getSelectedIds(), StatusTypes.draft, onActionSuccess);
	const onDelete = (isPermanent = false) => {
		const selectedIds = getSelectedIds();
		if (!selectedIds.length) {
			toast.warning('No entries selected');
			return;
		}

		const useArchiving = publicEnv?.USE_ARCHIVE_ON_DELETE ?? false;
		const isForArchived = showDeleted || isPermanent;
		const willDelete = !useArchiving || isForArchived;
		const actionVerb = willDelete ? 'delete' : 'archive';

		showDeleteConfirm({
			isArchive: !willDelete,
			count: selectedIds.length,
			onConfirm: async () => {
				try {
					if (willDelete) {
						try {
							const collId = collection.value?._id;
							if (collId) {
								const result = await batchDeleteEntries(collId, selectedIds);
								if (result.success) {
									toast.success(`${selectedIds.length} ${selectedIds.length === 1 ? 'entry' : 'entries'} deleted successfully`);
								} else {
									throw new Error('Batch delete failed');
								}
							}
						} catch (batchError) {
							logger.warn('Batch delete failed, using individual deletes:', batchError);
							await Promise.all(
								selectedIds.map((entryId) => {
									const collId = collection.value?._id;
									if (collId) {
										return deleteEntry(collId, entryId);
									}
									return Promise.resolve();
								})
							);
							toast.success(`${selectedIds.length} ${selectedIds.length === 1 ? 'entry' : 'entries'} deleted successfully`);
						}
					} else {
						await setEntriesStatus(selectedIds, StatusTypes.archive, () => {});
					}
					onActionSuccess();
				} catch (error) {
					toast.error(`Failed to ${actionVerb} entries: ${(error as Error).message}`);
				}
			}
		});
	};
	const onClone = () => cloneEntries(getSelectedRawEntries(), onActionSuccess);

	const onSchedule = (date: string) => {
		const payload = { _scheduled: new Date(date).getTime() };
		setEntriesStatus(getSelectedIds(), StatusTypes.draft, onActionSuccess, payload);
	};

	function handleColumnVisibilityToggle(headerToToggle: TableHeader) {
		displayTableHeaders = displayTableHeaders.map((h) => (h.id === headerToToggle.id ? { ...h, visible: !h.visible } : h));
	}

	function resetViewSettings() {
		const currentCollId = currentCollection?._id;
		if (browser && currentCollId) {
			localStorage.removeItem(`entryListPaginationSettings_${currentCollId}`);
		}
		entryListPaginationSettings = defaultPaginationSettings(currentCollId ?? null);
	}
</script>

<!--Table -->
{#if !currentCollection}
	<div class="dark:bg-error-950 flex h-64 flex-col items-center justify-center rounded border border-error-500 bg-error-50 p-8">
		<svg aria-hidden="true" class="mb-4 h-16 w-16 text-error-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
			/>
		</svg>
		<h3 class="mb-2 text-xl font-bold text-error-600 dark:text-error-500">Collection Not Found</h3>
		<p class="text-center text-error-600 dark:text-error-500">
			The requested collection could not be loaded. Please check the collection name and try again.
		</p>
	</div>
{:else}
	<!-- Header -->
	<div class="ms-2 mb-2 flex justify-between dark:text-white">
		<!-- Row 1 for Mobile -->
		<div class="flex items-center justify-between">
			<!-- Hamburger -->
			{#if ui.state.leftSidebar === 'hidden'}
				<Button variant="outline"
					type="button"
					onkeydown={() => {}}
					onclick={() => ui.toggle('leftSidebar', screen.isDesktop ? 'full' : 'collapsed')}
					aria-label="open-sidebar"
				 class="p-0! min-w-0 mt-1">
					<iconify-icon icon="mingcute:menu-fill" width={24}></iconify-icon>
				</Button>
			{/if}

			<!-- Collection type with icon -->
			<div class="me-1 flex flex-col {!ui.state.leftSidebar ? 'ms-2' : 'ms-1 sm:ms-2'}">
				{#if categoryName}
					<div class="mb-2 text-xs capitalize text-surface-500 dark:text-surface-50 rtl:text-left">{categoryName}</div>
				{/if}
				<h1 class="-mt-2 flex justify-start text-sm font-bold capitalize dark:text-white md:text-2xl lg:text-xl">
					{#if currentCollection?.icon}
						<span> <iconify-icon icon={currentCollection.icon} width="24" class="me-1 text-error-500 sm:mr-2"></iconify-icon> </span>
					{/if}
					{#if currentCollection?.name}
						<div class="flex max-w-21.25 whitespace-normal leading-3 sm:mr-2 sm:max-w-none md:mt-0 md:leading-none xs:mt-1">
							{currentCollection.name}
							{#if collectionStats}
								<span class="ms-2 text-xs font-normal text-surface-500">({collectionStats.count})</span>
							{/if}
						</div>
					{/if}
				</h1>
			</div>
		</div>
		<div class="flex items-center justify-between gap-1 overflow-x-auto shrink-0 max-w-full">
			<!-- Expand/Collapse -->
			<Button variant="outline"
				type="button"
				onkeydown={() => {}}
				onclick={() => (expand = !expand)}
				aria-label="expand-collapse-filters"
			 class="p-0! min-w-0 sm:hidden">
				<iconify-icon icon="material-symbols:filter-list-rounded" width={24}></iconify-icon>
			</Button>

			<!-- Translation Content Language - Mobile -->
			<div class="mt-1 sm:hidden"><TranslationStatus /></div>

			<!-- Table Filter with Translation Content Language - Desktop -->
			<div class="relative mt-1 hidden items-center justify-center gap-2 sm:flex">
				<TableFilter
					bind:globalSearchValue
					bind:filterShow
					bind:columnShow
					bind:density={entryListPaginationSettings.density}
				/>
				<SmartTableSavedViewsMenu
					scope={viewsScope}
					getSnapshot={getSavedViewSnapshot}
					onApply={applySavedView}
				/>
				<SmartTableMetricsBadge summary={listMetrics} />
				<TranslationStatus />
			</div>

			<!-- MultiButton -->
			<div class="flex items-center justify-end sm:mt-0 sm:w-auto sshrink-0">
				<EntryListMultiButton
					isCollectionEmpty={tableData?.length === 0}
					{hasSelections}
					selectedCount={smartTable.selectedCount}
					selectedItems={getSelectedRawEntries()}
					bind:showDeleted
					publish={onPublish}
					unpublish={onUnpublish}
					schedule={onSchedule}
					delete={onDelete}
					draft={onDraft}
					clone={onClone}
					create={onCreate}
				/>
			</div>
		</div>
	</div>

	<!-- Table  Start-->
	{#if expand}
		<div class="mb-2 flex flex-wrap items-center justify-center gap-2 sm:hidden">
			<TableFilter bind:globalSearchValue bind:filterShow bind:columnShow bind:density={entryListPaginationSettings.density} />
			<SmartTableSavedViewsMenu
				scope={viewsScope}
				getSnapshot={getSavedViewSnapshot}
				onApply={applySavedView}
			/>
			<SmartTableMetricsBadge summary={listMetrics} />
		</div>
	{/if}

	<!-- Status facet chips (server counts) -->
	<div class="mb-1 shrink-0">
		<SmartTableStatusFacets
			facets={statusFacets}
			active={activeStatusFacet}
			onSelect={onStatusFacetSelect}
		/>
	</div>

	{#if columnShow}
		<!-- Column order -->
		<div class="rounded-b-0 flex flex-col justify-center rounded-t-md border-b bg-secondary-100 p-2 text-center dark:bg-surface-700">
			<div class="text-sm dark:text-primary-500">{entrylist_dnd()}</div>
			<!-- Select All Columns -->
			<div class="my-2 flex w-full flex-col items-center justify-center gap-2 sm:flex-row sm:gap-4">
				<div class="flex items-center gap-2">
					<Checkbox bind:checked={selectAllColumns.value} label={entrylist_all()} />

					<Button variant="outline" onclick={resetViewSettings} aria-label="reset-view" class="bg-surface-400 text-white">
						<iconify-icon icon="material-symbols-light:device-reset" width={24}></iconify-icon>
						Reset View
					</Button>
				</div>
				<section
					use:dndzone={{ items: displayTableHeaders, flipDurationMs: 300, type: 'columns', dropTargetStyle: { outline: 'none' } }}
					onconsider={handleDndConsider}
					onfinalize={handleDndFinalize}
					class="flex w-full flex-wrap justify-center gap-2 p-2 border-2 border-dashed border-secondary-500/50 rounded transition-all hover:border-secondary-500"
				>
					{#each displayTableHeaders as header (header.id)}
						<div animate:flip={{ duration: 300 }}>
							<Button variant="tertiary"
								type="button"
								onclick={() => handleColumnVisibilityToggle(header)}
								aria-label="toggle-column-visibility"
							 class="chip {header.visible ? '' : 'ring ring-surface-500 bg-transparent text-secondary-500'} flex items-center justify-center text-xs cursor-move">
								{#if header.visible}
									<iconify-icon icon="fa:check" width={24} class="me-1"></iconify-icon>
								{/if}
								<span class="capitalize">{header.label}</span>
							</Button>
						</div>
					{/each}
				</section>
			</div>
		</div>
	{/if}

	{#if tableData.length > 0 || hasActiveFilters}
		<SmartTableShell
			empty={tableData.length === 0 && hasActiveFilters}
			emptyTitle="No entries match filters"
			emptyDescription="Clear filters or adjust search to see collection entries."
			emptyIcon="mdi:filter-off-outline"
			showPagination={tableData.length > 0}
			manageScroll={false}
			currentPage={serverPagination.currentPage}
			rowsPerPage={serverPagination.pageSize}
			pagesCount={pagesCount}
			totalItems={totalItems}
			onUpdatePage={onUpdatePage}
			onUpdateRowsPerPage={onUpdateRowsPerPage}
			class="min-h-0 flex-1"
		>
			{#snippet emptyAction()}
				<Button variant="outline" size="sm" onclick={onClearAllFilters} aria-label="Clear all filters">
					Clear filters
				</Button>
			{/snippet}
		<div
			bind:this={scrollContainerEl}
			onscroll={onVirtualScroll}
			class="{SMART_TABLE_SCROLL} max-h-[calc(100dvh)]"
		>
			<table class={SMART_TABLE}>
				<!-- Table Header -->
				<thead class={SMART_TABLE_THEAD}>
					{#if filterShow && visibleTableHeaders.length > 0}
						<SmartFilterRow
							headers={visibleTableHeaders}
							definitions={smartFilter.definitions}
							filters={smartFilter.filters}
							activeFilters={smartFilter.activeFilters}
							onFilterChange={onFilterChange}
							onClearAll={onClearAllFilters}
							onClearFilter={onClearFilter}
						/>
					{/if}

					<tr class="border-b border-black dark:border-white">
						<TableIcons
							cellClass={`w-10 ${pinCellClass('start')} ${hasSelections ? 'bg-tertiary-500 dark:bg-primary-500/10 dark:bg-secondary-500/20' : ''}`}
							checked={SelectAll.value}
							onCheck={(checked: boolean) => {
								SelectAll.value = checked;
							}}
						/>

						{#each visibleTableHeaders as header (header.id)}
							{@const colKey = ((header as TableHeader).name || header.id) as string}
							<th
								class="relative text-center text-xs sm:text-sm {cellPaddingClass}"
								style={smartTable.getColumnWidthStyle(colKey)}
								aria-sort={(header as TableHeader).name === entryListPaginationSettings.sorting.sortedBy
									? entryListPaginationSettings.sorting.isSorted === 1
										? 'ascending'
										: 'descending'
									: 'none'}
							>
								<Button
									variant="ghost"
									class="flex w-full items-center justify-center font-bold uppercase focus:outline-none {(header as TableHeader).name ===
									entryListPaginationSettings.sorting.sortedBy
										? 'text-tertiary-500 dark:text-primary-500'
										: 'text-tertiary-500 dark:text-primary-500'}"
									onclick={() => onSortChange((header as TableHeader).name || '')}
									aria-label="sort-column"
								>
									{(header as TableHeader).label}
									{#if (header as TableHeader).name === entryListPaginationSettings.sorting.sortedBy && entryListPaginationSettings.sorting.isSorted !== 0}
										{@const sortIcon = entryListPaginationSettings.sorting.isSorted === 1 ? 'mdi:arrow-up' : 'mdi:arrow-down'}
										<iconify-icon icon={sortIcon} width="16" class="ms-1 origin-center"></iconify-icon>
									{/if}
								</Button>
								<ColumnResizeHandle columnKey={colKey} onResize={smartTable.setColumnWidth} />
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#if useRowVirtualization && spacerTop > 0}
						<tr style="height: {spacerTop}px" aria-hidden="true"></tr>
					{/if}
					{#if tableData.length > 0}
						{#each visibleRows as entry, idx (entry._id)}
							{@const rowId = String(entry._id ?? '')}
							{@const rowSelected = smartTable.isSelected(rowId)}
							<tr
								class="{rowSelected ? 'bg-tertiary-500 dark:bg-primary-500' : ''}"
								style={useRowVirtualization ? 'content-visibility: auto; contain-intrinsic-size: 48px;' : undefined}
								onmouseenter={() => entry._id && handleRowHoverStart(entry._id)}
								onmouseleave={handleRowHoverEnd}
							>
								<TableIcons
									cellClass={`w-10 text-center ${rowSelected ? 'bg-tertiary-500 dark:bg-primary-500/10 dark:bg-secondary-500/20' : ''}`}
									checked={rowSelected}
									onCheck={() => {
										if (rowId) smartTable.toggleSelect(rowId);
									}}
								/>
								{#if visibleTableHeaders}
									{#each visibleTableHeaders as header (header.id)}
										{@const cellKey = ((header as TableHeader).name || header.id) as string}
										<td
											class="text-center {cellPaddingClass} text-xs font-bold sm:text-sm {(header as TableHeader).name !== 'status'
												? 'cursor-pointer transition-colors duration-200 hover:bg-tertiary-500 dark:bg-primary-500/10 dark:hover:bg-secondary-500/20'
												: 'hover:bg-warning-500/10 dark:hover:bg-warning-500/20'}"
											style={smartTable.getColumnWidthStyle(cellKey)}
											onclick={async () => {
												if ((header as TableHeader).name === 'status') {
													// Handle single entry status change with modal (same style as multibutton)
													const currentStatus = entry.status || entry.raw_status || 'draft';
													let nextStatus;

													// Define status progression logic using StatusTypes
													switch (currentStatus) {
														case StatusTypes.draft:
															nextStatus = StatusTypes.publish;
															break;
														case StatusTypes.publish:
															nextStatus = StatusTypes.unpublish;
															break;
														case StatusTypes.unpublish:
															nextStatus = StatusTypes.publish;
															break;
														case StatusTypes.schedule:
															nextStatus = StatusTypes.publish;
															break;
														default:
															nextStatus = StatusTypes.publish;
															break;
													}

													// Create modal with same styling as multibutton modals
													showStatusChangeConfirm({
														status: String(nextStatus),
														count: 1,
														onConfirm: async () => {
															try {
																const collId = collection.value?._id;
																if (!collId) return;
																const result = await updateEntryStatus(collId, entry._id as string, String(nextStatus));
																if (result.success) {
																	toast.success(`Entry status updated to ${nextStatus}`);
																	onActionSuccess();
																} else {
																	toast.error(result.error || 'Failed to update entry status');
																}
															} catch (error) {
																logger.error('Error updating entry status:', error);
																toast.error('An error occurred while updating entry status');
															}
														}
													});
												} else {
													// GUI-FIRST PATTERN: Navigate to edit mode (loads full multilingual data)
													const originalEntry = tableData.find((e: CollectionEntry) => e._id === entry._id);
													if (originalEntry) {
														// 1. Check cache & load if needed
														// Navigate to edit mode - this triggers SSR to load full multilingual data
														// List view has language-projected data, edit mode needs all languages

														// 2. Update stores INSTANTLY (no waiting)
														// The URL pattern document mandates GUI-First: state first, URL second
														modeTransitionGuard.setMode("edit");
														setCollectionValue(originalEntry);

														// 3. Reflect in URL (passive, no reload if we use replaceState, but we want history so we use reflectModeInURL)
														reflectModeInURL("edit", originalEntry._id as string);

														logger.debug(`[Edit] Loading full data for entry ${originalEntry._id}`);
													}
												}
											}}
										>
											<SystemTooltip title={(header as TableHeader).name !== 'status' ? 'Click to edit this entry' : 'Click to change status'}>
												{#if (header as TableHeader).name === 'status'}
													<div class="flex w-full items-center justify-center"><Status value={entry.status || entry.raw_status || 'draft'} /></div>
												{:else if (header as TableHeader).component}
													<!-- Dynamic Plugin Component Injection -->
													{const pluginId = ((header as TableHeader).id || '').split('-')[0]}

													<PluginComponent
														{pluginId}
														componentName={(header as TableHeader).component || ''}
														{...mapPluginProps((header as TableHeader).props, entry)}
														compact={true}
													/>
												{:else if (header as TableHeader).name === 'createdAt' || (header as TableHeader).name === 'updatedAt'}
													<div class="flex flex-col text-xs">
														<div class="font-semibold">
															{formatDisplayDate((entry as any)[(header as TableHeader).name || ''] as string, 'en', {
																year: 'numeric',
																month: 'short',
																day: 'numeric'
															})}
														</div>
														<div class="text-surface-500 dark:text-surface-200">
															{formatDisplayDate((entry as any)[(header as TableHeader).name || ''] as string, 'en', {
																hour: '2-digit',
																minute: '2-digit',
																second: '2-digit',
																hour12: false
															})}
														</div>
													</div>
												{:else if (header as TableHeader).widgetName}
													<EntryListCell
														widgetName={(header as TableHeader).widgetName}
														fieldName={(header as TableHeader).name || ''}
														value={(entry as any)[(header as TableHeader).name || '']}
														contentLanguage={currentLanguage}
														compact={true}
													/>
												{:else}
													<Sanitize html={String((entry as any)[(header as TableHeader).name || ''] || '-')} profile="strict" />
												{/if}
											</SystemTooltip>
										</td>
									{/each}
								{/if}
							</tr>
						{/each}
						{#if useRowVirtualization && spacerBottom > 0}
							<tr style="height: {spacerBottom}px" aria-hidden="true"></tr>
						{/if}
					{:else}
						<tr>
							<td colspan={visibleTableHeaders.length + 1} class="p-4 text-center text-surface-500 dark:text-surface-50">No results found.</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
		</SmartTableShell>
	{:else}
		<div class="py-10 text-center text-tertiary-500 dark:text-primary-500">
			<iconify-icon icon="bi:exclamation-circle-fill" width={24} class="mb-2"></iconify-icon>
			<p class="text-lg">
				{currentCollection?.name ? EntryList_no_collection({ name: currentCollection.name }) : 'No collection selected or collection is empty.'}
			</p>
		</div>
	{/if}
{/if}

<style>
	div::-webkit-scrollbar-thumb {
		background-color: #0ec423;
		border-radius: 50px;
	}
	div::-webkit-scrollbar {
		width: 10px;
	}
</style>
