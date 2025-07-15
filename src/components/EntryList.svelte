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
	import { apiRequest, getData, invalidateCollectionCache } from '@utils/apiClient';
	import { formatDisplayDate } from '@utils/dateUtils';
	import { debounce as debounceUtil, getFieldName, meta_data } from '@utils/utils';
	// Types
	import type { PaginationSettings, TableHeader } from '@components/system/table/TablePagination.svelte';
	// Stores
	import { screenSize } from '@src/stores/screenSizeStore.svelte';
	import { collection, collectionValue, contentStructure, mode, modifyEntry, statusMap } from '@stores/collectionStore.svelte';
	import { contentLanguage, systemLanguage } from '@stores/store.svelte';
	import { handleUILayoutToggle, toggleUIElement, uiStateManager } from '@stores/UIStore.svelte';
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

		console.log(`[EntryList] Collection changed from ${lastCollectionId} to ${currentCollId}`);

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
			console.log(`[EntryList] Loading data for collection ${currentCollId}`);
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
			console.log(`[EntryList] No collection selected, resetting state`);
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
	let showDeleted = $state(false);

	let globalSearchValue = $state('');
	let expand = $state(false);
	let filterShow = $state(false);
	let columnShow = $state(false);

	const currentLanguage = $derived(contentLanguage.value);

	// Debug effect to track language changes
	$effect(() => {
		console.log(`[EntryList] currentLanguage derived updated to: ${currentLanguage}`);
	});
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

		console.log(`[EntryList] refreshTableData called for collection ${currentCollId}, fetchNewData: ${fetchNewData}`);

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

			try {
				console.log(`[EntryList] Fetching data for collection ${currentCollId}`);
				console.log(`[EntryList] Current language: ${currentLanguage}`);
				const page = entryListPaginationSettings.currentPage;
				const limit = entryListPaginationSettings.rowsPerPage;
				const activeFilters: Record<string, string> = {};
				for (const key in entryListPaginationSettings.filters) {
					if (entryListPaginationSettings.filters[key]) activeFilters[key] = entryListPaginationSettings.filters[key];
				}
				// Conditionally add the filter for deleted status
				if (!showDeleted) {
					activeFilters.status = JSON.stringify({ $ne: 'deleted' });
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
					limit,
					contentLanguage: currentLanguage,
					filter: JSON.stringify(activeFilters),
					sort: JSON.stringify(sortParam),
					// Add timestamp when language changed to force cache miss
					_langChange: languageChangeTimestamp
				};

				data = await getData(queryParams);
				console.log(`[EntryList] Data fetched for collection ${currentCollId}, entries: ${data?.entryList?.length || 0}`);
			} catch (error) {
				console.error(`Error fetching data: ${(error as Error).message}`);
				toastStore.trigger({ message: `Error fetching data: ${(error as Error).message}`, background: 'variant-filled-error' });
				loadingState = 'error';
				tableData = []; // Clear data on actual error
				totalItems = 0;
				pagesCount = 1;
				stableDataExists = false;
				return;
			}
		}

		// Process data only if 'data' is available and 'entryList' is an array.
		// Otherwise, ensure tableData is empty.
		if (data?.entryList && Array.isArray(data.entryList)) {
			tableData = await Promise.all(
				data.entryList.map(async (entry) => {
					const obj: { [key: string]: any } = { _id: entry._id, raw_status: entry.status || 'N/A' }; // Ensure _id is always present
					if (currentCollection?.fields) {
						// FIX: Cast `currentCollection.fields` to `any[]` to avoid type conflicts.
						// Runtime checks for properties like `display` and `callback` are used instead.
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
			// If data.entryList is not an array or is null/undefined after a successful fetch (e.g. no data),
			// ensure tableData is empty. This handles the case where `getData` returns an empty
			// object or an object without entryList when no data is present.
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
			console.log(
				`[EntryList] Skipping pagination refresh during collection change (isCollectionChanging: ${isCollectionChanging}, isInitializing: ${isInitializing})`
			);
			return;
		}

		// Only refresh if this is for the same collection AND we've completed initial load
		// Also ensure this isn't the initial setup after collection change
		if (lastCollectionId === collectionId && hasInitialLoad && stableDataExists) {
			console.log(`[EntryList] Pagination/filter/language change for collection ${collectionId}, language: ${language}, refreshing data`);
			refreshDebounce(() => {
				untrack(() => refreshTableData(true));
			});
		} else {
			console.log(
				`[EntryList] Skipping pagination refresh - lastCollectionId: ${lastCollectionId}, collectionId: ${collectionId}, hasInitialLoad: ${hasInitialLoad}, stableDataExists: ${stableDataExists}, language: ${language}`
			);
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
			console.log(`[EntryList] Language changed from ${lastLanguage} to ${language}, invalidating cache for collection ${collectionId}`);
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
				await apiRequest('SETSTATUS', currentCollection._id, {
					ids: modifyList,
					status: statusMap[status]
				});
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
		const itemText = itemCount === 1 ? 'item' : 'items';

		let actionText: string;
		let modalClass = '';

		switch (status) {
			case 'published':
				actionText = 'Publish';
				modalClass = 'modal-confirm-publish';
				break;
			case 'unpublished':
				actionText = 'Unpublish';
				modalClass = 'modal-confirm-unpublish';
				break;
			case 'testing':
				actionText = 'Test';
				modalClass = 'modal-confirm-test';
				break;
			default:
				actionText = status.charAt(0).toUpperCase() + status.slice(1);
				break;
		}

		// Define modal settings
		const modal: ModalSettings = {
			type: 'confirm',
			title: `Confirm ${actionText}`,
			body: `Are you sure you want to set status to '${status}' for ${itemCount} ${itemText}?`,
			response: (r: boolean) => handleConfirmation(r),
			buttonTextConfirm: actionText,
			modalClasses: modalClass
		};
		// Trigger the modal
		modalStore.trigger(modal);
	});

	let categoryName = $derived.by(() => {
		if (!currentCollection?._id || !contentStructure.value) return '';

		// Get parent categories excluding current collection name
		const pathSegments = currentCollection.path?.split('/').filter(Boolean);
		return pathSegments?.slice(0, -1).join(' >') || '';
	});

	// Functions to handle actions from EntryListMultiButton
	function onPublish() {
		modifyEntry.value('published');
	}
	function onUnpublish() {
		modifyEntry.value('unpublished');
	}
	function onSchedule() {
		const selectedIds = Object.entries(selectedMap)
			.filter(([, isSelected]) => isSelected)
			.map(([index]) => tableData[Number(index)]._id);

		if (selectedIds.length === 0) {
			toastStore.trigger({ message: 'Please select items to schedule.', background: 'variant-filled-warning' });
			return;
		}

		const modal: ModalSettings = {
			type: 'component',
			component: 'ScheduleModal',
			title: 'Schedule Action',
			body: `Select a date, time, and action for the ${selectedIds.length} selected item(s).`,
			response: async (data: { date: string; action: 'published' | 'unpublished' | 'deleted' } | undefined) => {
				if (!data || !currentCollection?._id) return;

				try {
					await apiRequest('SCHEDULE', currentCollection._id, {
						ids: selectedIds,
						schedule: {
							date: data.date,
							action: data.action
						}
					});
					toastStore.trigger({ message: 'Items scheduled successfully.', background: 'variant-filled-success' });
					invalidateCollectionCache(currentCollection._id);
					refreshTableData();
				} catch (e) {
					toastStore.trigger({ message: `Error scheduling items: ${(e as Error).message}`, background: 'variant-filled-error' });
				}
			}
		};
		modalStore.trigger(modal);
	}
	function onDelete() {
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

		const itemCount = selectedIds.length;
		const itemText = itemCount === 1 ? 'item' : 'items';

		const modal: ModalSettings = {
			type: 'confirm',
			title: 'Confirm Deletion',
			body: `Are you sure you want to delete ${itemCount} ${itemText}? This action cannot be undone.`,
			response: async (confirmed: boolean) => {
				if (confirmed) {
					if (!currentCollection?._id) return;
					try {
						await apiRequest('DELETE', currentCollection._id, { ids: JSON.stringify(selectedIds) });
						toastStore.trigger({ message: 'Items deleted successfully.', background: 'variant-filled-success' });
						invalidateCollectionCache(currentCollection._id); // Invalidate cache
						refreshTableData(); // Refresh data to show changes
					} catch (e) {
						toastStore.trigger({ message: `Error deleting items: ${(e as Error).message}`, background: 'variant-filled-error' });
					}
				}
			},
			buttonTextConfirm: 'Delete',
			modalClasses: 'modal-confirm-delete'
		};
		modalStore.trigger(modal);
	}
	function onTest() {
		// Assuming 'testing' is a valid status
		modifyEntry.value('testing');
	}
	function onClone() {
		if (!currentCollection?._id) {
			toastStore.trigger({ message: 'No collection selected.', background: 'variant-filled-error' });
			return;
		}
		const selectedEntries = Object.entries(selectedMap)
			.filter(([, isSelected]) => isSelected)
			.map(([index]) => tableData[Number(index)]);

		if (selectedEntries.length === 0) {
			toastStore.trigger({ message: 'Please select item(s) to clone.', background: 'variant-filled-warning' });
			return;
		}

		const itemCount = selectedEntries.length;
		const itemText = itemCount === 1 ? 'item' : 'items';

		const modal: ModalSettings = {
			type: 'confirm',
			title: 'Confirm Clone',
			body: `Are you sure you want to clone ${itemCount} ${itemText}?`,
			response: async (confirmed: boolean) => {
				if (confirmed) {
					if (!currentCollection?._id) return;
					try {
						const clonePromises = selectedEntries.map((entry) => {
							const clonedPayload = { ...entry };
							delete clonedPayload._id; // Remove original ID
							delete clonedPayload.createdAt;
							delete clonedPayload.updatedAt;
							clonedPayload.status = 'unpublished';
							return apiRequest('POST', currentCollection!._id, clonedPayload);
						});
						await Promise.all(clonePromises);
						toastStore.trigger({ message: 'Items cloned successfully.', background: 'variant-filled-success' });
						invalidateCollectionCache(currentCollection._id); // Invalidate cache
						refreshTableData();
					} catch (e) {
						toastStore.trigger({ message: `Error cloning items: ${(e as Error).message}`, background: 'variant-filled-error' });
					}
				}
			},
			buttonTextConfirm: 'Clone',
			modalClasses: 'modal-confirm-clone'
		};
		modalStore.trigger(modal);
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
						<td class="w-10 pl-3">
							<TableIcons
								checked={SelectAll}
								onCheck={(checked) => {
									SelectAll = checked;
								}}
							/>
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
							<tr class="divide-x divide-surface-400 dark:divide-surface-700">
								<td class="w-10 text-center">
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
											: ''}"
										title={header.name !== 'status' ? 'Click to edit this entry' : ''}
										onclick={() => {
											if (header.name !== 'status') {
												const originalEntry = data?.entryList.find((e) => e._id === entry._id);
												if (originalEntry) {
													// Load the entry data into collectionValue
													collectionValue.set(originalEntry);

													// Set mode to edit
													mode.set('edit');

													// If the entry is published, automatically set it to unpublished
													// This follows CMS best practices where editing published content
													// creates a draft that needs to be republished
													if (originalEntry.status === 'published') {
														// Update the local collectionValue to unpublished status
														collectionValue.update((current) => ({
															...current,
															status: 'unpublished'
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
						console.log(`[EntryList] Skipping onUpdatePage during collection change/initialization`);
						return;
					}
					entryListPaginationSettings.currentPage = page;
					refreshTableData(true);
				}}
				onUpdateRowsPerPage={(rows: number) => {
					if (isCollectionChanging || isInitializing) {
						console.log(`[EntryList] Skipping onUpdateRowsPerPage during collection change/initialization`);
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
	:global(.modal-confirm-publish .btn-confirm) {
		@apply bg-success-500 text-white;
	}
	:global(.modal-confirm-unpublish .btn-confirm) {
		@apply bg-warning-500 text-white;
	}
	:global(.modal-confirm-delete .btn-confirm) {
		@apply bg-error-500 text-white;
	}
	:global(.modal-confirm-clone .btn-confirm) {
		@apply bg-secondary-500 text-white;
	}
	:global(.modal-confirm-test .btn-confirm) {
		@apply bg-secondary-500 text-white;
	}
</style>
