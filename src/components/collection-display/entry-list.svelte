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
- **Status facets**: Streamed server `getStatusFacets` chips (resolves to `{}` on failure).
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
- `statusFacets` (Promise<Partial<Record<string, number>>>, optional): Streamed status counts for facet chips; never rejects, resolves to `{}`.
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
	import { contentLanguage } from '@src/stores/locale-store.svelte';
	export type SortOrder = 0 | 1 | -1; // Strict type for sort order
</script>

<script lang="ts">
	// Components
	import AdminCard from '@components/admin-card.svelte';
	import Status from '@components/system/table/status.svelte';
	import TableFilter from '@components/system/table/table-filter.svelte';
	import TableIcons from '@components/system/table/table-icons.svelte';
	import PluginComponent from '@src/components/plugins/plugin-component.svelte';
	import { availablePlugins } from '@src/plugins/client';
	// Types
	// =================================================================
	// 1. RECEIVE DATA AS PROPS (From +page.server.ts)
	// =================================================================
	import type {
		EntryListProps,
		PaginationSettings,
		TableHeader,
		CollectionEntry
	} from '@src/content/types';
	import { StatusTypes } from '@src/content/types';
	// ParaglideJS
	import { EntryList_no_collection } from '@src/paraglide/messages';
	// Stores
	import {
		collections,
		setCollectionValue,
		setModifyEntry,
		type statusMap
	} from '@src/stores/collection-store.svelte.ts';
	import { modeTransitionGuard } from '@src/stores/mode-transition-guard.svelte';
	// Config
	import { publicEnv } from '@src/stores/global-settings.svelte';
	import { screen } from '@src/stores/screen-size-store.svelte.ts';
	import { ui } from '@src/stores/ui-store.svelte.ts';
	import Sanitize from '@src/utils/sanitize.svelte';
	// Utils
	// Utils
	import { getEntry, invalidateCollectionCache, updateEntryStatus } from '@utils/api';
	import { formatDisplayDate } from '@utils/date';
	import {
		bulkEditEntries,
		cloneEntries,
		deleteEntries,
		setEntriesStatus
	} from '@utils/entry-actions';
	import { loadEntryFormValues } from '@utils/entry-values';
	// Using iconify-icon web component
	import { logger } from '@utils/logger';
	// Native UI Components
	import { showDeleteConfirm, showStatusChangeConfirm } from '@utils/modal.svelte';
	import { reflectModeInURL } from '@utils/navigation';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { getFieldName } from '@utils/schema/field-utils';
	import { meta_data } from '@utils/entry-actions';
	import { untrack } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { browser } from '$app/env';
	import { goto, refreshAll } from '$app/navigation';
	import { page } from '$app/state';
	import { createSmartTable } from '@components/ui/smart-table/create-smart-table.svelte';
	import type { ColumnSortDescriptor } from '@components/ui/smart-table/types';
	import {
		pinCellClass,
		SMART_TABLE,
		SMART_TABLE_ROW_HOVER,
		SMART_TABLE_ROW_SELECTED,
		SMART_TABLE_SCROLL,
		SMART_TABLE_TD,
		SMART_TABLE_TH,
		SMART_TABLE_THEAD
	} from '@components/ui/smart-table/chrome';
	import SmartTableShell from '@components/ui/smart-table/smart-table-shell.svelte';
	import SmartTableSavedViewsMenu from '@components/ui/smart-table/smart-table-saved-views-menu.svelte';
	import SmartTableStatusFacets from '@components/ui/smart-table/smart-table-status-facets.svelte';
	import SmartTableMetricsBadge from '@components/ui/smart-table/smart-table-metrics-badge.svelte';
	import ColumnResizeHandle from '@components/ui/smart-table/column-resize-handle.svelte';
	import { computeColumnWindow } from '@components/ui/smart-table/column-window';
	import type { SmartTableSavedView } from '@utils/smart-table-saved-views';
	import EntryListMultiButton from './entry-list-multi-button.svelte';
	import TranslationStatus from './translation-status.svelte';
	import { CONTENT_PADDING } from './content-classes';
	import EntryListCell from './entry-list-cell.svelte';
	import { createSmartFilter } from './create-smart-filter.svelte';
	import SmartFilterRow from './smart-filter-row.svelte';
	import EntryListColumnManager from './entry-list-column-manager.svelte';
	import EntryListCardGrid from './entry-list-card-grid.svelte';
	import { createEntryListHoverPreload } from './entry-list-hover-preload.svelte';
	import { exportEntriesToCsv } from './entry-list-export';
	import { memoizeLazyLoader } from '@utils/lazy-module';
	import type { AdvancedFilterClause } from './advanced-filter-modal.svelte';
	const loadBulkFieldEditModal = memoizeLazyLoader(() => import('./bulk-field-edit-modal.svelte'));
	const loadAdvancedFilterModal = memoizeLazyLoader(() => import('./advanced-filter-modal.svelte'));

	// =================================================================
	// 1. RECEIVE DATA AS PROPS (From +page.server.ts)
	// =================================================================
	const {
		collection: propCollection = null,
		entries: serverEntries = [],
		pagination: serverPagination = { currentPage: 1, pageSize: 10, totalItems: 0, pagesCount: 1 },
		contentLanguage: propContentLanguage,
		breadcrumb = [],
		collectionStats = null,
		statusFacets = Promise.resolve<Partial<Record<string, number>>>({}),
		listMetrics = null
	}: EntryListProps & {
		breadcrumb?: Array<{ name: string; path: string }>;
		collectionStats?: { _id: string; name: string; count: number; lastModified: string } | null;
		statusFacets?: Promise<Partial<Record<string, number>>>;
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

	/**
	 * Collection id for all per-collection persistence keys.
	 *
	 * Derived from the prop (not `collections.active`) because the store is
	 * populated by the route's `$effect.pre`, i.e. *after* this component is
	 * created — reading it here produced the generic `entry-list` layout key.
	 */
	const initialCollectionId = untrack(() =>
		propCollection?._id ? String(propCollection._id) : null
	);

	// =================================================================
	// 3. URL-BASED NAVIGATION (Replaces All Client-Side Fetching)
	// =================================================================
	function updateURL(updates: Record<string, string | number | null>) {
		const newUrl = new URL(page.url.href);
		Object.entries(updates).forEach(([key, value]) => {
			if (value === null || value === '') {
				newUrl.searchParams.delete(key);
			} else {
				newUrl.searchParams.set(key, String(value));
			}
		});
		// Guard: skip goto if URL hasn't changed to prevent effect_update_depth_exceeded
		if (newUrl.href === page.url.href) return;
		goto(newUrl, { reset: false });
	}

	// Unified Smart Table (server mode) — selection, virtualization, density, sort/page callbacks
	// layoutKey is per-collection; `resetForCollection` swaps it when the table updates in place.
	const smartTable = createSmartTable<CollectionEntry>({
		mode: 'server',
		layoutKey: initialCollectionId ? `entry-list:${initialCollectionId}` : 'entry-list',
		onQueryChange: (updates) => updateURL(updates),
		getRowId: (row) => String(row._id ?? '')
	});

	// Keep controller in sync with SSR props
	// Wrap in untrack to prevent reactive feedback loops when setRows
	// triggers smart table internal state that re-triggers URL effects
	$effect(() => {
		const rows = tableData;
		const meta = serverPagination;
		untrack(() => {
			smartTable.setRows(rows as CollectionEntry[]);
			smartTable.setPaginationMeta({
				currentPage: meta.currentPage,
				pageSize: meta.pageSize,
				totalItems: meta.totalItems,
				pagesCount: meta.pagesCount
			});
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

	function onSortChange(fieldName: string, isMulti = false) {
		if (!fieldName) return;
		smartTable.setSort(fieldName, { multi: isMulti });
		entryListPaginationSettings.sorting = {
			sortedBy: smartTable.sort.sortedBy,
			isSorted: smartTable.sort.isSorted as SortOrder
		};
	}

	// Keep header sort indicators in sync with the URL after SSR navigation.
	$effect(() => {
		const sortParam = page.url.searchParams.get('sort') || '';
		const orderRaw = page.url.searchParams.get('order');

		untrack(() => {
			if (sortParam.includes(':') || sortParam.includes(',')) {
				// Multi-sort serialized as field1:asc,field2:desc
				const parts = sortParam.split(',').filter(Boolean);
				const descriptors: ColumnSortDescriptor[] = [];
				for (const part of parts) {
					const [key, dirStr] = part.split(':');
					if (key) {
						descriptors.push({
							key,
							direction: dirStr === 'desc' ? -1 : 1
						});
					}
				}
				const isDiff =
					descriptors.length !== smartTable.multiSort.length ||
					descriptors.some(
						(d, idx) =>
							d.key !== smartTable.multiSort[idx]?.key ||
							d.direction !== smartTable.multiSort[idx]?.direction
					);
				if (isDiff) {
					smartTable.clearSorts({ emit: false });
					for (const d of descriptors) {
						smartTable.setSort(d.key, { emit: false, direction: d.direction, multi: true });
					}
				}
			} else {
				const isSorted = (orderRaw === 'asc' ? 1 : orderRaw === 'desc' ? -1 : 0) as SortOrder;
				if (smartTable.sort.sortedBy !== sortParam || smartTable.sort.isSorted !== isSorted) {
					smartTable.setSort(sortParam, { emit: false, direction: isSorted, multi: false });
				}
			}

			if (
				entryListPaginationSettings.sorting.sortedBy !== smartTable.sort.sortedBy ||
				entryListPaginationSettings.sorting.isSorted !== smartTable.sort.isSorted
			) {
				entryListPaginationSettings.sorting = {
					sortedBy: smartTable.sort.sortedBy,
					isSorted: smartTable.sort.isSorted as SortOrder
				};
			}
		});
	});

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
	const smartFilter = createSmartFilter(() => collections.active);

	// Virtual scroll shell (math owned by smartTable)
	let scrollContainerEl = $state<HTMLDivElement | null>(null);
	const useRowVirtualization = $derived(smartTable.virtual.enabled);
	const visibleRows = $derived(smartTable.virtual.visibleRows);
	const spacerTop = $derived(smartTable.virtual.spacerTop);
	const spacerBottom = $derived(smartTable.virtual.spacerBottom);

	// Horizontal body-cell windowing. The header row stays complete (it is one row
	// and carries sort/resize/column semantics); body cells outside the viewport
	// collapse into two width-preserving placeholder cells. Widths are measured
	// from the rendered header cells once per column-layout change, never on
	// scroll ticks, and stay empty when layout is unavailable (SSR, jsdom).
	let headerColumnOffsets = $state<number[]>([]);
	let headerColumnWidths = $state<number[]>([]);
	let tableViewportWidth = $state(0);
	let tableScrollLeft = $state(0);

	function onVirtualScroll() {
		if (scrollContainerEl) {
			smartTable.virtual.onScroll(
				scrollContainerEl.scrollTop,
				scrollContainerEl.clientHeight || 600
			);
			tableScrollLeft = scrollContainerEl.scrollLeft;
			tableViewportWidth = scrollContainerEl.clientWidth || 0;
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
		collections.active?._id ? `entry-list:${collections.active._id}` : 'entry-list:unknown'
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
		await refreshAll();
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
	const hoverPreloader = createEntryListHoverPreload({
		getCollectionId: () => (currentCollection?._id ? String(currentCollection._id) : null),
		getTableData: () => tableData,
		getMode: () => currentMode,
		getPathname: () => page.url.pathname
	});

	function handleHeadersChange(newHeaders: TableHeader[]) {
		displayTableHeaders = newHeaders;
		entryListPaginationSettings.displayTableHeaders = newHeaders;
	}

	function handleResetView() {
		const currentCollId = currentCollection?._id;
		if (browser && currentCollId) {
			localStorage.removeItem(`entryListPaginationSettings_${currentCollId}`);
		}
		entryListPaginationSettings = defaultPaginationSettings(currentCollId ?? null);
		displayTableHeaders = tableHeaders.map((h) => ({ ...h, visible: true }));
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

	/**
	 * Read the persisted entry-list settings for a collection.
	 *
	 * Called during component initialisation (never from an effect): the first
	 * render must already carry the user's rows/order/density, otherwise the
	 * table paints the defaults and visibly reflows once hydration finishes.
	 */
	function loadPaginationSettings(collectionId: string | null): PaginationSettings {
		// `createSmartTable` already resolved its own persisted layout (density,
		// view mode, widths) during creation — start from that value so the two
		// stores cannot fight on the first effect flush.
		const base = { ...defaultPaginationSettings(collectionId), density: smartTable.density };
		if (!browser || !collectionId) return base;

		try {
			const saved = localStorage.getItem(`entryListPaginationSettings_${collectionId}`);
			if (!saved) return base;

			const parsed = JSON.parse(saved) as Partial<PaginationSettings> | null;
			if (!parsed || parsed.collectionId !== collectionId) return base;

			return { ...base, ...parsed };
		} catch (e) {
			logger.error('Failed to load entry list settings', e);
			return base;
		}
	}

	let entryListPaginationSettings = $state(loadPaginationSettings(initialCollectionId));

	// Save settings to localStorage. Keyed off the prop collection (not the store)
	// and guarded by `collectionId`, so a switch cannot persist collection A's
	// settings under collection B's key before the handover below runs.
	$effect(() => {
		const collectionId = propCollection?._id ? String(propCollection._id) : null;
		const settings = entryListPaginationSettings;
		if (browser && collectionId && settings && settings.collectionId === collectionId) {
			localStorage.setItem(`entryListPaginationSettings_${collectionId}`, JSON.stringify(settings));
		}
	});

	// Simplified stable state management
	let showDeleted = $state(false); // Controls whether to view active or archived entries
	let globalSearchValue = $state('');
	let expand = $state(false);
	let filterShow = $state(false);
	let columnShow = $state(false);

	// Sync the input FROM the URL — but only when the URL's `search` value
	// changes (navigation, saved view, clear). Reading `globalSearchValue`
	// inside `untrack` keeps the field out of this effect's dependencies:
	// otherwise every keystroke re-ran the effect, compared against the
	// not-yet-updated URL (the write is debounced 400 ms below) and reset the
	// field to the old value — typing into the search box was impossible.
	$effect(() => {
		const urlSearch = page.url.searchParams.get('search') || '';
		untrack(() => {
			if (urlSearch !== globalSearchValue) {
				globalSearchValue = urlSearch;
			}
		});
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

	// Destructure for easier access. These are separate derivations (and none of
	// them reads `screen.size`), so a viewport resize cannot invalidate the table
	// headers, rows or selection state.
	const currentLanguage = $derived(propContentLanguage || contentLanguage.value);
	const currentMode = $derived(collections.mode);
	const currentCollection = $derived(propCollection ?? collections.active);
	// Collection header icon (widget default if the collection has no custom icon)
	const collectionIcon = $derived(currentCollection?.icon || 'bi:collection');

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
			if (plugin.metadata?.enabled === false) continue;
			if (
				plugin.enabledCollections &&
				plugin.enabledCollections.length > 0 &&
				currentCollection._id &&
				!plugin.enabledCollections.includes(String(currentCollection._id))
			) {
				continue;
			}
			if (plugin.ui?.columns) {
				for (const col of plugin.ui.columns) {
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

	/**
	 * Reconcile the schema headers with the user's saved order/visibility.
	 * Pure: it seeds the initial render *and* re-runs when the schema changes.
	 */
	function reconcileTableHeaders(
		headers: TableHeader[],
		settings: PaginationSettings,
		collectionId: string | null
	): TableHeader[] {
		if (headers.length === 0) return [];

		if (
			collectionId &&
			settings.collectionId === collectionId &&
			Array.isArray(settings.displayTableHeaders) &&
			settings.displayTableHeaders.length > 0
		) {
			const schemaHeaderMap = new SvelteMap(headers.map((th) => [th.name, th]));
			const reconciledHeaders: TableHeader[] = [];
			const addedNames = new SvelteSet<string | undefined>();

			for (const savedHeader of settings.displayTableHeaders) {
				const schemaHeader = schemaHeaderMap.get(savedHeader.name);
				if (schemaHeader) {
					reconciledHeaders.push({
						...schemaHeader,
						id: savedHeader.id || schemaHeader.id,
						visible:
							typeof savedHeader.visible === 'boolean' ? savedHeader.visible : schemaHeader.visible
					});
					addedNames.add(savedHeader.name);
				}
			}
			for (const schemaHeader of headers) {
				if (!addedNames.has(schemaHeader.name)) {
					reconciledHeaders.push({ ...schemaHeader, visible: true });
				}
			}
			return reconciledHeaders;
		}

		return headers.map((h) => ({ ...h, visible: true }));
	}

	/** Cheapest equality check that still catches reorders/visibility flips. */
	function sameTableHeaders(a: TableHeader[], b: TableHeader[]): boolean {
		if (a.length !== b.length) return false;
		return a.every(
			(header, index) =>
				header.id === b[index].id &&
				header.name === b[index].name &&
				header.visible === b[index].visible
		);
	}

	// displayTableHeaders are the actual headers shown, considering the user's
	// order/visibility preferences from localStorage. Seeded during init so SSR
	// emits the real column set — an effect left the server-rendered table with
	// a single checkbox column that expanded on hydration (a whole-table reflow).
	let displayTableHeaders: TableHeader[] = $state(
		untrack(() =>
			reconcileTableHeaders(tableHeaders, entryListPaginationSettings, initialCollectionId)
		)
	);

	$effect(() => {
		// Re-sync only when the schema or the saved settings actually changed.
		const currentCollId = currentCollection?._id ? String(currentCollection._id) : null;
		const nextHeaders = reconcileTableHeaders(
			tableHeaders,
			entryListPaginationSettings,
			currentCollId
		);

		if (sameTableHeaders(displayTableHeaders, nextHeaders)) return;
		displayTableHeaders = nextHeaders;
	});

	const visibleTableHeaders = $derived(displayTableHeaders.filter((header) => header.visible));

	const cellPaddingClass = $derived(smartTable.cellPaddingClass);

	function measureHeaderColumns(): void {
		const container = scrollContainerEl;
		if (!container || smartTable.viewMode !== 'table') return;

		// RTL scroll offsets are negative from the right edge in modern engines, so
		// the physical left-to-right offsets below would not match. Keep the full
		// table instead of risking misplaced cells.
		if (browser && document.documentElement.dir === 'rtl') {
			headerColumnOffsets = [];
			headerColumnWidths = [];
			return;
		}

		const cells = container.querySelectorAll<HTMLTableCellElement>('thead tr:last-child th');
		if (cells.length !== visibleTableHeaders.length) {
			headerColumnOffsets = [];
			headerColumnWidths = [];
			return;
		}

		const widths: number[] = [];
		const offsets: number[] = [];
		let left = 0;
		for (const cell of cells) {
			const width = cell.offsetWidth;
			widths.push(width);
			offsets.push(left);
			left += width;
		}

		// No layout engine (SSR/jsdom) or a collapsed table: every width is 0.
		if (!widths.some((width) => width > 0)) {
			headerColumnOffsets = [];
			headerColumnWidths = [];
			return;
		}

		headerColumnWidths = widths;
		headerColumnOffsets = offsets;
		// A layout change can clamp a stale horizontal offset (e.g. switching to a
		// narrower collection) without a scroll event; resync while measuring.
		tableScrollLeft = container.scrollLeft;
		tableViewportWidth = container.clientWidth || 0;
	}

	// Measure once per column set/order, persisted width, density or table↔card
	// switch; ResizeObserver covers container resizes without re-reading layout on
	// every scroll event.
	$effect(() => {
		const inTable = smartTable.viewMode === 'table';
		const container = scrollContainerEl;
		const layoutSignature = visibleTableHeaders
			.map((header) => `${header.id}:${header.name ?? ''}`)
			.join('|');
		const widthSignature = Object.values(smartTable.columnWidths).join(',');
		void layoutSignature;
		void widthSignature;
		void cellPaddingClass;
		// The filter row's `min-w-28` inputs can widen columns when it appears.
		void filterShow;

		if (!inTable || !container) {
			headerColumnOffsets = [];
			headerColumnWidths = [];
			tableViewportWidth = 0;
			return;
		}

		measureHeaderColumns();

		if (typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(() => measureHeaderColumns());
		observer.observe(container);
		return () => observer.disconnect();
	});

	const columnWindow = $derived.by(() => {
		if (
			smartTable.viewMode === 'table' &&
			headerColumnWidths.length === visibleTableHeaders.length
		) {
			const window = computeColumnWindow({
				offsets: headerColumnOffsets,
				widths: headerColumnWidths,
				viewportWidth: tableViewportWidth,
				scrollLeft: tableScrollLeft
			});
			if (window.active) return window;
		}

		// No window (card view, narrow table, SSR/jsdom): the full column set.
		return {
			start: 0,
			end: visibleTableHeaders.length,
			leadingCount: 0,
			trailingCount: 0,
			leadingWidth: 0,
			trailingWidth: 0,
			active: false
		};
	});

	/**
	 * Start inset for the toolbar/title row. Mirrors `PageTitle` (`ps-5 md:ps-10`)
	 * so the collection title clears the left sidebar's floating expand/collapse
	 * toggle, which protrudes 16px past the sidebar edge (`-inset-e-4`, 40px
	 * wide). Facets and the table stay at `CONTENT_PADDING`: the title sits one
	 * step further in, exactly like `AdminPageShell` pages (e.g. /mediagallery).
	 */
	const titleInset = $derived(ui.state.leftSidebar === 'hidden' ? 'ps-2 sm:ps-3' : 'ps-5 md:ps-10');

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
				const currentValue = collections.activeValue;
				if (currentValue && Object.keys(currentValue).length > 0) {
					setCollectionValue({});
				}
				const currentCollId = collections.active?._id;
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
		// Seed every declared field (schema default, else null). A missing key
		// reaches the widgets as `bind:value={undefined}`, which throws
		// props_invalid_value for any prop that declares a fallback.
		for (const field of currentCollection?.fields ?? []) {
			if (!field || typeof field !== 'object') continue;
			const fieldName = getFieldName(field as any, false);
			if (!fieldName || fieldName === 'unknown_field') continue;
			newEntry[fieldName] = (field as { default?: unknown }).default ?? null;
		}
		if (collections.active?.status) {
			newEntry.status = collections.active.status;
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
	const onUnpublish = () =>
		setEntriesStatus(getSelectedIds(), StatusTypes.unpublish, onActionSuccess);
	const onDraft = () => setEntriesStatus(getSelectedIds(), StatusTypes.draft, onActionSuccess);
	// Delete = move to the Trash (soft delete), which is the only restorable-delete path the
	// app implements (Config → Trash + /api/trash/restore). It used to send
	// `status: "archive"`, so nothing ever reached the Trash and the dialog offered to
	// "Archive" while the button said Delete (BUG M5).
	//
	// IRREVERSIBLE PATHS — read before changing `permanent`:
	// - The Archived view passes `showDeleted` through (entry-list-multi-button.svelte:482
	//   `deleteAction(showDeleted)`), so Delete there is `permanent = true`: a real DELETE.
	//   That is intentional (the Trash lists `isDeleted` rows, an archived row is not one)
	//   and it is why the dialog says "Delete" in that view only.
	// - With `USE_ARCHIVE_ON_DELETE` off or undefined, EVERY delete is permanent — the
	//   list's Delete button destroys rows even though its label says Delete/Trash nowhere.
	// - Otherwise one dialog + `deleteEntries` (entry-actions.ts) handle the request count:
	//   1 request for the selection, per-row DELETEs only if the schema sets
	//   `disableBulkDelete`.
	const onDelete = (permanentRequest = false) => {
		const selectedIds = getSelectedIds();
		if (!selectedIds.length) {
			toast.warning('No entries selected');
			return;
		}

		const permanent = permanentRequest || !(publicEnv?.USE_ARCHIVE_ON_DELETE ?? false);

		showDeleteConfirm({
			isArchive: false,
			itemType: 'entry',
			count: selectedIds.length,
			// Soft delete → the dialog must say so instead of "Delete 2 entries".
			restorable: !permanent,
			description: permanent
				? 'This cannot be undone.'
				: 'The entries move to the Trash and can be restored from Config → Trash.',
			onConfirm: async () => {
				await deleteEntries(selectedIds, permanent, onActionSuccess);
			}
		});
	};

	const onClone = () => cloneEntries(getSelectedRawEntries(), onActionSuccess);

	let isBulkEditOpen = $state(false);

	const onBulkEdit = () => {
		const selectedIds = getSelectedIds();
		if (!selectedIds.length) {
			toast.warning('No entries selected');
			return;
		}
		isBulkEditOpen = true;
	};

	const handleApplyBulkEdit = async (updates: Record<string, unknown>) => {
		const selectedIds = getSelectedIds();
		await bulkEditEntries(selectedIds, updates, onActionSuccess);
	};

	const onSchedule = (date: string) => {
		const payload = { _scheduled: new Date(date).getTime() };
		setEntriesStatus(getSelectedIds(), StatusTypes.draft, onActionSuccess, payload);
	};

	// Advanced Filters State & Handler
	let isAdvancedFilterOpen = $state(false);
	let advancedFilterClauses = $state<AdvancedFilterClause[]>([]);
	let advancedFilterConjunction = $state<'AND' | 'OR'>('AND');

	function handleApplyAdvancedFilters(clauses: AdvancedFilterClause[], conjunction: 'AND' | 'OR') {
		advancedFilterClauses = clauses;
		advancedFilterConjunction = conjunction;
		if (conjunction === 'AND') {
			for (const clause of clauses) {
				if (!clause.field) continue;
				if (clause.operator === 'equals' || clause.operator === 'contains') {
					smartFilter.setFilter(clause.field, clause.value);
				} else if (clause.operator === 'gt' || clause.operator === 'gte') {
					smartFilter.setFilter(clause.field, `${clause.value}:`);
				} else if (clause.operator === 'lt' || clause.operator === 'lte') {
					smartFilter.setFilter(clause.field, `:${clause.value}`);
				}
			}
			updateURL({
				...smartFilter.toURLParams(),
				filterLogic: null,
				page: '1'
			});
			return;
		}
		updateURL({
			filterLogic: JSON.stringify({
				combinator: conjunction,
				rules: clauses.map((c) => ({
					field: c.field,
					operator: c.operator,
					value: c.value
				}))
			}),
			page: '1'
		});
	}

	// Export Filtered Selection (Alt + X)
	function exportData() {
		exportEntriesToCsv({
			items: smartTable.hasSelections
				? (smartTable.getSelectedRows() as CollectionEntry[])
				: tableData,
			visibleHeaders: visibleTableHeaders,
			fallbackHeaders: tableHeaders,
			collectionName: currentCollection?.name
		});
	}

	// Keyboard Grid Navigation (ATAG / WCAG 2.2 AA)
	let focusedRowIndex = $state<number>(0);
	let focusedColIndex = $state<number>(0);

	/**
	 * Scroll the body-cell viewport so the keyboard-focused column is rendered.
	 * Only an active window can hide a column; narrow/inactive tables render the
	 * full row, so there is nothing to reveal and no scroll is issued.
	 */
	function revealFocusedColumn(): void {
		const container = scrollContainerEl;
		const index = focusedColIndex;
		if (
			!container ||
			!columnWindow.active ||
			index < 0 ||
			index >= headerColumnOffsets.length ||
			index >= headerColumnWidths.length
		) {
			return;
		}

		const offset = headerColumnOffsets[index] ?? 0;
		const width = headerColumnWidths[index] ?? 0;
		const viewportWidth = container.clientWidth || 0;
		if (width <= 0 || viewportWidth <= 0) return;

		const scrollLeft = container.scrollLeft;
		if (offset < scrollLeft) {
			container.scrollLeft = offset;
		} else if (offset + width > scrollLeft + viewportWidth) {
			container.scrollLeft = offset + width - viewportWidth;
		}

		// Sync immediately: the browser scroll event that follows is asynchronous,
		// so the derived window would otherwise lag one tick behind the focus ring.
		tableScrollLeft = container.scrollLeft;
		tableViewportWidth = container.clientWidth || 0;
	}

	function handleTableKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement | null;
		if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;

		if (e.altKey && (e.key === 'x' || e.key === 'X')) {
			e.preventDefault();
			exportData();
			return;
		}

		if (tableData.length === 0) return;
		const colCount = Math.max(1, visibleTableHeaders.length);

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				focusedRowIndex = Math.min(tableData.length - 1, focusedRowIndex + 1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				focusedRowIndex = Math.max(0, focusedRowIndex - 1);
				break;
			case 'ArrowRight':
				e.preventDefault();
				focusedColIndex = Math.min(colCount - 1, focusedColIndex + 1);
				revealFocusedColumn();
				break;
			case 'ArrowLeft':
				e.preventDefault();
				focusedColIndex = Math.max(0, focusedColIndex - 1);
				revealFocusedColumn();
				break;
			case 'Home':
				e.preventDefault();
				if (e.ctrlKey) focusedRowIndex = 0;
				focusedColIndex = 0;
				revealFocusedColumn();
				break;
			case 'End':
				e.preventDefault();
				if (e.ctrlKey) focusedRowIndex = tableData.length - 1;
				focusedColIndex = colCount - 1;
				revealFocusedColumn();
				break;
			case 'PageDown':
				e.preventDefault();
				focusedRowIndex = Math.min(tableData.length - 1, focusedRowIndex + 10);
				break;
			case 'PageUp':
				e.preventDefault();
				focusedRowIndex = Math.max(0, focusedRowIndex - 10);
				break;
			case ' ':
				e.preventDefault();
				if (focusedRowIndex >= 0 && focusedRowIndex < tableData.length) {
					smartTable.toggleSelectIndex(focusedRowIndex);
				}
				break;
			case 'Enter': {
				e.preventDefault();
				const entryToOpen = tableData[focusedRowIndex];
				if (entryToOpen) void openEntryForEdit(entryToOpen);
				break;
			}
		}
	}

	/**
	 * Entry id whose editor is currently loading — guards double clicks.
	 */
	let openingEntryId = $state<string | null>(null);

	/**
	 * Shared row activation (table click/`Enter`, card click/`Enter`, edit
	 * button): open the entry in edit mode.
	 *
	 * A list row is a DISPLAY projection — one language, formatted for the
	 * table. Seeding the editor with it emptied the rich-text body, showed "-"
	 * in every empty cell and wrote that projection back over the stored
	 * document on save (destroying the localizations). So the form is filled
	 * from the stored document instead: exactly one point read per activation,
	 * none per row, and nothing in a render path.
	 */
	async function openEntryForEdit(entry: CollectionEntry): Promise<void> {
		const entryId = entry?._id ? String(entry._id) : '';
		const collectionId = currentCollection?._id ? String(currentCollection._id) : '';
		if (!entryId || !collectionId || openingEntryId) return;

		openingEntryId = entryId;
		try {
			// A list row is a DISPLAY projection — one language, formatted for the
			// table. Seeding the editor with it emptied the rich-text body, showed
			// "-" in every empty cell and wrote that projection back over the stored
			// document on save (blocker B2). So the form is filled from the stored
			// document: exactly one point read per activation, none per row.
			const loaded = await loadEntryFormValues({
				collectionId,
				entryId,
				fields: currentCollection?.fields,
				language: (contentLanguage.value as string) || propContentLanguage || 'en',
				readEntry: getEntry
			});

			if (!loaded.ok) {
				logger.error(`[Edit] Could not load entry ${entryId}: ${loaded.error}`);
				toast.error(`Could not open this entry: ${loaded.error}`);
				return;
			}

			modeTransitionGuard.setMode('edit');
			setCollectionValue(loaded.values);
			reflectModeInURL('edit', entryId);
			logger.debug(`[Edit] Loaded stored document for entry ${entryId}`);
		} finally {
			openingEntryId = null;
		}
	}

	$effect(() => {
		if (browser) {
			const onGlobalKeydown = (e: KeyboardEvent) => {
				if (e.altKey && (e.key === 'x' || e.key === 'X')) {
					e.preventDefault();
					exportData();
				}
			};
			window.addEventListener('keydown', onGlobalKeydown);
			return () => window.removeEventListener('keydown', onGlobalKeydown);
		}
	});

	/**
	 * Hand over the per-collection UI state when the table updates in place.
	 *
	 * `{#key}` used to remount EntryList on every collection switch, which reset
	 * selection, layout and scroll for free. The table now keeps its component
	 * instance, so the controller layout key and the persisted settings must be
	 * swapped explicitly — otherwise the next collection inherits the previous
	 * one's selection, column widths, scroll offset and local filters.
	 */
	function resetForCollection(collectionId: string | null): void {
		smartTable.setLayoutKey(collectionId ? `entry-list:${collectionId}` : 'entry-list');
		smartTable.clearSelection();
		smartTable.setPage(1, { emit: false });
		smartTable.virtual.onScroll(0, scrollContainerEl?.clientHeight ?? 0);

		entryListPaginationSettings = loadPaginationSettings(collectionId);
		displayTableHeaders = reconcileTableHeaders(
			tableHeaders,
			entryListPaginationSettings,
			collectionId
		);

		if (scrollContainerEl) scrollContainerEl.scrollTop = 0;

		focusedRowIndex = 0;
		focusedColIndex = 0;
		openingEntryId = null;
		showDeleted = false;
		expand = false;
		columnShow = false;
		isBulkEditOpen = false;
		isAdvancedFilterOpen = false;
		advancedFilterClauses = [];
		advancedFilterConjunction = 'AND';

		// The URL is authoritative for search/filters: clear the previous
		// collection's values, then replay the current URL (filters that are not
		// in the URL must not survive the switch).
		smartFilter.clearAll();
		smartFilter.syncFromURL(page.url.searchParams);
		entryListPaginationSettings.filters = smartFilter.toPlainObject();
		globalSearchValue = page.url.searchParams.get('search') || '';
		filterShow = smartFilter.activeCount > 0;

		clearTimeout(filterTimeoutId);
		clearTimeout(searchTimeoutId);
	}

	let syncedCollectionId = untrack(() => initialCollectionId);

	$effect.pre(() => {
		const nextCollectionId = currentCollection?._id ? String(currentCollection._id) : null;
		if (nextCollectionId === untrack(() => syncedCollectionId)) return;

		untrack(() => {
			syncedCollectionId = nextCollectionId;
			resetForCollection(nextCollectionId);
		});
	});
</script>

<!--Table -->
{#if !currentCollection}
	<div
		class="dark:bg-error-500/10 flex h-64 flex-col items-center justify-center rounded border border-error-500 bg-error-500/10 p-8"
	>
		<svg
			aria-hidden="true"
			class="mb-4 h-16 w-16 text-error-500"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
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
	<!-- Header Bar -->
	<div class="mb-1 flex flex-wrap items-center justify-between gap-3 {titleInset} ">
		<!-- Left: Sidebar Toggle, Title, Category Breadcrumb, Count -->
		<div class="flex flex-1 items-center gap-3 min-w-0">
			{#if ui.state.leftSidebar === 'hidden'}
				<Button
					variant="outline"
					type="button"
					onclick={() => ui.toggle('leftSidebar', screen.isDesktop ? 'full' : 'collapsed')}
					aria-label="open-sidebar"
					class="h-9 w-9 p-0 flex items-center justify-center rounded-lg border border-(--admin-border-default)"
				>
					<iconify-icon icon="mingcute:menu-fill" width="20"></iconify-icon>
				</Button>
			{/if}

			<div class="flex flex-col min-w-0">
				{#if categoryName}
					<span class="text-[11px] font-medium uppercase truncate">{categoryName}</span>
				{/if}
				<div class="flex items-center gap-2">
					<iconify-icon icon={collectionIcon} width="22" class="text-primary-500 shrink-0"
					></iconify-icon>
					{#if currentCollection?.name}
						<h1
							class="text-lg md:text-xl font-bold tracking-tight text-(--admin-text-body) truncate"
						>
							{currentCollection.name}
						</h1>
					{/if}
					{#if collectionStats}
						<span
							class="rounded-full bg-surface-200 dark:bg-surface-800 px-2 py-0.5 text-xs font-semibold text-surface-600 dark:text-surface-300"
						>
							{collectionStats.count}
						</span>
					{/if}
				</div>
			</div>
		</div>
		<!-- Table Controls: inline from sm+ (mobile uses the expand block below) -->
		<div class="hidden sm:flex flex-wrap items-center justify-center gap-2 min-w-0">
			<TableFilter
				bind:globalSearchValue
				bind:filterShow
				bind:columnShow
				bind:density={entryListPaginationSettings.density}
				bind:viewMode={smartTable.viewMode}
				showViewMode={true}
				onViewModeChange={(m) => smartTable.setViewMode(m)}
			/>
			<SmartTableSavedViewsMenu
				scope={viewsScope}
				getSnapshot={getSavedViewSnapshot}
				onApply={applySavedView}
			/>
		</div>

		<!-- Language & Metrics Badge: inline from sm+ -->
		<div class="hidden sm:flex items-center gap-2 shrink-0">
			<SmartTableMetricsBadge summary={listMetrics} />
			<TranslationStatus />
		</div>

		<!-- Right: Action Buttons (Create / MultiButton) -->
		<div class="flex flex-1 items-center justify-end gap-2">
			<!-- Mobile Filter Toggle -->
			<Button
				variant="outline"
				type="button"
				onclick={() => (expand = !expand)}
				aria-label="expand-collapse-filters"
				class="h-10 px-3 rounded-(--admin-radius-input) sm:hidden border border-(--admin-border-default)"
			>
				<iconify-icon icon="material-symbols:filter-list-rounded" width="20"></iconify-icon>
			</Button>

			<!-- MultiButton Group -->
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
				bulkEdit={onBulkEdit}
				exportSelection={exportData}
				create={onCreate}
			/>
		</div>
	</div>

	<!-- Mobile Expanded Filters -->
	{#if expand}
		<div
			class="mb-3 flex flex-wrap items-center justify-center gap-2 sm:hidden p-2 rounded-xl border border-(--admin-border-default) bg-(--admin-bg-card)"
		>
			<TableFilter
				bind:globalSearchValue
				bind:filterShow
				bind:columnShow
				bind:density={entryListPaginationSettings.density}
				bind:viewMode={smartTable.viewMode}
				showViewMode={true}
				onViewModeChange={(m) => smartTable.setViewMode(m)}
			/>
			<SmartTableSavedViewsMenu
				scope={viewsScope}
				getSnapshot={getSavedViewSnapshot}
				onApply={applySavedView}
			/>
			<SmartTableMetricsBadge summary={listMetrics} />
			<TranslationStatus />
		</div>
	{/if}

	<!-- Status facet chips (server counts; streamed promise never rejects → {} fallback).
	     Horizontal padding comes from CONTENT_PADDING so the chips line up with the
	     table instead of touching the sidebar border. -->
	<div class="mb-1 shrink-0 {CONTENT_PADDING}">
		{#await statusFacets}
			<SmartTableStatusFacets
				facets={{}}
				active={activeStatusFacet}
				onSelect={onStatusFacetSelect}
			/>
		{:then facets}
			<SmartTableStatusFacets {facets} active={activeStatusFacet} onSelect={onStatusFacetSelect} />
		{:catch}
			<SmartTableStatusFacets
				facets={{}}
				active={activeStatusFacet}
				onSelect={onStatusFacetSelect}
			/>
		{/await}
	</div>

	{#if columnShow}
		<EntryListColumnManager
			{displayTableHeaders}
			onHeadersChange={handleHeadersChange}
			onResetView={handleResetView}
		/>
	{/if}

	<div class="flex min-h-0 flex-1 flex-col {CONTENT_PADDING}">
		<AdminCard class="mt-0.5 flex h-full min-h-0 w-full flex-col" data-testid="entry-list-card">
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
					{pagesCount}
					{totalItems}
					{onUpdatePage}
					{onUpdateRowsPerPage}
					urlPageParam="page"
					class="min-h-0 flex-1"
				>
					{#snippet emptyAction()}
						<Button
							variant="outline"
							size="sm"
							onclick={onClearAllFilters}
							aria-label="Clear all filters"
						>
							Clear filters
						</Button>
					{/snippet}

					{#if smartTable.viewMode === 'card'}
						<EntryListCardGrid
							{tableData}
							{visibleRows}
							{visibleTableHeaders}
							{filterShow}
							{smartFilter}
							{focusedRowIndex}
							bind:scrollContainerEl
							isSelected={(id) => smartTable.isSelected(id)}
							toggleSelect={(id) => smartTable.toggleSelect(id)}
							{openEntryForEdit}
							{onFilterChange}
							{onClearAllFilters}
							{onClearFilter}
							onOpenAdvanced={() => (isAdvancedFilterOpen = true)}
							advancedCount={advancedFilterClauses.length}
							{handleTableKeydown}
							{onVirtualScroll}
						/>
					{:else}
						<!-- Scrollable grid region: `tabindex="0"` + keydown are what make keyboard
				     scrolling (WCAG 2.1.1) and arrow-key cell navigation possible; `role="region"`
				     plus the aria-label carry the semantics — the element is intentionally focusable. -->
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
						<div
							bind:this={scrollContainerEl}
							onscroll={onVirtualScroll}
							onkeydown={handleTableKeydown}
							tabindex="0"
							role="region"
							aria-label="Collection entries table"
							class="{SMART_TABLE_SCROLL} max-h-none overflow-x-auto focus:outline-hidden"
						>
							<table class="{SMART_TABLE} min-w-max" role="grid" aria-label="Collection entries">
								<!-- Table Header -->
								<thead class={SMART_TABLE_THEAD}>
									{#if filterShow && visibleTableHeaders.length > 0}
										<SmartFilterRow
											headers={visibleTableHeaders}
											definitions={smartFilter.definitions}
											filters={smartFilter.filters}
											activeFilters={smartFilter.activeFilters}
											{onFilterChange}
											onClearAll={onClearAllFilters}
											{onClearFilter}
											onOpenAdvanced={() => (isAdvancedFilterOpen = true)}
											advancedCount={advancedFilterClauses.length}
										/>
									{/if}

									<tr
										class="border-b border-surface-500/30 text-xs uppercase tracking-wide dark:border-surface-600"
									>
										<TableIcons
											cellClass={`w-10 ${pinCellClass('start')} ${hasSelections ? 'bg-primary-500/10 dark:bg-primary-500/20' : ''}`}
											checked={SelectAll.value}
											onCheck={(checked: boolean) => {
												SelectAll.value = checked;
											}}
										/>

										{#each visibleTableHeaders as header (header.id)}
											{@const colKey = ((header as TableHeader).name || header.id) as string}
											{@const rankInfo = smartTable.getSortRank(colKey)}
											{@const isActiveSort = rankInfo !== null}
											<th
												class="{SMART_TABLE_TH} relative min-w-20 overflow-hidden {cellPaddingClass}"
												style={smartTable.getColumnWidthStyle(colKey)}
												aria-sort={isActiveSort
													? rankInfo.direction === 1
														? 'ascending'
														: rankInfo.direction === -1
															? 'descending'
															: 'none'
													: 'none'}
											>
												<button
													type="button"
													class="inline-flex max-w-full min-w-0 items-center justify-center gap-1 rounded px-1 py-1 font-semibold tracking-wider focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 {isActiveSort
														? 'text-primary-600 dark:text-primary-400 font-bold'
														: 'text-tertiary-500 dark:text-primary-500 hover:text-surface-500'}"
													onclick={(e) => onSortChange(colKey, e.shiftKey)}
													aria-label="Sort by {(header as TableHeader).label}"
													title="Click to sort, Shift+Click to compose secondary sorts"
												>
													<span class="truncate">{(header as TableHeader).label}</span>
													{#if isActiveSort}
														{#if smartTable.multiSort.length > 1}
															<span
																class="inline-flex items-center justify-center rounded-full bg-primary-500/20 text-primary-600 dark:text-primary-400 text-[10px] w-4 h-4 font-bold"
															>
																{rankInfo.rank}
															</span>
														{/if}
														{@const sortIcon =
															rankInfo.direction === 1 ? 'mdi:arrow-up' : 'mdi:arrow-down'}
														<iconify-icon icon={sortIcon} width="14" class="shrink-0 origin-center"
														></iconify-icon>
													{/if}
												</button>
												<ColumnResizeHandle
													columnKey={colKey}
													onResize={smartTable.setColumnWidth}
												/>
											</th>
										{/each}
									</tr>
								</thead>
								<tbody class="divide-y divide-surface-200/30 dark:divide-surface-700/30">
									{#if useRowVirtualization && spacerTop > 0}
										<tr style="height: {spacerTop}px" aria-hidden="true"></tr>
									{/if}
									{#if tableData.length > 0}
										{#each visibleRows as entry, index (entry._id)}
											{@const rowId = String(entry._id ?? '')}
											{@const rowSelected = smartTable.isSelected(rowId)}
											{@const isFocused = focusedRowIndex === index}
											<tr
												class="group transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-inset {rowSelected
													? SMART_TABLE_ROW_SELECTED
													: SMART_TABLE_ROW_HOVER}"
												style={useRowVirtualization
													? 'content-visibility: auto; contain-intrinsic-size: 48px;'
													: undefined}
												aria-selected={rowSelected}
												tabindex={isFocused ? 0 : -1}
												onmouseenter={() =>
													entry._id && hoverPreloader.handleRowHoverStart(String(entry._id))}
												onmouseleave={hoverPreloader.handleRowHoverEnd}
												onclick={(e) => {
													const target = e.target as HTMLElement | null;
													if (target?.closest('button, input, a, [data-prevent-row-click]')) return;
													const originalEntry = tableData.find(
														(item: CollectionEntry) => item._id === entry._id
													);
													if (originalEntry) void openEntryForEdit(originalEntry);
												}}
											>
												<TableIcons
													cellClass={`w-10 text-center ${pinCellClass('start')} ${rowSelected ? 'bg-primary-500/10 dark:bg-primary-500/20' : ''}`}
													checked={rowSelected}
													onCheck={() => {
														if (rowId) smartTable.toggleSelect(rowId);
													}}
												/>
												{#if visibleTableHeaders}
													{#if columnWindow.active && columnWindow.leadingCount > 0}
														<td
															colspan={columnWindow.leadingCount}
															aria-hidden="true"
															style="width:{columnWindow.leadingWidth}px; min-width:{columnWindow.leadingWidth}px"
														></td>
													{/if}
													{#each visibleTableHeaders.slice(columnWindow.start, columnWindow.end) as header, sliceIdx (header.id)}
														{@const colIdx = columnWindow.start + sliceIdx}
														{@const cellKey = ((header as TableHeader).name || header.id) as string}
														{@const isFocusedCell = isFocused && focusedColIndex === colIdx}
														<td
															role="gridcell"
															dir="auto"
															aria-colindex={colIdx + 2}
															title={(header as TableHeader).name !== 'status'
																? 'Click to edit this entry'
																: 'Click to change status'}
															class="{SMART_TABLE_TD} {cellPaddingClass} text-sm {(
																header as TableHeader
															).name !== 'status'
																? 'cursor-pointer transition-colors duration-150'
																: ''} {isFocusedCell
																? 'group-focus-visible:ring-2 group-focus-visible:ring-primary-500 group-focus-visible:ring-inset'
																: ''}"
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
																				const collId = collections.active?._id;
																				if (!collId) return;
																				const result = await updateEntryStatus(
																					collId,
																					entry._id as string,
																					String(nextStatus)
																				);
																				if (result.success) {
																					toast.success(`Entry status updated to ${nextStatus}`);
																					onActionSuccess();
																				} else {
																					toast.error(
																						result.error || 'Failed to update entry status'
																					);
																				}
																			} catch (error) {
																				logger.error('Error updating entry status:', error);
																				toast.error(
																					'An error occurred while updating entry status'
																				);
																			}
																		}
																	});
																} else {
																	// Open the entry from the stored document (see openEntryForEdit):
																	// list rows are one-language display projections.
																	const originalEntry = tableData.find(
																		(e: CollectionEntry) => e._id === entry._id
																	);
																	if (originalEntry) void openEntryForEdit(originalEntry);
																}
															}}
														>
															{#if (header as TableHeader).name === 'status'}
																<div class="flex w-full items-center justify-center">
																	<Status value={entry.status || entry.raw_status || 'draft'} />
																</div>
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
																		{formatDisplayDate(
																			(entry as any)[(header as TableHeader).name || ''] as string,
																			undefined,
																			{
																				year: 'numeric',
																				month: 'short',
																				day: 'numeric'
																			}
																		)}
																	</div>
																	<div class="text-(--admin-text-muted)">
																		{formatDisplayDate(
																			(entry as any)[(header as TableHeader).name || ''] as string,
																			undefined,
																			{
																				hour: '2-digit',
																				minute: '2-digit',
																				second: '2-digit',
																				hour12: false
																			}
																		)}
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
																<Sanitize
																	html={String(
																		(entry as any)[(header as TableHeader).name || ''] || '-'
																	)}
																	profile="strict"
																/>
															{/if}
														</td>
													{/each}
													{#if columnWindow.active && columnWindow.trailingCount > 0}
														<td
															colspan={columnWindow.trailingCount}
															aria-hidden="true"
															style="width:{columnWindow.trailingWidth}px; min-width:{columnWindow.trailingWidth}px"
														></td>
													{/if}
												{/if}
											</tr>
										{/each}
										{#if useRowVirtualization && spacerBottom > 0}
											<tr style="height: {spacerBottom}px" aria-hidden="true"></tr>
										{/if}
									{:else}
										<tr>
											<td
												colspan={visibleTableHeaders.length + 1}
												class="p-4 text-center text-surface-500 dark:text-surface-50"
												>No results found.</td
											>
										</tr>
									{/if}
								</tbody>
							</table>
						</div>
					{/if}
				</SmartTableShell>
			{:else}
				<div class="py-10 text-center text-tertiary-500 dark:text-primary-500">
					<iconify-icon icon="bi:exclamation-circle-fill" width={24} class="mb-2"></iconify-icon>
					<p class="text-lg">
						{currentCollection?.name
							? EntryList_no_collection({ name: currentCollection.name })
							: 'No collection selected or collection is empty.'}
					</p>
				</div>
			{/if}
		</AdminCard>
	</div>
{/if}

{#if isBulkEditOpen}
	{#await loadBulkFieldEditModal() then { default: BulkFieldEditModal }}
		<BulkFieldEditModal
			bind:isOpen={isBulkEditOpen}
			selectedCount={smartTable.selectedCount}
			fields={currentCollection?.fields || []}
			onApply={handleApplyBulkEdit}
			onClose={() => (isBulkEditOpen = false)}
		/>
	{/await}
{/if}

{#if isAdvancedFilterOpen}
	{#await loadAdvancedFilterModal() then { default: AdvancedFilterModal }}
		<AdvancedFilterModal
			bind:isOpen={isAdvancedFilterOpen}
			fields={currentCollection?.fields || []}
			initialClauses={advancedFilterClauses}
			initialConjunction={advancedFilterConjunction}
			onApply={handleApplyAdvancedFilters}
			onClose={() => (isAdvancedFilterOpen = false)}
		/>
	{/await}
{/if}

<style>
	div::-webkit-scrollbar {
		width: 6px;
		height: 6px;
	}
	div::-webkit-scrollbar-track {
		background: transparent;
	}
	div::-webkit-scrollbar-thumb {
		background-color: rgba(156, 163, 175, 0.4);
		border-radius: 9999px;
	}
	div::-webkit-scrollbar-thumb:hover {
		background-color: rgba(156, 163, 175, 0.7);
	}
	:global(.dark) div::-webkit-scrollbar-thumb {
		background-color: rgba(75, 85, 99, 0.5);
	}
	:global(.dark) div::-webkit-scrollbar-thumb:hover {
		background-color: rgba(107, 114, 128, 0.8);
	}
</style>
