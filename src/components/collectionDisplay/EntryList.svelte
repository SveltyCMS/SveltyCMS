<!--
@file src/components/collectionDisplay/EntryList.svelte
@component
**EntryList component to display collections data.**

@example
<EntryList />

#### Props
- `collection` - The collection object to display data from.
- `mode` - The current mode of the component. Can be 'view', 'edit', 'create', 'delete', 'modify', or 'media'.

Features:
- Search
- Pagination
- Multi-select
- Sorting
- Status
- Icons
- Filter
-->

<script module lang="ts">
	export type SortOrder = 0 | 1 | -1; // Strict type for sort order
</script>

<script lang="ts">
	import { browser } from '$app/environment';
	import { untrack } from 'svelte';
	// Utils
	import { getData, invalidateCollectionCache, createEntry, updateEntryStatus, deleteEntry, batchDeleteEntries } from '@utils/apiClient';
	import { getCachedCollectionData } from '@utils/collections-prefetch';
	import { formatDisplayDate } from '@utils/dateUtils';
	import { debounce as debounceUtil, getFieldName, meta_data } from '@utils/utils';
	import { cloneEntries, setEntriesStatus } from '@utils/entryActions'; // Import centralized actions
	// Config
	import { publicEnv } from '@root/config/public';
	// Types
	import type { PaginationSettings, TableHeader } from '@components/system/table/TablePagination.svelte';
	import { StatusTypes } from '@src/content/types';
	// Stores
	import { screenSize } from '@src/stores/screenSizeStore.svelte';
	import { collection, collectionValue, contentStructure, mode, modifyEntry, statusMap } from '@stores/collectionStore.svelte';
	import { contentLanguage, systemLanguage } from '@stores/store.svelte';
	import { handleUILayoutToggle, toggleUIElement, uiStateManager } from '@stores/UIStore.svelte';
	import { globalLoadingStore, loadingOperations } from '@stores/loadingStore.svelte';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Components
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';
	import Status from '@components/system/table/Status.svelte';
	import TableFilter from '@components/system/table/TableFilter.svelte';
	import TableIcons from '@components/system/table/TableIcons.svelte';
	import TablePagination from '@components/system/table/TablePagination.svelte';
	import TranslationStatus from './TranslationStatus.svelte';
	import EntryListMultiButton from './EntryList_MultiButton.svelte';
	import Loading from '@components/Loading.svelte';
	// Skeleton
	import type { ModalSettings } from '@skeletonlabs/skeleton';
	import { getModalStore, getToastStore } from '@skeletonlabs/skeleton';
	import { page } from '$app/stores';

	// Initialize stores for modal  & toast
	const modalStore = getModalStore();
	const toastStore = getToastStore();

	// Svelte-dnd-action
	import { dndzone } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';

	const flipDurationMs = 300;

	// Simple ID generator for table headers (no need for crypto UUID)
	function generateId(): string {
		return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
	}

	function handleDndConsider(event: CustomEvent<{ items: TableHeader[] }>) {
		displayTableHeaders = event.detail.items;
	}
	function handleDndFinalize(event: CustomEvent<{ items: TableHeader[] }>) {
		displayTableHeaders = event.detail.items;
		// Immediately save settings after DnD operation
		savePaginationSettings();
	}

	// Pagination
	const defaultPaginationSettings = (collectionId: string | null): PaginationSettings => ({
		collectionId: collectionId,
		density: 'normal',
		sorting: { sortedBy: '', isSorted: 0 as SortOrder },
		currentPage: 1,
		rowsPerPage: 10,
		filters: {}, // Will be populated by an effect based on tableHeaders
		displayTableHeaders: []
	});
	let entryListPaginationSettings = $state<PaginationSettings>(defaultPaginationSettings(collection.value?._id ?? null));

	// Collection-specific initialization to track initial loads per collection
	let lastCollectionId = $state<string | null>(null);

	// Optimize state management with frozen objects for better performance
	let collectionState = $state.raw({
		isChanging: false,
		isInitializing: false,
		hasInitialLoad: false,
		stableDataExists: false
	});

	$effect(() => {
		// Load settings from localStorage when collectionId changes
		const currentCollId = collection.value?._id;

		// Only process if collection actually changed
		if (lastCollectionId === currentCollId) return;

		// Clear client cache when switching collections to prevent stale data
		if (lastCollectionId !== null && lastCollectionId !== currentCollId) {
			// Clear all cache to prevent cross-collection contamination
			clientCache.clear();
			// Also clear any cached fetch parameters to force fresh fetch
			lastFetchParams = null;
			// Clear current request to invalidate any in-flight requests
			currentRequestId = null;
			// Clear table data immediately to prevent showing old collection data
			tableData = [];
			pagesCount = 1;
			totalItems = 0;
			rawData = undefined;
			data = undefined;
			// console.log('[EntryList] Cleared cache due to collection change', {
			// 	from: lastCollectionId,
			// 	to: currentCollId
			// });
		}

		// Set flags to prevent pagination effect from triggering during collection change
		collectionState = {
			isChanging: true,
			isInitializing: true,
			hasInitialLoad: false,
			stableDataExists: false
		};

		if (browser && currentCollId) {
			const savedSettings = localStorage.getItem(`entryListPaginationSettings_${currentCollId}`);
			let newSettings: PaginationSettings = defaultPaginationSettings(currentCollId);

			if (savedSettings) {
				try {
					const parsed = JSON.parse(savedSettings) as Partial<PaginationSettings>;
					newSettings.collectionId = parsed.collectionId === currentCollId ? parsed.collectionId : currentCollId; // Ensure it's for the current collection
					newSettings.density = ['compact', 'normal', 'comfortable'].includes(parsed.density ?? '')
						? (parsed.density! as 'compact' | 'normal' | 'comfortable')
						: 'normal';
					newSettings.sorting = {
						sortedBy: typeof parsed.sorting?.sortedBy === 'string' ? parsed.sorting.sortedBy : '',
						isSorted: [0, 1, -1].includes(parsed.sorting?.isSorted ?? 0) ? (parsed.sorting!.isSorted as SortOrder) : (0 as SortOrder)
					};
					newSettings.currentPage = Number.isInteger(parsed.currentPage) && parsed.currentPage! > 0 ? parsed.currentPage! : 1;
					newSettings.rowsPerPage = Number.isInteger(parsed.rowsPerPage) && parsed.rowsPerPage! > 0 ? parsed.rowsPerPage! : 10;
					newSettings.filters = typeof parsed.filters === 'object' && parsed.filters !== null ? parsed.filters : {};

					if (Array.isArray(parsed.displayTableHeaders)) {
						newSettings.displayTableHeaders = parsed.displayTableHeaders.map(
							(header: Partial<TableHeader>): TableHeader => ({
								id: typeof header.id === 'string' && header.id ? header.id : generateId(),
								label: typeof header.label === 'string' ? header.label : 'Unknown Label',
								name: typeof header.name === 'string' ? header.name : 'unknown_name',
								visible: typeof header.visible === 'boolean' ? header.visible : true
							})
						);
					} else {
						newSettings.displayTableHeaders = [];
					}
				} catch (e) {
					console.warn('Failed to parse settings from localStorage, using defaults.', e);
					// newSettings remains defaultPaginationSettings(currentCollId)
				}
			}
			entryListPaginationSettings = { ...newSettings }; // Create new object for reactivity

			// Reset loading state for new collection and update tracking
			untrack(() => {
				// Don't set loading state here - let refreshTableData handle it
				// Clear client cache for new collection - do this FIRST
				clientCache.clear();
				// console.log('[EntryList] Cleared client cache during collection switch', {
				// 	newCollectionId: currentCollId,
				// 	cacheSize: clientCache.size
				// });
				// Immediately clear table data and related state to prevent showing old data
				tableData = [];
				pagesCount = 1;
				totalItems = 0;
				rawData = undefined;
				data = undefined;
				// Clear fetch parameters to ensure fresh fetch
				lastFetchParams = null;
				// Clear current request to invalidate any in-flight requests
				currentRequestId = null;
				// Clear selections
				Object.keys(selectedMap).forEach((key) => delete selectedMap[key]);
				SelectAll = false;
			});

			// Don't trigger data load here - let the consolidated effect handle it
			// The consolidated effect will detect the collection change and trigger the appropriate refresh

			// Clear flags after short delay to ensure proper state transitions
			setTimeout(() => {
				collectionState = {
					...collectionState,
					isChanging: false,
					isInitializing: false
				};
				// Update lastCollectionId AFTER clearing the flags
				lastCollectionId = currentCollId;
			}, 25); // Reduced timeout for faster collection transitions
		} else if (!currentCollId) {
			// No collection selected, reset to defaults for a null collectionId
			entryListPaginationSettings = defaultPaginationSettings(null);
			untrack(() => {
				lastCollectionId = null;
				loadingState = 'idle';
				tableData = [];
				pagesCount = 1;
				totalItems = 0;
				Object.keys(selectedMap).forEach((key) => delete selectedMap[key]);
				SelectAll = false;
			});
			// Clear flag after timeout for consistency
			setTimeout(() => {
				collectionState = {
					isChanging: false,
					isInitializing: false,
					hasInitialLoad: false,
					stableDataExists: false
				};
			}, 25); // Reduced timeout for faster transitions
		}
	});

	// Enhanced loading state management for flicker-free transitions
	let loadingState = $state<'idle' | 'loading' | 'error'>('idle');

	// Simplified stable state management - now using frozen state
	let showDeleted = $state(false); // Controls whether to view active or archived entries
	let rawData = $state<{ items: any[]; totalPages?: number; total?: number } | undefined>();

	let globalSearchValue = $state('');
	let expand = $state(false);
	let filterShow = $state(false);
	let columnShow = $state(false);

	// Optimized derived states with memoization
	const currentStates = $derived.by(() => ({
		language: contentLanguage.value,
		systemLanguage: systemLanguage.value,
		mode: mode.value,
		collection: collection.value,
		screenSize: screenSize.value
	}));

	// Destructure for easier access
	const currentLanguage = $derived(currentStates.language);
	const currentSystemLanguage = $derived(currentStates.systemLanguage);
	const currentMode = $derived(currentStates.mode);
	const currentCollection = $derived(currentStates.collection);
	const currentScreenSize = $derived(currentStates.screenSize);

	// Computed loading states - simplified for better UX
	let isLoading = $derived(loadingState === 'loading');

	// Optimized table headers with better caching
	const tableHeaders = $derived.by((): TableHeader[] => {
		if (!currentCollection?.fields) return [];

		// Cache key for memoization
		const cacheKey = `${currentCollection._id}-${currentCollection.fields.length}`;

		const schemaHeaders: TableHeader[] = currentCollection.fields.map(
			(field: any): TableHeader => ({
				id: `${cacheKey}-${getFieldName(field)}`,
				label: field.label,
				name: getFieldName(field),
				visible: true // Default visibility
			})
		);

		// System headers with consistent IDs
		const systemHeaders: TableHeader[] = [
			{ id: `${cacheKey}-createdAt`, label: 'createdAt', name: 'createdAt', visible: true },
			{ id: `${cacheKey}-updatedAt`, label: 'updatedAt', name: 'updatedAt', visible: true },
			{ id: `${cacheKey}-status`, label: 'status', name: 'status', visible: true }
		];

		return [...schemaHeaders, ...systemHeaders];
	});

	// Effect to initialize/update the filters object in paginationSettings when tableHeaders change
	$effect(() => {
		if (tableHeaders.length > 0) {
			const newFilters: Record<string, string> = { ...entryListPaginationSettings.filters };
			let filtersChanged = false;
			for (const th of tableHeaders) {
				if (!(th.name in newFilters)) {
					newFilters[th.name] = ''; // Initialize with empty string if not present
					filtersChanged = true;
				}
			}
			if (filtersChanged) {
				entryListPaginationSettings.filters = newFilters;
			}
		} else {
			// No table headers, clear filters
			if (Object.keys(entryListPaginationSettings.filters).length > 0) {
				entryListPaginationSettings.filters = {};
			}
		}
	});

	// displayTableHeaders are the actual headers shown, considering user's order/visibility preferences from localStorage
	let displayTableHeaders = $state<TableHeader[]>([]);

	$effect(() => {
		// Sync displayTableHeaders with settings or defaults from tableHeaders
		const currentCollId = currentCollection?._id;
		untrack(() => {
			// Avoid self-triggering loop if displayTableHeaders itself is changed by DND
			const settings = entryListPaginationSettings;
			if (tableHeaders.length > 0) {
				// If settings for current collection exist and have displayTableHeaders, use them
				if (settings.collectionId === currentCollId && Array.isArray(settings.displayTableHeaders) && settings.displayTableHeaders.length > 0) {
					// Reconcile saved headers with current schema headers
					// This ensures that if schema changes (e.g. field removed/added), it's handled gracefully
					const schemaHeaderMap = new Map(tableHeaders.map((th) => [th.name, th]));
					const reconciledHeaders: TableHeader[] = [];
					const addedNames = new Set<string>();

					// First, add headers from saved settings that still exist in the schema, maintaining saved order and visibility
					for (const savedHeader of settings.displayTableHeaders) {
						const schemaHeader = schemaHeaderMap.get(savedHeader.name);
						if (schemaHeader) {
							reconciledHeaders.push({
								...schemaHeader, // Base properties from schema (like id, label)
								id: savedHeader.id || schemaHeader.id, // Prefer saved ID if available
								visible: typeof savedHeader.visible === 'boolean' ? savedHeader.visible : schemaHeader.visible // Prefer saved visibility
							});
							addedNames.add(savedHeader.name);
						}
					}
					// Then, add any new headers from the schema that weren't in saved settings
					for (const schemaHeader of tableHeaders) {
						if (!addedNames.has(schemaHeader.name)) {
							reconciledHeaders.push({ ...schemaHeader, visible: true }); // New headers are visible by default
						}
					}
					displayTableHeaders = reconciledHeaders;
				} else {
					// No specific settings for these headers, or collection changed: use default from tableHeaders
					displayTableHeaders = tableHeaders.map((h) => ({ ...h, visible: true }));
				}
			} else {
				// No schema headers
				displayTableHeaders = [];
			}
		});
	});

	let visibleTableHeaders = $derived(displayTableHeaders.filter((header) => header.visible));

	let selectAllColumns = $state(true); // For the "select all columns to show" checkbox
	$effect(() => {
		// Sync checkbox with actual column visibility
		selectAllColumns = displayTableHeaders.length > 0 ? displayTableHeaders.every((h) => h.visible) : false;
	});

	let data = $state<{ items: any[]; totalPages?: number; total?: number } | undefined>();
	let tableData = $state<any[]>([]); // Processed data for rendering
	let pagesCount = $state(1);
	let totalItems = $state(0);

	let SelectAll = $state(false); // For the "select all rows" checkbox in table header
	const selectedMap: Record<string, boolean> = $state({}); // Using string keys for index

	// Add client-side caching with size limits to reduce API calls
	let clientCache = $state<Map<string, { items: any[]; totalPages: number; total: number; timestamp: number }>>(new Map());
	const MAX_CACHE_SIZE = 50; // Limit cache entries
	const CACHE_TTL = 5 * 60 * 1000; // 5 minutes TTL

	// Track last fetch parameters to prevent redundant calls
	let lastFetchParams = $state<string | null>(null);
	let lastFetchTime = $state<number>(0);
	let currentRequestId = $state<string | null>(null);
	const MIN_REFRESH_INTERVAL = 1000; // Minimum 1 second between refreshes

	// Generate a cache key for current fetch parameters
	function getCurrentFetchKey(): string {
		const currentCollId = currentCollection?._id;
		if (!currentCollId) return '';

		const { currentPage, rowsPerPage, filters, sorting } = entryListPaginationSettings;
		const activeFilters: Record<string, string> = {};
		for (const key in filters) {
			if (filters[key]) activeFilters[key] = filters[key];
		}

		// Include show deleted state
		if (!showDeleted) {
			activeFilters.status = '!=deleted';
		}

		const sortParam = sorting.isSorted && sorting.sortedBy ? { [sorting.sortedBy]: sorting.isSorted } : {};

		// Include collection name and more unique identifiers to ensure cache uniqueness across collections
		const collectionName = currentCollection?.name || 'unknown';

		return JSON.stringify({
			collectionId: currentCollId,
			collectionName, // Add collection name for extra uniqueness
			collectionHash: currentCollId.slice(-8), // Use last 8 chars of ID as additional uniqueness
			page: currentPage,
			pageSize: rowsPerPage,
			language: currentLanguage,
			filters: activeFilters,
			sort: sortParam,
			showDeleted
		});
	}

	async function refreshTableData(fetchNewData = true): Promise<void> {
		// Get current collection
		const currentCollId = currentCollection?._id;

		// Check if this is a redundant call
		const currentFetchKey = getCurrentFetchKey();
		const now = Date.now();

		// If no collection, clear data and reset state only when switching away from a collection
		if (!currentCollId) {
			if (lastCollectionId !== null) {
				// Only clear data when actually switching away from a collection
				tableData = [];
				pagesCount = 1;
				totalItems = 0;
				rawData = undefined;
				data = undefined;
				Object.keys(selectedMap).forEach((key) => delete selectedMap[key]);
				SelectAll = false;
				// Update collection state atomically
				collectionState = {
					...collectionState,
					stableDataExists: false,
					hasInitialLoad: false
				};
				lastCollectionId = null;
				lastFetchParams = null;
			}
			loadingState = 'idle';
			return;
		}

		// Fetch data
		if (fetchNewData) {
			// Check client cache first with TTL validation
			const isCollectionSwitch = lastCollectionId !== currentCollId;
			const canUseCache = !isCollectionSwitch && collectionState.stableDataExists && clientCache.has(currentFetchKey);

			if (canUseCache) {
				// console.log('[EntryList] Using client cache', { currentFetchKey });
				const cached = clientCache.get(currentFetchKey)!;

				// Check cache TTL
				const now = Date.now();
				if (now - cached.timestamp > CACHE_TTL) {
					clientCache.delete(currentFetchKey);
				} else {
					// Enhanced cache validation with triple verification
					let cacheIsValid = true;
					try {
						const keyData = JSON.parse(currentFetchKey);
						if (
							keyData.collectionId !== currentCollId ||
							keyData.collectionName !== currentCollection?.name ||
							keyData.collectionHash !== currentCollId.slice(-8)
						) {
							clientCache.clear();
							cacheIsValid = false;
						}
					} catch (e) {
						clientCache.clear();
						cacheIsValid = false;
					}

					if (cacheIsValid) {
						tableData = cached.items;
						pagesCount = cached.totalPages;
						totalItems = cached.total;
						rawData = cached;
						data = cached;

						collectionState = {
							...collectionState,
							stableDataExists: true,
							hasInitialLoad: true
						};
						loadingState = 'idle';
						return;
					}
				}
			}

			// Check for redundant calls and rate limiting - but be less restrictive
			// Only skip if it's the exact same request and very recent
			if (currentFetchKey === lastFetchParams && collectionState.stableDataExists && now - lastFetchTime < 500) {
				return;
			}

			lastFetchTime = now;

			// Generate a unique request ID to track this request
			const requestId = `${currentCollId}-${now}`;
			currentRequestId = requestId;

			// Smart loading state management to prevent flicker during collection switches
			// Only show loading indicators for genuine data fetches, not during collection transitions

			// Only show loading indicators if:
			// 1. We don't have stable data AND it's not a collection switch
			// 2. We're not currently changing collections
			// 3. We're not initializing
			if (!collectionState.stableDataExists && !isCollectionSwitch && !collectionState.isChanging && !collectionState.isInitializing) {
				loadingState = 'loading';
				globalLoadingStore.startLoading(loadingOperations.dataFetch);
			} else if (!isCollectionSwitch && !collectionState.isChanging && !collectionState.isInitializing && collectionState.stableDataExists) {
				// For refreshes with existing data, use a lighter loading state
				loadingState = 'loading';
			}
			// For all other cases (collection switches, initialization), don't set loading state

			try {
				const page = entryListPaginationSettings.currentPage;
				const limit = entryListPaginationSettings.rowsPerPage;
				const activeFilters: Record<string, string> = {};
				for (const key in entryListPaginationSettings.filters) {
					if (entryListPaginationSettings.filters[key]) activeFilters[key] = entryListPaginationSettings.filters[key];
				}
				// Conditionally add the filter for deleted status
				if (!showDeleted) {
					activeFilters.status = '!=deleted';
				} else {
					// If we are showing deleted items, ensure no other status filter is conflicting.
					delete activeFilters.status;
				}

				const sortParam =
					entryListPaginationSettings.sorting.isSorted && entryListPaginationSettings.sorting.sortedBy
						? { [entryListPaginationSettings.sorting.sortedBy]: entryListPaginationSettings.sorting.isSorted }
						: {};

				const queryParams = {
					collectionId: currentCollId,
					page,
					pageSize: limit, // API expects pageSize, not limit
					contentLanguage: currentLanguage,
					filter: JSON.stringify(activeFilters),
					sort: JSON.stringify(sortParam),
					// Add timestamp when language changed to force cache miss
					_langChange: lastLanguage !== currentLanguage ? languageChangeTimestamp : undefined,
					// Add cache busting parameter to ensure fresh data
					_cacheBust: Date.now()
				};

				const result = await getData(queryParams);

				// Enhanced race condition prevention with faster response time
				if (currentRequestId !== requestId) {
					// Parse request IDs to check if they're for the same collection
					const [thisCollId, thisTimestamp] = requestId.split('-');
					const [currentCollId_parsed, currentTimestamp] = (currentRequestId || '').split('-');

					// If it's for a different collection, definitely discard
					if (thisCollId !== currentCollId_parsed) {
						return;
					}

					// Enhanced: Reduced time threshold for more responsive UI (500ms vs 1000ms)
					const timeDiff = parseInt(currentTimestamp) - parseInt(thisTimestamp);
					if (timeDiff > 500) {
						return;
					}
				}

				// Critical: Check if the collection is still the same after the API call
				// This prevents race conditions where user switches collection while API call is in flight
				if (currentCollection?._id !== currentCollId) {
					return;
				}

				if (result.success) {
					data = result.data;
					rawData = data;
					tableData = data.items || [];
					pagesCount = data.totalPages || 1;
					totalItems = data.total || 0;
					// Update last fetch params to prevent redundant calls
					lastFetchParams = currentFetchKey;
					// Cache management with size limits and TTL
					const now = Date.now();
					const cachedEntry = { items: tableData, totalPages: pagesCount, total: totalItems, timestamp: now };

					// Clean expired entries
					for (const [key, value] of clientCache.entries()) {
						if (now - value.timestamp > CACHE_TTL) {
							clientCache.delete(key);
						}
					}

					// Enforce cache size limit (LRU-style)
					if (clientCache.size >= MAX_CACHE_SIZE) {
						const oldestKey = clientCache.keys().next().value;
						if (oldestKey) clientCache.delete(oldestKey);
					}

					clientCache.set(currentFetchKey, cachedEntry);

					// Update collection state atomically
					collectionState = {
						...collectionState,
						stableDataExists: true,
						hasInitialLoad: true
					};
				} else {
					// Don't clear existing data on error, just show error toast
					toastStore.trigger({ message: result.error || 'Failed to load data.', background: 'variant-filled-error' });
					// Still mark as having attempted initial load to prevent infinite loading
					if (!collectionState.hasInitialLoad) {
						collectionState = {
							...collectionState,
							hasInitialLoad: true
						};
					}
					// Smart retry for empty data with rate limiting
					if (tableData.length === 0 && !lastFetchParams) {
						const retryKey = `retry_${currentCollId}_${now}`;
						const lastRetry = clientCache.get('lastRetryTime');
						const retryInterval = 5000; // 5 seconds between retries

						if (!lastRetry || now - lastRetry > retryInterval) {
							clientCache.set('lastRetryTime', now);
							setTimeout(() => {
								if (currentCollection?._id === currentCollId && tableData.length === 0) {
									refreshTableData(true);
								}
							}, 3000);
						}
					}
				}
			} catch (error) {
				console.error('Error refreshing table data:', error);
				toastStore.trigger({
					message: (error as Error).message || 'An unexpected error occurred while fetching data.',
					background: 'variant-filled-error'
				});
				// Preserve existing data on network errors
				if (!collectionState.hasInitialLoad) {
					collectionState = {
						...collectionState,
						hasInitialLoad: true
					};
				}
			} finally {
				loadingState = 'idle';
				// Always stop loading regardless of how we set it
				if (globalLoadingStore.isLoadingReason(loadingOperations.dataFetch)) {
					globalLoadingStore.stopLoading(loadingOperations.dataFetch);
				}
			}
		}
	}
	function savePaginationSettings() {
		const currentCollId = currentCollection?._id;
		if (!browser || !currentCollId) return;

		const settingsToSave: PaginationSettings = {
			collectionId: currentCollId,
			density: entryListPaginationSettings.density,
			currentPage: entryListPaginationSettings.currentPage,
			rowsPerPage: entryListPaginationSettings.rowsPerPage,
			filters: entryListPaginationSettings.filters,
			sorting: entryListPaginationSettings.sorting,
			displayTableHeaders: displayTableHeaders.map((h) => ({ id: h.id, label: h.label, name: h.name, visible: h.visible }))
		};
		localStorage.setItem(`entryListPaginationSettings_${currentCollId}`, JSON.stringify(settingsToSave));
	}

	$effect(() => {
		// Save settings to localStorage whenever they change significantly
		savePaginationSettings();
	});

	// Listen for global cache clear events with cache warming
	$effect(() => {
		const handleCacheClear = (event: CustomEvent) => {
			// Smart cache clearing - preserve some entries if switching collections
			if (event.detail?.reason === 'collection-switch') {
				// Keep cache for previous collection for potential back-navigation
				const currentCollId = currentCollection?._id;
				const keysToKeep = [];

				for (const [key] of clientCache.entries()) {
					try {
						const keyData = JSON.parse(key);
						// Keep cache for current collection and one previous
						if (keyData.collectionId === currentCollId || keysToKeep.length < 5) {
							keysToKeep.push(key);
						}
					} catch (e) {
						// Invalid key, will be cleared
					}
				}

				// Clear cache but preserve strategic entries
				const entriesToKeep = new Map();
				keysToKeep.forEach((key) => {
					if (clientCache.has(key)) {
						entriesToKeep.set(key, clientCache.get(key));
					}
				});

				clientCache.clear();
				entriesToKeep.forEach((value, key) => {
					clientCache.set(key, value);
				});
			} else {
				// Full cache clear for other reasons
				clientCache.clear();
			}

			// Only clear fetch params if it's a collection switch
			if (event.detail?.reason === 'collection-switch') {
				lastFetchParams = null;
			} else {
				lastFetchParams = null;
			}
		};

		document.addEventListener('clearEntryListCache', handleCacheClear as EventListener);

		return () => {
			document.removeEventListener('clearEntryListCache', handleCacheClear as EventListener);
		};
	});

	// Debounce utility for filter and refresh with smart timing
	const filterDebounce = debounceUtil(300);
	const refreshDebounce = debounceUtil(100); // Reduced debounce for better responsiveness

	// Consolidated effect that handles all refresh scenarios efficiently
	$effect(() => {
		// Track all dependencies that should trigger a refresh
		const currentCollId = currentCollection?._id;
		const { currentPage, rowsPerPage, filters, sorting } = entryListPaginationSettings;
		const language = currentLanguage;
		const mode = currentMode;
		const currentFetchKey = getCurrentFetchKey();

		// Determine what type of refresh is needed
		const isCollectionSwitch = lastCollectionId !== currentCollId;
		const isValidForRefresh = currentCollId && !collectionState.isChanging && !collectionState.isInitializing && mode !== 'create' && mode !== 'edit';

		// Only proceed if we have a valid state for refresh
		if (isValidForRefresh) {
			// For collection switches, trigger the initial load
			if (isCollectionSwitch) {
				refreshDebounce(() => refreshTableData(true));
				return;
			}

			// Additional check: don't refresh if we're still in a transitional state
			if (collectionState.isChanging || collectionState.isInitializing) {
				return;
			}

			// Refresh if:
			// 1. We don't have initial load yet (first load for collection)
			// 2. We have stable data and fetch key changed (pagination/filter changes)
			if (!collectionState.hasInitialLoad || (collectionState.hasInitialLoad && currentFetchKey !== lastFetchParams)) {
				if (!collectionState.hasInitialLoad) {
					refreshDebounce(() => refreshTableData(true));
				} else {
					refreshDebounce(() => refreshTableData(true));
				}
			}
		}
	}); // Simplified debug effect to track only significant loading changes
	$effect(() => {
		const isLoading = globalLoadingStore.isLoadingReason(loadingOperations.dataFetch);
	});

	// Handle language changes specifically for cache invalidation
	let lastLanguage = $state<string | null>(null);
	let languageChangeTimestamp = $state<number>(Date.now());

	$effect(() => {
		const language = currentLanguage;
		const collectionId = currentCollection?._id;

		// Only invalidate cache if language actually changed and we have a collection
		if (collectionId && lastLanguage !== null && lastLanguage !== language) {
			// console.log(`[EntryList] Language changed from ${lastLanguage} to ${language}, invalidating cache for collection ${collectionId}`);
			invalidateCollectionCache(collectionId);
			// Clear client cache on language change to ensure fresh data
			clientCache.clear();
			// Update timestamp to force cache miss
			languageChangeTimestamp = Date.now();
		}

		lastLanguage = language;
	});

	$effect(() => {
		// Reset collectionValue store when mode changes to 'view'
		if (currentMode === 'view') {
			untrack(() => {
				meta_data.clear();
				// Handle unsaved draft creation when exiting create mode
				const currentValue = collectionValue.value;
				if (currentValue && Object.keys(currentValue).length > 0) {
					// Check if we have unsaved data from create mode that should be saved as draft
					const hasUnsavedData = Object.entries(currentValue).some(([key, value]) => {
						// Ignore system fields when checking for content
						if (key.startsWith('_') || key === 'createdAt' || key === 'updatedAt' || key === 'createdBy' || key === 'updatedBy') {
							return false;
						}
						// Check if field has meaningful content
						if (value && typeof value === 'object' && !Array.isArray(value)) {
							// For translated fields, check if any language has content
							return Object.values(value).some((v) => v !== null && v !== '' && v !== undefined);
						}
						// For simple fields, check if not empty
						return value !== null && value !== '' && value !== undefined;
					});

					// If there's unsaved content and no _id (new entry), save as draft
					if (hasUnsavedData && !currentValue._id) {
						// Use collection's default status instead of hardcoded 'draft'
						const defaultStatus = collection.value?.status || 'draft';
						const draftEntry = { ...currentValue, status: defaultStatus };
						// Save as draft silently
						untrack(async () => {
							const collId = collection.value?._id;
							if (collId) {
								try {
									const result = await createEntry(collId, draftEntry);
									if (result.success) {
										// Don't show toast for auto-draft save to avoid confusion
										invalidateCollectionCache(collId);
									}
								} catch (error) {
									// Silently handle errors for auto-draft saves
									console.warn('Auto-draft save failed:', error);
								}
							}
						});
					}

					// Clear the collection value
					collectionValue.set({});
				}
				// Refresh data when returning to view mode (after save/edit)
				const currentCollId = collection.value?._id;
				if (currentCollId && collectionState.hasInitialLoad) {
					invalidateCollectionCache(currentCollId);
					refreshTableData(true);
				}
			});
		}

		// Clear selections when entering edit mode (editing specific entry)
		if (currentMode === 'edit') {
			untrack(() => {
				Object.keys(selectedMap).forEach((key) => delete selectedMap[key]);
				SelectAll = false;
			});
		}
	});

	// Optimized selection processing with batch updates
	function process_selectAllRows(selectAllState: boolean) {
		if (!Array.isArray(tableData)) return;

		// Batch update selections for better performance
		untrack(() => {
			if (selectAllState) {
				tableData.forEach((_entry, index) => {
					selectedMap[index.toString()] = true;
				});
			} else {
				Object.keys(selectedMap).forEach((key) => delete selectedMap[key]);
			}
		});
	}

	$effect(() => {
		process_selectAllRows(SelectAll);
	});

	// Optimized selection tracking with memoization
	let hasSelections = $derived.by(() => {
		return Object.values(selectedMap).some((isSelected) => isSelected);
	});

	// Get the statuses of currently selected entries with better performance
	let selectedEntriesStatuses = $derived.by(() => {
		const statuses: string[] = [];
		const selectedEntries = Object.entries(selectedMap).filter(([, isSelected]) => isSelected);

		for (const [index] of selectedEntries) {
			const entry = tableData[Number(index)];
			if (entry?.status) {
				statuses.push(entry.status.toLowerCase());
			}
		}
		return statuses;
	});

	// Tick Row - modify STATUS of an Entry
	modifyEntry.set(async (status?: keyof typeof statusMap): Promise<void> => {
		const selectedIds = getSelectedIds();
		if (!selectedIds.length) {
			toastStore.trigger({ message: 'No entries selected' });
			return;
		}

		const modalSettings: ModalSettings = {
			type: 'confirm',
			title: 'Confirm Status Change',
			body: `Are you sure you want to update ${selectedIds.length} entries to "${status}"?`,
			response: async (r) => {
				if (r) {
					await setEntriesStatus(selectedIds, status as StatusType, onActionSuccess, toastStore);
				}
			}
		};
		modalStore.trigger(modalSettings);
	});

	let pathSegments = $derived($page.url.pathname.split('/').filter(Boolean));
	let categoryName = $derived.by(() => {
		// Remove the first segment if it matches the current system language
		const segments = pathSegments?.slice() ?? [];
		if (segments.length > 0 && segments[0].toLowerCase() === currentSystemLanguage?.toLowerCase()) {
			segments.shift();
		}
		return segments.slice(0, -1).join('>') || '';
	});

	// --- Actions ---
	// Getters for selected entry data, used by action functions
	const getSelectedIds = () =>
		Object.entries(selectedMap)
			.filter(([, isSelected]) => isSelected)
			.map(([index]) => tableData[Number(index)]._id);

	const getSelectedRawEntries = () =>
		Object.entries(selectedMap)
			.filter(([, isSelected]) => isSelected)
			.map(([index]) => {
				const selectedId = tableData[Number(index)]._id;
				const entryList = rawData?.items || [];
				return entryList.find((rawEntry) => rawEntry._id === selectedId);
			})
			.filter(Boolean); // Filter out any potential undefined values

	// Callback to refresh data after an action
	const onActionSuccess = () => {
		const currentCollId = collection.value?._id;
		if (currentCollId) {
			invalidateCollectionCache(currentCollId);
			// Clear client cache to ensure fresh data
			clientCache.clear();
			// Clear selections
			Object.keys(selectedMap).forEach((key) => delete selectedMap[key]);
			SelectAll = false;
			// Reset to page 1 to avoid empty pages after deletions
			entryListPaginationSettings.currentPage = 1;
			// Force a refresh by resetting state and fetching new data
			untrack(() => {
				// Reset collection state for fresh data
				collectionState = {
					...collectionState,
					hasInitialLoad: false,
					stableDataExists: false
				};
				// Add timestamp to force fresh data fetch
				languageChangeTimestamp = Date.now();
				refreshTableData(true);
			});
		}
	};

	// Handler for creating a new entry
	const onCreate = async () => {
		// Create a default entry object based on the collection's fields
		const newEntry: Record<string, any> = {};
		if (currentCollection?.fields) {
			for (const field of currentCollection.fields) {
				const fieldName = getFieldName(field, false);
				// Set a default value based on the field type or widget
				newEntry[fieldName] = field.translated ? { [currentLanguage]: null } : null;
			}
		}
		// Set the default status from collection schema for new entries
		// This ensures new entries use the collection's intended default status
		if (collection.value?.status) {
			newEntry.status = collection.value.status;
		}

		// Set the new entry data FIRST
		collectionValue.set(newEntry);

		// THEN switch the mode
		mode.set('create');

		// Use a microtask to allow the UI to update before other actions
		await Promise.resolve();
		handleUILayoutToggle();
	};

	// Handlers that call the centralized action functions
	const onPublish = () => setEntriesStatus(getSelectedIds(), StatusTypes.publish, onActionSuccess, toastStore);
	const onUnpublish = () => setEntriesStatus(getSelectedIds(), StatusTypes.unpublish, onActionSuccess, toastStore);
	const onTest = () => setEntriesStatus(getSelectedIds(), 'test', onActionSuccess, toastStore);
	const onDelete = (isPermanent = false) => {
		const selectedIds = getSelectedIds();
		if (!selectedIds.length) {
			toastStore.trigger({ message: 'No entries selected' });
			return;
		}

		const useArchiving = publicEnv.USE_ARCHIVE_ON_DELETE;
		const isForArchived = showDeleted || isPermanent;
		const willDelete = !useArchiving || isForArchived;

		const actionName = willDelete ? 'Delete' : 'Archive';
		const actionVerb = willDelete ? 'delete' : 'archive';
		const actionColor = willDelete ? 'error' : 'warning';

		const modalSettings: ModalSettings = {
			type: 'confirm',
			title: `Please Confirm <span class="text-${actionColor}-500 font-bold">${actionName}</span>`,
			body: willDelete
				? `Are you sure you want to <span class="text-${actionColor}-500 font-semibold">${actionVerb}</span> ${selectedIds.length} ${selectedIds.length === 1 ? 'entry' : 'entries'}? This action will remove ${selectedIds.length === 1 ? 'it' : 'them'} from the system.`
				: `Are you sure you want to <span class="text-${actionColor}-500 font-semibold">${actionVerb}</span> ${selectedIds.length} ${selectedIds.length === 1 ? 'entry' : 'entries'}? Archived items can be restored later.`,
			buttonTextConfirm: actionName,
			buttonTextCancel: 'Cancel',
			meta: { buttonConfirmClasses: `bg-${actionColor}-500 hover:bg-${actionColor}-600 text-white` },
			response: async (confirmed: boolean) => {
				if (confirmed) {
					try {
						if (willDelete) {
							// Use batch delete API with fallback to individual deletes
							try {
								const collId = collection.value?._id;
								if (collId) {
									const result = await batchDeleteEntries(collId, selectedIds);
									if (result.success) {
										toastStore.trigger({
											message: `${selectedIds.length} ${selectedIds.length === 1 ? 'entry' : 'entries'} deleted successfully`,
											background: 'variant-filled-success'
										});
									} else {
										throw new Error('Batch delete failed');
									}
								}
							} catch (batchError) {
								// Fallback to individual deletes
								console.warn('Batch delete failed, using individual deletes:', batchError);
								await Promise.all(
									selectedIds.map((entryId) => {
										const collId = collection.value?._id;
										if (collId) {
											return deleteEntry(collId, entryId);
										}
										return Promise.resolve();
									})
								);
								toastStore.trigger({
									message: `${selectedIds.length} ${selectedIds.length === 1 ? 'entry' : 'entries'} deleted successfully`,
									background: 'variant-filled-success'
								});
							}
						} else {
							// Archive entries - setEntriesStatus already shows toast, so don't duplicate
							await setEntriesStatus(selectedIds, StatusTypes.archive, () => {}, toastStore);
						}
						onActionSuccess();
					} catch (error) {
						toastStore.trigger({
							message: `Failed to ${actionVerb} entries: ${(error as Error).message}`,
							background: 'variant-filled-error'
						});
					}
				}
			}
		};
		modalStore.trigger(modalSettings);
	};
	const onClone = () => cloneEntries(getSelectedRawEntries(), onActionSuccess, toastStore);

	// FIX: Schedule handler now correctly processes date and calls the action
	const onSchedule = (date: string, action: string) => {
		const payload = { _scheduled: new Date(date).getTime() };
		// The `action` variable from the modal can be used here if your backend
		// needs to know what kind of scheduled action to perform (e.g., scheduled publish vs. scheduled delete)
		setEntriesStatus(getSelectedIds(), StatusTypes.schedule, onActionSuccess, toastStore, payload);
	};

	// Functions to handle actions from EntryListMultiButton (legacy compatibility)
	function legacyOnPublish() {
		console.log('onPublish called - will show modal');
		modifyEntry.value(StatusTypes.publish);
	}
	function legacyOnUnpublish() {
		console.log('onUnpublish called - will show modal');
		modifyEntry.value(StatusTypes.unpublish);
	}
	function legacyOnSchedule() {
		console.log('onSchedule called - will show modal');
		modifyEntry.value(StatusTypes.schedule);
	}

	// Direct action functions for MultiButton (bypass modals)
	async function executePublish() {
		await setEntriesStatus(getSelectedIds(), StatusTypes.publish, onActionSuccess, toastStore);
	}
	async function executeUnpublish() {
		await setEntriesStatus(getSelectedIds(), StatusTypes.unpublish, onActionSuccess, toastStore);
	}
	async function executeSchedule() {
		// This needs a modal to select a date, so direct execution is not simple.
		// For now, it will open the schedule modal.
		legacyOnSchedule();
	}
	async function executeTest() {
		await setEntriesStatus(getSelectedIds(), 'test' as StatusType, onActionSuccess, toastStore);
	}

	// Helper function to execute status changes without modals
	async function executeDelete() {
		const selectedIds = getSelectedIds();
		if (!selectedIds.length) return;

		const useArchiving = publicEnv.USE_ARCHIVE_ON_DELETE;
		const isForArchived = showDeleted;
		const willDelete = !useArchiving || isForArchived;

		try {
			if (willDelete) {
				// Use batch delete API with fallback to individual deletes
				try {
					const collId = collection.value?._id;
					if (collId) {
						const result = await batchDeleteEntries(collId, selectedIds);
						if (!result.success) {
							throw new Error('Batch delete failed');
						}
					}
				} catch (batchError) {
					// Fallback to individual deletes
					console.warn('Batch delete failed, using individual deletes:', batchError);
					await Promise.all(
						selectedIds.map((entryId) => {
							const collId = collection.value?._id;
							if (collId) {
								return deleteEntry(collId, entryId);
							}
							return Promise.resolve();
						})
					);
				}
			} else {
				// Archive entries
				await setEntriesStatus(selectedIds, StatusTypes.archive, () => {}, toastStore);
			}
			onActionSuccess();
		} catch (error) {
			toastStore.trigger({
				message: `Failed to ${willDelete ? 'delete' : 'archive'} entries: ${(error as Error).message}`,
				background: 'variant-filled-error'
			});
		}
	}
	// Legacy onClone function - now calls centralized action
	function legacyOnClone() {
		onClone();
	}

	// Show content as soon as we have a collection, with improved logic to prevent flicker
	let shouldShowContent = $derived(
		currentCollection?._id &&
			!collectionState.isChanging &&
			(collectionState.hasInitialLoad || (loadingState === 'loading' && collectionState.stableDataExists))
	);
	let renderHeaders = $derived(visibleTableHeaders);
	let shouldShowTable = $derived(shouldShowContent && tableData.length > 0 && !collectionState.isChanging && renderHeaders?.length > 0);
	let shouldShowNoDataMessage = $derived(
		shouldShowContent &&
			!isLoading &&
			tableData.length === 0 &&
			collectionState.hasInitialLoad &&
			!collectionState.isChanging &&
			collectionState.stableDataExists
	);

	// More stable loading states that don't flicker
	let isActuallyLoading = $derived(
		loadingState === 'loading' && !collectionState.stableDataExists && !collectionState.isChanging && !collectionState.isInitializing
	);

	// Only show main loading when we truly have no data and are loading
	let shouldShowLoadingMessage = $derived(
		isActuallyLoading &&
			!collectionState.hasInitialLoad &&
			currentCollection?._id &&
			!collectionState.isChanging && // Don't show during collection transitions
			!collectionState.isInitializing // Don't show during initialization
	);

	// Show a subtle refreshing indicator only for data updates (not collection switches)
	let shouldShowRefreshingIndicator = $derived(
		loadingState === 'loading' &&
			collectionState.hasInitialLoad &&
			collectionState.stableDataExists &&
			tableData?.length > 0 &&
			!collectionState.isChanging && // Don't show during collection transitions
			!collectionState.isInitializing && // Don't show during initialization
			lastFetchParams !== getCurrentFetchKey() // Only show when fetch parameters changed
	);

	// Use regular visibleTableHeaders - no need for complex transition logic
	let tableColspan = $derived((renderHeaders?.length ?? 0) + 1);

	function handleColumnVisibilityToggle(headerToToggle: TableHeader) {
		displayTableHeaders = displayTableHeaders.map((h) => (h.id === headerToToggle.id ? { ...h, visible: !h.visible } : h));
	}

	function handleSelectAllColumnsToggle() {
		// selectAllColumns is bound to checkbox, its value reflects the new desired state
		const newVisibility = selectAllColumns;
		displayTableHeaders = displayTableHeaders.map((h) => ({ ...h, visible: newVisibility }));
	}

	function resetColumnSettings() {
		const currentCollId = currentCollection?._id;
		if (browser && currentCollId) {
			localStorage.removeItem(`entryListPaginationSettings_${currentCollId}`);
		}
		// Reset relevant parts of the settings state by re-assigning the whole object or critical sub-objects
		entryListPaginationSettings = {
			...defaultPaginationSettings(currentCollId ?? null), // Start with fresh defaults
			// Potentially keep some user preferences like density if desired
			density: entryListPaginationSettings.density,
			// Re-initialize filters based on current tableHeaders
			filters: tableHeaders.reduce(
				(acc, th) => {
					acc[th.name] = '';
					return acc;
				},
				{} as Record<string, string>
			)
		};
	}
</script>

<!--Table -->
{#if shouldShowLoadingMessage}
	<Loading customTopText="Loading Data" customBottomText="Please wait..." />
{:else if shouldShowContent}
	<!-- Header -->
	<div class="mb-2 flex justify-between dark:text-white">
		<!-- Row 1 for Mobile -->
		<div class="flex items-center justify-between">
			<!-- Hamburger -->
			{#if uiStateManager.uiState.value.leftSidebar === 'hidden'}
				<button
					type="button"
					onkeydown={() => {}}
					onclick={() => toggleUIElement('leftSidebar', currentScreenSize === 'LG' ? 'full' : 'collapsed')}
					aria-label="Open Sidebar"
					class="variant-ghost-surface btn-icon mt-1"
				>
					<iconify-icon icon="mingcute:menu-fill" width="24"></iconify-icon>
				</button>
			{/if}

			<!-- Collection type with icon -->
			<div class="mr-1 flex flex-col {!uiStateManager.uiState.value.leftSidebar ? 'ml-2' : 'ml-1 sm:ml-2'}">
				{#if categoryName}
					<div class="mb-2 text-xs capitalize text-surface-500 dark:text-surface-300 rtl:text-left">
						{categoryName}
					</div>
				{/if}
				<div class="-mt-2 flex justify-start text-sm font-bold uppercase dark:text-white md:text-2xl lg:text-xl">
					{#if currentCollection?.icon}
						<span>
							<iconify-icon icon={currentCollection.icon} width="24" class="mr-1 text-error-500 sm:mr-2"></iconify-icon>
						</span>
					{/if}
					{#if currentCollection?.name}
						<div class="flex max-w-[85px] whitespace-normal leading-3 sm:mr-2 sm:max-w-none md:mt-0 md:leading-none xs:mt-1">
							{currentCollection.name}
						</div>
					{/if}
				</div>
			</div>
		</div>
		<div class="flex items-center justify-between gap-1">
			<!-- Expand/Collapse -->
			<button
				type="button"
				onkeydown={() => {}}
				onclick={() => (expand = !expand)}
				class="variant-ghost-surface btn-icon p-1 sm:hidden"
				aria-label="Expand/Collapse Filters"
			>
				<iconify-icon icon="material-symbols:filter-list-rounded" width="30"> </iconify-icon>
			</button>

			<!-- Translation Content Language -->
			<div class="mt-1 sm:hidden">
				<TranslationStatus />
			</div>

			<!-- Table Filter with Translation Content Language -->
			<div class="relative mt-1 hidden items-center justify-center gap-2 sm:flex">
				<TableFilter bind:globalSearchValue bind:filterShow bind:columnShow bind:density={entryListPaginationSettings.density} />
				<TranslationStatus />
			</div>

			<!-- MultiButton -->
			<div class=" flex w-full items-center justify-end sm:mt-0 sm:w-auto">
				<EntryListMultiButton
					isCollectionEmpty={tableData?.length === 0}
					{hasSelections}
					selectedCount={Object.values(selectedMap).filter(Boolean).length}
					selectedStatuses={selectedEntriesStatuses}
					bind:showDeleted
					publish={onPublish}
					unpublish={onUnpublish}
					schedule={onSchedule}
					delete={onDelete}
					test={onTest}
					clone={onClone}
					create={onCreate}
				/>
			</div>
		</div>
	</div>

	<!-- Table  Start-->
	{#if expand}
		<div class="mb-2 flex items-center justify-center sm:hidden">
			<TableFilter bind:globalSearchValue bind:filterShow bind:columnShow bind:density={entryListPaginationSettings.density} />
		</div>
	{/if}

	{#if columnShow}
		<!-- Column order -->
		<div class="rounded-b-0 flex flex-col justify-center rounded-t-md border-b bg-surface-300 p-2 text-center dark:bg-surface-700">
			<div class="text-sm text-white dark:text-primary-500">
				{m.entrylist_dnd()}
			</div>
			<!-- Select All Columns -->
			<div class="my-2 flex w-full flex-col items-center justify-center gap-2 sm:flex-row sm:gap-4">
				<div class="flex items-center gap-2">
					<label class="flex items-center">
						<input type="checkbox" bind:checked={selectAllColumns} onchange={handleSelectAllColumnsToggle} class="mr-1" />
						{m.entrylist_all()}
					</label>
					<button class="variant-ghost-surface btn btn-sm" onclick={resetColumnSettings}>
						<iconify-icon icon="material-symbols-light:device-reset" width="20" class="mr-1 text-tertiary-500"></iconify-icon>
						Reset Columns
					</button>
				</div>
				<section
					use:dndzone={{ items: displayTableHeaders, flipDurationMs }}
					onconsider={handleDndConsider}
					onfinalize={handleDndFinalize}
					class="flex flex-wrap justify-center gap-1 rounded-md p-1"
				>
					{#each displayTableHeaders as header (header.id)}
						<button
							class="chip {header.visible ? 'variant-filled-secondary' : 'variant-ghost-secondary'} mr-1 flex items-center justify-center text-xs"
							animate:flip={{ duration: flipDurationMs }}
							onclick={() => handleColumnVisibilityToggle(header)}
						>
							{#if header.visible}<iconify-icon icon="fa:check" class="mr-1"></iconify-icon>{/if}
							<span class="capitalize">{header.label}</span>
						</button>
					{/each}
				</section>
			</div>
		</div>
	{/if}

	<!-- Loading state when refreshing existing data -->
	{#if shouldShowRefreshingIndicator}
		<div class="py-2 text-center text-xs text-gray-400">Refreshing...</div>
	{/if}

	{#if shouldShowTable}
		<div class="table-container max-h-[calc(100dvh)] overflow-auto">
			<table
				class="table table-interactive table-hover {entryListPaginationSettings.density === 'compact'
					? 'table-compact'
					: entryListPaginationSettings.density === 'comfortable'
						? 'table-comfortable'
						: ''}"
			>
				<!-- Table Header -->
				<thead class="text-tertiary-500 dark:text-primary-500">
					{#if filterShow && renderHeaders.length > 0}
						<tr class="divide-x divide-surface-400 dark:divide-surface-600">
							<th>
								<!-- Clear All Filters Button -->
								{#if Object.values(entryListPaginationSettings.filters).some((f) => f !== '')}
									<button
										onclick={() => {
											const clearedFilters: Record<string, string> = {};
											Object.keys(entryListPaginationSettings.filters).forEach((key) => (clearedFilters[key] = ''));
											entryListPaginationSettings.filters = clearedFilters;
										}}
										aria-label="Clear All Filters"
										class="variant-ghost-surface btn-icon btn-sm"
									>
										<iconify-icon icon="material-symbols:close" width="18"></iconify-icon>
									</button>
								{/if}
							</th>
							<!-- Filter -->
							{#each renderHeaders as header (header.id)}
								<th
									><div class="flex items-center justify-between">
										<FloatingInput
											type="text"
											icon="material-symbols:search-rounded"
											label={`Filter ${header.label}`}
											name={header.name}
											value={entryListPaginationSettings.filters[header.name] || ''}
											onInput={(value: string) => {
												const filterName = header.name;
												filterDebounce(() => {
													const newFilters = { ...entryListPaginationSettings.filters };
													if (value) {
														newFilters[filterName] = value;
													} else {
														delete newFilters[filterName];
													}
													entryListPaginationSettings.filters = newFilters;
												});
											}}
											inputClass="text-xs"
										/>
									</div>
								</th>
							{/each}
						</tr>
					{/if}

					<tr class="divide-x divide-surface-400 border-b border-black dark:border-white">
						<TableIcons
							cellClass={`w-10 ${hasSelections ? 'bg-primary-500/10 dark:bg-secondary-500/20' : ''}`}
							checked={SelectAll}
							onCheck={(checked) => {
								SelectAll = checked;
							}}
						/>

						{#each renderHeaders as header (header.id)}
							<th
								class="cursor-pointer px-2 py-1 text-center text-xs sm:text-sm {header.name === entryListPaginationSettings.sorting.sortedBy
									? 'font-semibold text-primary-500 dark:text-secondary-400'
									: 'text-tertiary-500 dark:text-primary-500'}"
								onclick={() => {
									let newSorted = { ...entryListPaginationSettings.sorting };
									if (newSorted.sortedBy === header.name) {
										newSorted.isSorted = newSorted.isSorted === 1 ? -1 : ((newSorted.isSorted === -1 ? 0 : 1) as 0 | 1 | -1);
										if (newSorted.isSorted === 0) newSorted.sortedBy = '';
									} else {
										newSorted.sortedBy = header.name;
										newSorted.isSorted = 1;
									}
									entryListPaginationSettings.sorting = newSorted;
								}}
							>
								<div class="flex items-center justify-center">
									{header.label}
									{#if header.name === entryListPaginationSettings.sorting.sortedBy && entryListPaginationSettings.sorting.isSorted !== 0}
										<iconify-icon
											icon={entryListPaginationSettings.sorting.isSorted === 1
												? 'material-symbols:arrow-upward-rounded'
												: 'material-symbols:arrow-downward-rounded'}
											width="16"
											class="ml-1 origin-center"
										></iconify-icon>
									{/if}
								</div>
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#if tableData.length > 0}
						{#each tableData as entry, index (entry._id)}
							<tr class="divide-x divide-surface-400 dark:divide-surface-700 {selectedMap[index] ? 'bg-primary-500/5 dark:bg-secondary-500/10' : ''}">
								<TableIcons
									cellClass={`w-10 text-center ${selectedMap[index] ? 'bg-primary-500/10 dark:bg-secondary-500/20' : ''}`}
									checked={selectedMap[index]}
									onCheck={(isChecked) => {
										selectedMap[index] = isChecked;
									}}
								/>
								{#if renderHeaders}
									{#each renderHeaders as header (header.id)}
										<td
											class="p-0 text-center text-xs font-bold sm:text-sm {header.name !== 'status'
												? 'cursor-pointer transition-colors duration-200 hover:bg-primary-500/10 dark:hover:bg-secondary-500/20'
												: 'cursor-pointer transition-colors duration-200 hover:bg-warning-500/10 dark:hover:bg-warning-500/20'}"
											title={header.name !== 'status' ? 'Click to edit this entry' : 'Click to change status'}
											onclick={async () => {
												if (header.name === 'status') {
													// Handle single entry status change with modal (same style as multibutton)
													const currentStatus = entry.status || entry.raw_status || 'draft';
													let nextStatus;

													// Define status progression logic
													switch (currentStatus) {
														case 'draft':
														case StatusTypes.draft:
															nextStatus = StatusTypes.publish;
															break;
														case 'publish':
														case StatusTypes.publish:
															nextStatus = StatusTypes.unpublish;
															break;
														case 'unpublish':
														case StatusTypes.unpublish:
															nextStatus = StatusTypes.publish;
															break;
														case 'schedule':
														case StatusTypes.schedule:
															nextStatus = StatusTypes.publish;
															break;
														default:
															nextStatus = StatusTypes.publish;
															break;
													}

													// Create modal with same styling as multibutton modals
													const getStatusColor = (status: string) => {
														switch (status) {
															case StatusTypes.publish:
																return { color: 'primary', name: 'Publication' };
															case StatusTypes.unpublish:
																return { color: 'yellow', name: 'Unpublication' };
															case StatusTypes.draft:
																return { color: 'surface', name: 'Draft' };
															default:
																return { color: 'primary', name: 'Status Change' };
														}
													};

													const statusInfo = getStatusColor(nextStatus);
													const modalSettings: ModalSettings = {
														type: 'confirm',
														title: `Please Confirm <span class="text-${statusInfo.color}-500 font-bold">${statusInfo.name}</span>`,
														body: `Are you sure you want to <span class="text-${statusInfo.color}-500 font-semibold">change</span> this entry status to <span class="text-${statusInfo.color}-500 font-semibold">${nextStatus}</span>?`,
														buttonTextConfirm: nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1),
														buttonTextCancel: 'Cancel',
														meta: {
															buttonConfirmClasses: `bg-${statusInfo.color}-500 hover:bg-${statusInfo.color}-600 text-white`
														},
														response: async (confirmed: boolean) => {
															if (confirmed) {
																try {
																	const collId = collection.value?._id;
																	if (!collId) return;

																	// Use single entry update API
																	const result = await updateEntryStatus(collId, entry._id, nextStatus);
																	if (result.success) {
																		toastStore.trigger({
																			message: `Entry status updated to ${nextStatus}`,
																			background: 'variant-filled-success'
																		});
																		// Refresh the table data
																		onActionSuccess();
																	} else {
																		toastStore.trigger({
																			message: result.error || 'Failed to update entry status',
																			background: 'variant-filled-error'
																		});
																	}
																} catch (error) {
																	console.error('Error updating entry status:', error);
																	toastStore.trigger({
																		message: 'An error occurred while updating entry status',
																		background: 'variant-filled-error'
																	});
																}
															}
														}
													};
													modalStore.trigger(modalSettings);
												} else {
													const entryList = rawData?.items || [];
													const originalEntry = entryList.find((e) => e._id === entry._id);
													if (originalEntry) {
														// Load the entry data into collectionValue
														collectionValue.set(originalEntry);

														// Set mode to edit
														mode.set('edit');

														// If the entry is publish, automatically set it to unpublish
														// This follows CMS best practices where editing publish content
														// creates a draft that needs to be republish
														if (originalEntry.status === StatusTypes.publish) {
															// Update the local collectionValue to unpublish status
															collectionValue.update((current) => ({
																...current,
																status: StatusTypes.unpublish
															})); // Show user feedback about the status change
															toastStore.trigger({
																message: 'Entry moved to draft mode for editing. Republish when ready.',
																background: 'variant-filled-warning',
																timeout: 4000
															});
														}

														// Trigger UI layout change to show edit interface
														handleUILayoutToggle();
													}
												}
											}}
										>
											{#if header.name === 'status'}
												<Status value={entry.status || entry.raw_status || 'draft'} />
											{:else if header.name === 'createdAt' || header.name === 'updatedAt'}
												<div class="flex flex-col text-xs">
													<div class="font-semibold">
														{formatDisplayDate(entry[header.name], 'en', { year: 'numeric', month: 'short', day: 'numeric' })}
													</div>
													<div class="text-surface-500 dark:text-surface-400">
														{formatDisplayDate(entry[header.name], 'en', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
													</div>
												</div>
											{:else if typeof entry[header.name] === 'object' && entry[header.name] !== null}
												{@html entry[header.name][currentLanguage] || '-'}
											{:else}
												{@html entry[header.name] || '-'}
											{/if}
										</td>
									{/each}
								{/if}
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
		<!-- Pagination -->
		<div
			class="sticky bottom-0 left-0 right-0 z-10 mt-1 flex flex-col items-center justify-center border-t border-surface-300 bg-surface-100 px-2 py-2 dark:border-surface-700 dark:bg-surface-800 md:flex-row md:justify-between md:p-4"
		>
			<TablePagination
				bind:currentPage={entryListPaginationSettings.currentPage}
				bind:rowsPerPage={entryListPaginationSettings.rowsPerPage}
				{pagesCount}
				{totalItems}
				onUpdatePage={(page: number) => {
					if (collectionState.isChanging || collectionState.isInitializing) {
						return;
					}
					entryListPaginationSettings.currentPage = page;
					// Direct call - no debouncing needed
					refreshTableData(true);
				}}
				onUpdateRowsPerPage={(rows: number) => {
					if (collectionState.isChanging || collectionState.isInitializing) {
						return;
					}
					entryListPaginationSettings.rowsPerPage = rows;
					entryListPaginationSettings.currentPage = 1;
					// Direct call - no debouncing needed
					refreshTableData(true);
				}}
			/>
		</div>
	{:else if shouldShowNoDataMessage}
		<div class="py-10 text-center text-tertiary-500 dark:text-primary-500">
			<iconify-icon icon="bi:exclamation-circle-fill" height="44" class="mb-2"></iconify-icon>
			<p class="text-lg">
				{currentCollection?.name ? m.EntryList_no_collection({ name: currentCollection.name }) : 'No collection selected or collection is empty.'}
			</p>
		</div>
	{/if}
{/if}

<style lang="postcss">
	div::-webkit-scrollbar-thumb {
		border-radius: 50px;
		background-color: #0ec423;
	}
	div::-webkit-scrollbar {
		width: 10px;
	}
</style>
