<!--
@file:  src/components/EntryList.svelte
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
	import { getData, invalidateCollectionCache } from '@utils/apiClient';
	import { getCachedCollectionData } from '@utils/collections-prefetch';
	import { formatDisplayDate } from '@utils/dateUtils';
	import { debounce as debounceUtil, getFieldName, meta_data } from '@utils/utils';
	import { cloneEntries, deleteEntries, setEntriesStatus } from '@utils/entryActions'; // Import centralized actions
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
	import TranslationStatus from '@components/TranslationStatus.svelte';
	import EntryListMultiButton from './EntryList_MultiButton.svelte';
	import Loading from './Loading.svelte';
	// Skeleton
	import type { ModalSettings } from '@skeletonlabs/skeleton';
	import { getModalStore, getToastStore } from '@skeletonlabs/skeleton';

	// Initialize stores for modal  & toast
	const modalStore = getModalStore();
	const toastStore = getToastStore();

	// Svelte-dnd-action
	import { dndzone } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import { v4 as uuidv4 } from 'uuid';

	const flipDurationMs = 300;

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
	let isCollectionChanging = $state(false);
	let isInitializing = $state(false); // Flag to prevent pagination effect during initial load

	$effect(() => {
		// Load settings from localStorage when collectionId changes
		const currentCollId = collection.value?._id;

		// Only process if collection actually changed
		if (lastCollectionId === currentCollId) return;

		// Set flags to prevent pagination effect from triggering during collection change
		isCollectionChanging = true;
		isInitializing = true;

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
								id: typeof header.id === 'string' && header.id ? header.id : uuidv4().replace(/-/g, ''),
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
				lastCollectionId = currentCollId;
				hasInitialLoad = false;
				stableDataExists = false;
				loadingState = 'loading';
			});

			// Trigger data load for new collection
			untrack(() => refreshTableData(true));

			// Clear flag after a longer timeout to ensure pagination effect doesn't trigger
			setTimeout(() => {
				isCollectionChanging = false;
				// Clear initializing flag after data has been loaded and processed
				setTimeout(() => {
					isInitializing = false;
				}, 50);
			}, 100);
		} else if (!currentCollId) {
			// No collection selected, reset to defaults for a null collectionId
			entryListPaginationSettings = defaultPaginationSettings(null);
			untrack(() => {
				lastCollectionId = null;
				hasInitialLoad = false;
				stableDataExists = false;
				loadingState = 'idle';
				tableData = [];
				pagesCount = 1;
				totalItems = 0;
				Object.keys(selectedMap).forEach((key) => delete selectedMap[key]);
				SelectAll = false;
			});
			// Clear flag after timeout for consistency
			setTimeout(() => {
				isCollectionChanging = false;
				isInitializing = false;
			}, 100);
		}
	});

	// Enhanced loading state management for flicker-free transitions
	let loadingState = $state<'idle' | 'loading' | 'error'>('idle');

	// Simplified stable state management
	let stableDataExists = $state(false);
	let hasInitialLoad = $state(false);
	let showDeleted = $state(false); // Controls whether to view active or archived entries
	let rawData = $state<{ entryList: any[]; pagesCount?: number; totalItems?: number } | undefined>();

	let globalSearchValue = $state('');
	let expand = $state(false);
	let filterShow = $state(false);
	let columnShow = $state(false);

	const currentLanguage = $derived(contentLanguage.value);
	const currentSystemLanguage = $derived(systemLanguage.value);
	const currentMode = $derived(mode.value);
	const currentCollection = $derived(collection.value);
	const currentScreenSize = $derived(screenSize.value);

	// Computed loading states - simplified for better UX
	let isLoading = $derived(loadingState === 'loading');
	// Only show spinner on very first load or when no collection is selected
	let showLoadingSpinner = $derived(loadingState === 'loading' && !hasInitialLoad && !currentCollection?._id);

	// Defines the structure of table headers based on the current collection's schema
	const tableHeaders = $derived.by((): TableHeader[] => {
		if (!currentCollection?.fields) return [];
		const schemaHeaders: TableHeader[] = currentCollection.fields.map(
			(field: any): TableHeader => ({
				id: uuidv4().replace(/-/g, ''),
				label: field.label,
				name: getFieldName(field),
				visible: true // Default visibility
			})
		);
		return [
			...schemaHeaders,
			{ id: uuidv4().replace(/-/g, ''), label: 'createdAt', name: 'createdAt', visible: true },
			{ id: uuidv4().replace(/-/g, ''), label: 'updatedAt', name: 'updatedAt', visible: true },
			{ id: uuidv4().replace(/-/g, ''), label: 'status', name: 'status', visible: true }
		];
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

	let data = $state<{ entryList: any[]; pagesCount?: number; totalItems?: number } | undefined>();
	let tableData = $state<any[]>([]); // Processed data for rendering
	let pagesCount = $state(1);
	let totalItems = $state(0);

	let SelectAll = $state(false); // For the "select all rows" checkbox in table header
	const selectedMap: Record<string, boolean> = $state({}); // Using string keys for index

	async function refreshTableData(fetchNewData = true): Promise<void> {
		// Get current collection
		const currentCollId = currentCollection?._id;

		// If no collection, clear data and reset state
		if (!currentCollId) {
			tableData = [];
			pagesCount = 1;
			totalItems = 0;
			loadingState = 'idle';
			stableDataExists = false;
			Object.keys(selectedMap).forEach((key) => delete selectedMap[key]);
			SelectAll = false;
			return;
		}

		// Fetch data
		if (fetchNewData) {
			loadingState = 'loading';
			globalLoadingStore.startLoading(loadingOperations.dataFetch);

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

				// Check for prefetched data first (only for first page with default filters/sorting)
				let usedPrefetchedData = false;
				if (
					page === 1 &&
					[5, 10, 20].includes(limit) && // Allow prefetching for common page sizes
					Object.keys(activeFilters).length === 1 &&
					activeFilters.status === '!=deleted' &&
					(!sortParam || Object.keys(sortParam).length === 0 || sortParam.createdAt === -1)
				) {
					// Try to get prefetched data
					try {
						const { getCachedCollectionData } = await import('@utils/collections-prefetch');
						const prefetchedData = getCachedCollectionData(currentCollId, currentLanguage);

						if (prefetchedData) {
							data = prefetchedData;
							usedPrefetchedData = true;
						} else {
						}
					} catch (prefetchError) {
						// Silently continue if prefetch fails
					}
				}

				// If no prefetched data available, fetch normally
				if (!usedPrefetchedData) {
					const queryParams = {
						collectionId: currentCollId,
						page,
						limit,
						contentLanguage: currentLanguage,
						filter: JSON.stringify(activeFilters),
						sort: JSON.stringify(sortParam),
						// Add timestamp when language changed to force cache miss
						_langChange: languageChangeTimestamp
					};

					data = await getData(queryParams);
				}

				// Store raw data for actions like cloning
				rawData = data;

				// console.log(`[EntryList] Data ${usedPrefetchedData ? 'prefetched' : 'fetched'} for collection ${currentCollId}, entries: ${data?.entryList?.length || 0}`);
			} catch (error) {
				console.error(`Error fetching data: ${(error as Error).message}`);
				toastStore.trigger({ message: `Error fetching data: ${(error as Error).message}`, background: 'variant-filled-error' });
				loadingState = 'error';
				tableData = []; // Clear data on actual error
				totalItems = 0;
				pagesCount = 1;
				stableDataExists = false;
				return;
			} finally {
				globalLoadingStore.stopLoading(loadingOperations.dataFetch);
			}
		}

		//  Process data
		if (data?.entryList && Array.isArray(data.entryList)) {
			tableData = await Promise.all(
				data.entryList.map(async (entry) => {
					const obj: { [key: string]: any } = { _id: entry._id, raw_status: entry.status || 'N/A' }; // Ensure _id is always present
					if (currentCollection?.fields) {
						// Process each field
						for (const field of currentCollection.fields as any[]) {
							const fieldNameKey = getFieldName(field);
							const rawDataKey = getFieldName(field, false);

							if (field.display && typeof field.display === 'function') {
								obj[fieldNameKey] = await field.display({
									data: entry[rawDataKey],
									collection: currentCollId,
									field,
									entry,
									contentLanguage: currentLanguage
								});
							} else {
								// Handle cases where data might be a string '[object Object]'
								if (typeof entry[fieldNameKey] === 'string' && entry[fieldNameKey].includes('[object Object]')) {
									// Fallback to the raw data which should be the actual object
									obj[fieldNameKey] = entry[rawDataKey];
								} else {
									obj[fieldNameKey] = entry[fieldNameKey];
								}
							}
							if (field.callback && typeof field.callback === 'function') {
								field.callback({ data: entry });
							}
						}
					}
					obj['status'] = entry.status ? entry.status.charAt(0).toUpperCase() + entry.status.slice(1) : 'N/A';
					obj['createdAt'] = entry.createdAt ? formatDisplayDate(entry.createdAt, currentSystemLanguage) : 'N/A';
					obj['updatedAt'] = entry.updatedAt ? formatDisplayDate(entry.updatedAt, currentSystemLanguage) : 'N/A';
					return obj;
				})
			);
			stableDataExists = tableData.length > 0;
		} else {
			// If data.entryList is not an array, clear tableData
			tableData = [];
			stableDataExists = false;
		}

		// Reset selections when data changes
		Object.keys(selectedMap).forEach((key) => delete selectedMap[key]);
		tableData.forEach((_, index) => {
			selectedMap[index.toString()] = false;
		});
		SelectAll = false;

		// Update pagination counts based on `data`
		if (data?.totalItems !== undefined) {
			totalItems = data.totalItems;
		} else if (data?.pagesCount !== undefined && data?.entryList?.length !== undefined) {
			totalItems = data.pagesCount * data.entryList.length;
		} else {
			totalItems = 0; // Ensure totalItems is 0 if no data
		}

		const currentRowsPerPage = entryListPaginationSettings.rowsPerPage > 0 ? entryListPaginationSettings.rowsPerPage : 1;
		pagesCount = data?.pagesCount ?? (totalItems > 0 ? Math.ceil(totalItems / currentRowsPerPage) : 1);

		// Adjust currentPage if it's out of bounds after data refresh
		if (entryListPaginationSettings.currentPage > pagesCount && pagesCount > 0) {
			entryListPaginationSettings.currentPage = pagesCount;
			// By returning here, we stop the current function and let the main $effect
			// trigger a single, clean refresh with the corrected page number. This breaks the loop.
			return;
		}

		// No change needed for the other conditions, they don't cause loops.
		if (entryListPaginationSettings.currentPage <= 0 && pagesCount >= 1) {
			entryListPaginationSettings.currentPage = 1;
		} else if (pagesCount === 0 && entryListPaginationSettings.currentPage !== 1) {
			entryListPaginationSettings.currentPage = 1;
		}

		loadingState = 'idle';
		hasInitialLoad = true;
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

	// Debounce utility for filter and refresh
	const filterDebounce = debounceUtil(300);
	const refreshDebounce = debounceUtil(200);

	$effect(() => {
		// Debounced data refresh when pagination/filter settings change (but NOT for collection changes)
		// Track only the variables that should trigger a refresh for the SAME collection
		const collectionId = currentCollection?._id;
		// Track pagination settings that should trigger refresh
		const currentPage = entryListPaginationSettings.currentPage;
		const rowsPerPage = entryListPaginationSettings.rowsPerPage;
		const filters = entryListPaginationSettings.filters;
		const sorting = entryListPaginationSettings.sorting;
		// Track language changes that should trigger refresh
		const language = currentLanguage;

		// Read the tracked variables to ensure they're tracked
		(void collectionId, currentPage, rowsPerPage, filters, sorting, language);

		if (!collectionId) {
			// No collection selected, already handled above
			return;
		}

		// Skip if we're in the middle of a collection change or initializing
		if (isCollectionChanging || isInitializing) {
			return;
		}

		// Only refresh if this is for the same collection AND we've completed initial load
		// Also ensure this isn't the initial setup after collection change
		if (lastCollectionId === collectionId && hasInitialLoad && stableDataExists) {
			refreshDebounce(() => {
				untrack(() => refreshTableData(true));
			});
		} else {
		}
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
				collectionValue.set({});
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

	function process_selectAllRows(selectAllState: boolean) {
		tableData.forEach((_entry, index) => {
			selectedMap[index.toString()] = selectAllState;
		});
	}
	$effect(() => {
		process_selectAllRows(SelectAll);
	});

	// Track selection state without changing mode automatically
	let hasSelections = $derived(Object.values(selectedMap).some((isSelected) => isSelected));

	// Get the statuses of currently selected entries
	let selectedEntriesStatuses = $derived(() => {
		const statuses: string[] = [];
		for (const [index, isSelected] of Object.entries(selectedMap)) {
			if (isSelected) {
				const entry = tableData[Number(index)];
				if (entry?.status) {
					statuses.push(entry.status.toLowerCase());
				}
			}
		}
		return statuses;
	});

	// Tick Row - modify STATUS of an Entry
	modifyEntry.set(async (status?: keyof typeof statusMap): Promise<void> => {
		if (!status) return Promise.resolve();

		// Filter out items that are already in the target status
		const modifyList: Array<string> = [];
		for (const [index, isSelected] of Object.entries(selectedMap)) {
			if (isSelected) {
				const entry = tableData[Number(index)];
				if (entry.raw_status !== status) {
					modifyList.push(entry._id);
				}
			}
		}

		if (modifyList.length === 0) {
			toastStore.trigger({
				message: `Selected items are already in '${status}' state or no items selected.`,
				background: 'variant-filled-warning'
			});
			return;
		}

		// Function to handle confirmation modal response
		const handleConfirmation = async (confirm: boolean) => {
			if (!confirm) return;
			if (!currentCollection?._id) {
				toastStore.trigger({ message: 'No collection selected', background: 'variant-filled-error' });
				return;
			}
			try {
				// Use new status endpoint for batch updates
				// Pick first entry ID as base for endpoint, pass other IDs in body
				const firstEntryId = modifyList[0];
				await updateStatus(currentCollection._id, firstEntryId, statusMap[status], modifyList);

				// Invalidate cache and refresh the table data
				invalidateCollectionCache(currentCollection._id);
				refreshTableData();
				// Show a success toast
				toastStore.trigger({ message: `Successfully set status to ${status}`, background: 'variant-filled-success' });
			} catch (e) {
				toastStore.trigger({
					message: `Error setting status: ${(e as Error).message}`,
					background: 'variant-filled-error'
				});
			}
		};

		const itemCount = modifyList.length;
		const itemText = itemCount === 1 ? 'entry' : 'entries';

		let modalSettings: ModalSettings;

		switch (status) {
			case StatusTypes.publish:
				modalSettings = {
					type: 'confirm',
					title: `Please Confirm <span class="text-primary-500 font-bold">Publication</span>`,
					body:
						itemCount === 1
							? `Are you sure you want to <span class="text-primary-500 font-semibold">publish</span> this entry? This will make it visible to the public.`
							: `Are you sure you want to <span class="text-primary-500 font-semibold">publish</span> <span class="text-tertiary-500 font-medium">${itemCount} entries</span>? This will make all selected entries visible to the public.`,
					buttonTextConfirm: 'Publish',
					buttonTextCancel: 'Cancel',
					meta: { buttonConfirmClasses: 'bg-primary-500 hover:bg-primary-600 text-white' },
					response: (r: boolean) => handleConfirmation(r)
				};
				break;
			case StatusTypes.unpublish:
				modalSettings = {
					type: 'confirm',
					title: `Please Confirm <span class="text-yellow-500 font-bold">Unpublication</span>`,
					body:
						itemCount === 1
							? `Are you sure you want to <span class="text-yellow-500 font-semibold">unpublish</span> this entry? This will hide it from the public.`
							: `Are you sure you want to <span class="text-yellow-500 font-semibold">unpublish</span> <span class="text-tertiary-500 font-medium">${itemCount} entries</span>? This will hide all selected entries from the public.`,
					buttonTextConfirm: 'Unpublish',
					buttonTextCancel: 'Cancel',
					meta: { buttonConfirmClasses: 'bg-yellow-500 hover:bg-yellow-600 text-white' },
					response: (r: boolean) => handleConfirmation(r)
				};
				break;
			case StatusTypes.test:
				modalSettings = {
					type: 'confirm',
					title: `Please Confirm <span class="text-secondary-500 font-bold">Testing</span>`,
					body:
						itemCount === 1
							? `Are you sure you want to <span class="text-secondary-500 font-semibold">test</span> this entry?`
							: `Are you sure you want to <span class="text-secondary-500 font-semibold">test</span> <span class="text-tertiary-500 font-medium">${itemCount} entries</span>?`,
					buttonTextConfirm: 'Test',
					buttonTextCancel: 'Cancel',
					meta: { buttonConfirmClasses: 'bg-secondary-500 hover:bg-secondary-600 text-white' },
					response: (r: boolean) => handleConfirmation(r)
				};
				break;
			case StatusTypes.schedule:
				modalSettings = {
					type: 'confirm',
					title: `Please Confirm <span class="text-pink-500 font-bold">Scheduling</span>`,
					body:
						itemCount === 1
							? `Are you sure you want to <span class="text-pink-500 font-semibold">schedule</span> this entry?`
							: `Are you sure you want to <span class="text-pink-500 font-semibold">schedule</span> <span class="text-tertiary-500 font-medium">${itemCount} entries</span>?`,
					buttonTextConfirm: 'Schedule',
					buttonTextCancel: 'Cancel',
					meta: { buttonConfirmClasses: 'bg-pink-500 hover:bg-pink-600 text-white' },
					response: (r: boolean) => handleConfirmation(r)
				};
				break;
			default:
				const actionText = status.charAt(0).toUpperCase() + status.slice(1);
				modalSettings = {
					type: 'confirm',
					title: `Confirm ${actionText}`,
					body: `Are you sure you want to set status to '${status}' for ${itemCount} ${itemText}?`,
					response: (r: boolean) => handleConfirmation(r),
					buttonTextConfirm: actionText
				};
				break;
		}
		// Trigger the modal
		modalStore.trigger(modalSettings);
	});

	let categoryName = $derived.by(() => {
		if (!currentCollection?._id || !contentStructure.value) return '';

		// Get parent categories excluding current collection name
		const pathSegments = currentCollection.path?.split('/').filter(Boolean);
		return pathSegments?.slice(0, -1).join(' >') || '';
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
				return rawData?.entryList.find((rawEntry) => rawEntry._id === selectedId);
			})
			.filter(Boolean); // Filter out any potential undefined values

	// Callback function to refresh data after an action is successful
	const onActionSuccess = () => {
		invalidateCollectionCache(collection.value!._id);
		refreshTableData();
	};

	// Handlers that call the centralized action functions
	const onPublish = () => setEntriesStatus(getSelectedIds(), StatusTypes.publish, onActionSuccess, toastStore);
	const onUnpublish = () => setEntriesStatus(getSelectedIds(), StatusTypes.unpublish, onActionSuccess, toastStore);
	const onTest = () => setEntriesStatus(getSelectedIds(), 'test', onActionSuccess, toastStore);
	const onDelete = () => deleteEntries(getSelectedIds(), showDeleted, onActionSuccess, modalStore, toastStore);
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
		console.log('executePublish called - should execute directly without modal');
		await executeStatusChange(StatusTypes.publish);
	}
	async function executeUnpublish() {
		console.log('executeUnpublish called - should execute directly without modal');
		await executeStatusChange(StatusTypes.unpublish);
	}
	async function executeSchedule() {
		console.log('executeSchedule called - should execute directly without modal');
		await executeStatusChange(StatusTypes.schedule);
	}
	async function executeTest() {
		console.log('executeTest called - should execute directly without modal');
		await executeStatusChange('test');
	}

	// Helper function to execute status changes without modals
	async function executeStatusChange(status: keyof typeof statusMap) {
		if (!currentCollection?._id) {
			toastStore.trigger({ message: 'No collection selected', background: 'variant-filled-error' });
			return;
		}

		// Filter out items that are already in the target status
		const modifyList: Array<string> = [];
		for (const [index, isSelected] of Object.entries(selectedMap)) {
			if (isSelected) {
				const entry = tableData[Number(index)];
				if (entry.raw_status !== status) {
					modifyList.push(entry._id);
				}
			}
		}

		if (modifyList.length === 0) {
			toastStore.trigger({
				message: `Selected items are already in '${status}' state or no items selected.`,
				background: 'variant-filled-warning'
			});
			return;
		}

		try {
			// Use new status endpoint for batch updates
			const firstEntryId = modifyList[0];
			await updateStatus(currentCollection._id, firstEntryId, statusMap[status], modifyList);

			// Invalidate cache and refresh the table data
			invalidateCollectionCache(currentCollection._id);
			refreshTableData();
			// Show a success toast
			toastStore.trigger({ message: `Successfully set status to ${status}`, background: 'variant-filled-success' });
		} catch (e) {
			toastStore.trigger({
				message: `Error setting status: ${(e as Error).message}`,
				background: 'variant-filled-error'
			});
		}
	}
	async function executeDelete() {
		console.log('executeDelete called - should execute directly without modal');
		if (!currentCollection?._id) {
			toastStore.trigger({ message: 'No collection selected.', background: 'variant-filled-error' });
			return;
		}
		const selectedIds = Object.entries(selectedMap)
			.filter(([, isSelected]) => isSelected)
			.map(([index]) => tableData[Number(index)]._id);

		if (selectedIds.length === 0) {
			toastStore.trigger({ message: 'Please select items to delete.', background: 'variant-filled-warning' });
			return;
		}

		try {
			// Check if admin has requested permanent deletion (flag set by admin modal)
			const forcePermantentDelete = (globalThis as any).__adminPermanentDelete === true;

			if (publicEnv.USE_ARCHIVE_ON_DELETE && !forcePermantentDelete) {
				// Archive entries by setting status to archive
				const archivePromises = selectedIds.map((entryId) => updateStatus(currentCollection!._id, entryId, StatusTypes.archive));
				await Promise.all(archivePromises);
				toastStore.trigger({ message: 'Items archived successfully.', background: 'variant-filled-success' });
			} else {
				// Permanently delete entries (either when archiving is disabled or admin forces deletion)
				const deletePromises = selectedIds.map((entryId) => apiRequest('DELETE', currentCollection!._id, {}, entryId));
				await Promise.all(deletePromises);
				toastStore.trigger({
					message: forcePermantentDelete ? 'Items permanently deleted from database.' : 'Items deleted successfully.',
					background: 'variant-filled-success'
				});
			}
			invalidateCollectionCache(currentCollection._id); // Invalidate cache
			refreshTableData(); // Refresh data to show changes
		} catch (e) {
			const actionText = publicEnv.USE_ARCHIVE_ON_DELETE && !(globalThis as any).__adminPermanentDelete ? 'archiving' : 'deleting';
			toastStore.trigger({
				message: `Error ${actionText} items: ${(e as Error).message}`,
				background: 'variant-filled-error'
			});
		}
	}
	// Legacy onClone function - now calls centralized action
	function legacyOnClone() {
		onClone();
	}

	// Show content as soon as we have a collection, even if still loading
	let shouldShowContent = $derived(currentCollection?._id && (hasInitialLoad || loadingState === 'loading'));
	let shouldShowTable = $derived(shouldShowContent && (stableDataExists || tableData.length > 0) && loadingState !== 'loading');
	let shouldShowNoDataMessage = $derived(
		shouldShowContent && !isLoading && tableData.length === 0 && loadingState === 'idle' && hasInitialLoad && stableDataExists === false
	);

	// Use regular visibleTableHeaders - no need for complex transition logic
	let renderHeaders = $derived(visibleTableHeaders);

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
{#if showLoadingSpinner}
	<Loading />
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
				{#if categoryName}<div class="mb-2 text-xs capitalize text-surface-500 dark:text-surface-300 rtl:text-left">
						{categoryName}
					</div>
				{/if}
				<div class="-mt-2 flex justify-start text-sm font-bold uppercase dark:text-white md:text-2xl lg:text-xl">
					{#if currentCollection?.icon}<span>
							<iconify-icon icon={currentCollection.icon} width="24" class="mr-1 text-error-500 sm:mr-2"></iconify-icon></span
						>
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
					isCollectionEmpty={tableData.length === 0}
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

	{#if isLoading && hasInitialLoad && tableData.length === 0}
		<div class="py-4 text-center text-sm text-gray-500">Loading data...</div>
	{:else if isLoading && hasInitialLoad}
		<div class="py-2 text-center text-xs text-gray-400">Refreshing...</div>
	{/if}

	{#if shouldShowTable}
		<div class="table-container max-h-[calc(100dvh-180px)] overflow-auto">
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
						<td class="w-10 {hasSelections ? 'bg-primary-500/10 dark:bg-secondary-500/20' : ''}">
							<div class="flex flex-col items-center">
								<TableIcons
									checked={SelectAll}
									onCheck={(checked) => {
										SelectAll = checked;
									}}
								/>
							</div>
						</td>

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
								<td class="w-10 text-center {selectedMap[index] ? 'bg-primary-500/10 dark:bg-secondary-500/20' : ''}">
									<TableIcons
										checked={selectedMap[index]}
										onCheck={(isChecked) => {
											selectedMap[index] = isChecked;
										}}
									/>
								</td>
								{#each renderHeaders as header (header.id)}
									<td
										class="p-0 text-center text-xs font-bold sm:text-sm {header.name !== 'status'
											? 'cursor-pointer transition-colors duration-200 hover:bg-primary-500/10 dark:hover:bg-secondary-500/20'
											: 'cursor-pointer transition-colors duration-200 hover:bg-warning-500/10 dark:hover:bg-warning-500/20'}"
										title={header.name !== 'status' ? 'Click to edit this entry' : 'Click to change status'}
										onclick={() => {
											if (header.name === 'status') {
												// console.log('🎯 Status column clicked for entry:', entry._id, 'current status:', entry.raw_status);

												// Handle status column click - select this entry and show status change modal
												// First, clear all other selections and select only this entry
												Object.keys(selectedMap).forEach((key) => {
													selectedMap[key] = false;
												});
												selectedMap[index] = true;
												// console.log('✅ Entry selected:', selectedMap);

												// Get current status and determine next logical status
												const currentStatus = entry.raw_status;
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

												// console.log(`🔄 Status change: ${currentStatus} → ${nextStatus}`);

												// Trigger the status change modal
												modifyEntry.value(nextStatus);
											} else {
												const originalEntry = data?.entryList.find((e) => e._id === entry._id);
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
											<Status value={entry.raw_status} />
										{:else if typeof entry[header.name] === 'object' && entry[header.name] !== null}
											{@html entry[header.name][currentLanguage] || '-'}
										{:else}
											{@html entry[header.name] || '-'}
										{/if}
									</td>
								{/each}
							</tr>
						{/each}
					{:else if !isLoading}
						<tr><td colspan={renderHeaders.length + 1} class="py-10 text-center text-gray-500">No entries found.</td></tr>
					{/if}
				</tbody>
			</table>
		</div>
		<!-- Pagination -->
		<div
			class="sticky bottom-0 left-0 right-0 mt-1 flex flex-col items-center justify-center border-t border-surface-300 bg-surface-100 px-2 py-2 dark:border-surface-700 dark:bg-surface-800 md:flex-row md:justify-between md:p-4"
		>
			<TablePagination
				bind:currentPage={entryListPaginationSettings.currentPage}
				bind:rowsPerPage={entryListPaginationSettings.rowsPerPage}
				{pagesCount}
				{totalItems}
				onUpdatePage={(page: number) => {
					if (isCollectionChanging || isInitializing) {
						// console.log(`[EntryList] Skipping onUpdatePage during collection change/initialization`);
						return;
					}
					entryListPaginationSettings.currentPage = page;
					refreshTableData(true);
				}}
				onUpdateRowsPerPage={(rows: number) => {
					if (isCollectionChanging || isInitializing) {
						// console.log(`[EntryList] Skipping onUpdateRowsPerPage during collection change/initialization`);
						return;
					}
					//console.log('Rows per page updated to:', rows);
					entryListPaginationSettings.rowsPerPage = rows;
					entryListPaginationSettings.currentPage = 1;
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
