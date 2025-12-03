<!--
@file src/components/collectionDisplay/EntryList.svelte
@component
**EntryList component to display collections data**

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
	import { logger } from '@utils/logger';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';

	import { browser } from '$app/environment';
	import { untrack } from 'svelte';
	// Utils
	import { batchDeleteEntries, deleteEntry, invalidateCollectionCache, updateEntryStatus } from '@utils/apiClient';
	import { formatDisplayDate } from '@utils/dateUtils';
	import { cloneEntries, setEntriesStatus } from '@utils/entryActions';
	import { debounce, getFieldName, meta_data } from '@utils/utils';
	import { preloadEntry, reflectModeInURL } from '@utils/navigationUtils';
	// Import centralized actions
	// Config
	import { publicEnv } from '@src/stores/globalSettings.svelte';
	// Types
	import type { PaginationSettings, TableHeader } from '@src/content/types';
	import type { StatusType } from '@src/content/types';
	import { StatusTypes } from '@src/content/types';
	// Stores
	import { collection, collectionValue, mode, setCollectionValue, setMode, setModifyEntry, statusMap } from '@stores/collectionStore.svelte';
	// DELETED: globalLoadingStore imports - not needed with SSR
	import { isDesktop, screenSize } from '@stores/screenSizeStore.svelte';
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
	import EntryListMultiButton from './EntryList_MultiButton.svelte';
	import TranslationStatus from './TranslationStatus.svelte';
	// Skeleton
	import { showDeleteConfirm, showStatusChangeConfirm } from '@utils/modalUtils';
	import { showToast } from '@utils/toast';
	// Svelte-dnd-action
	import { dndzone } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';

	const flipDurationMs = 300;

	// =================================================================
	// 1. RECEIVE DATA AS PROPS (From +page.server.ts)
	// =================================================================
	import type { EntryListProps } from './types';

	// =================================================================
	// 1. RECEIVE DATA AS PROPS (From +page.server.ts)
	// =================================================================
	const {
		entries: serverEntries = [],
		pagination: serverPagination = { currentPage: 1, pageSize: 10, totalItems: 0, pagesCount: 1 },
		contentLanguage: propContentLanguage,
		breadcrumb = [],
		collectionStats = null
	}: EntryListProps & {
		breadcrumb?: Array<{ name: string; path: string }>;
		collectionStats?: { _id: string; name: string; count: number; lastModified: string } | null;
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

	function onUpdatePage(newPage: number) {
		entryListPaginationSettings.currentPage = newPage;
		updateURL({ page: newPage });
	}

	function onUpdateRowsPerPage(rows: number) {
		entryListPaginationSettings.rowsPerPage = rows;
		entryListPaginationSettings.currentPage = 1;
		updateURL({ page: 1, pageSize: rows });
	}

	function onSortChange(fieldName: string) {
		const newSorted = { ...entryListPaginationSettings.sorting };
		if (newSorted.sortedBy === fieldName) {
			newSorted.isSorted = newSorted.isSorted === 1 ? -1 : ((newSorted.isSorted === -1 ? 0 : 1) as SortOrder);
			if (newSorted.isSorted === 0) newSorted.sortedBy = '';
		} else {
			newSorted.sortedBy = fieldName;
			newSorted.isSorted = 1;
		}
		entryListPaginationSettings.sorting = newSorted;
		updateURL({
			sort: newSorted.sortedBy || null,
			order: newSorted.isSorted === 1 ? 'asc' : newSorted.isSorted === -1 ? 'desc' : null
		});
	}

	const filterDebounce = debounce(500);

	function onFilterChange(filterName: string, value: string) {
		filterDebounce(() => {
			const newFilters = { ...entryListPaginationSettings.filters };
			if (value) {
				newFilters[filterName] = value;
			} else {
				delete newFilters[filterName];
			}
			entryListPaginationSettings.filters = newFilters;

			// Build filter URL params
			const filterUpdates: Record<string, string | null> = {};
			Object.entries(newFilters).forEach(([key, val]) => {
				filterUpdates[`filter_${key}`] = val || null;
			});
			filterUpdates.page = '1'; // Reset to page 1 on filter change
			updateURL(filterUpdates);
		});
	}

	async function onActionSuccess() {
		// Clear selections
		Object.keys(selectedMap).forEach((key) => delete selectedMap[key]);
		SelectAll = false;
		// Tell SvelteKit to re-run the server load function
		await invalidateAll();
	}

	// =================================================================
	// 4. KEEP REMAINING UI STATE & LOGIC (Selection, Display, etc.)
	// =================================================================

	let SelectAll: boolean = $state(false);
	const selectedMap: Record<string, boolean> = $state({});

	// =================================================================
	// 5. HOVER PRELOADING FOR EDIT MODE (Enterprise UX Optimization)
	// =================================================================
	let hoverPreloadTimeout: ReturnType<typeof setTimeout> | null = null;
	const preloadedEntries = new Map();

	const PRELOAD_CACHE_TTL = 30000; // ms - keep preloaded data for 30 seconds

	// Phase 2: Connection-aware preloading
	let isSlowConnection = $state(false);
	let isPreloadEnabled = $state(true);

	// Phase 2: Predictive preloading - track hover patterns
	const hoverPatterns = new Map(); // entryId -> hover count
	const predictivePreloadQueue: string[] = [];

	// Detect connection speed
	$effect(() => {
		if (browser && 'connection' in navigator) {
			const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
			if (conn) {
				const checkConnection = () => {
					const effectiveType = conn.effectiveType;
					const saveData = conn.saveData;
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

	// Phase 2: Batch preloading during idle time
	async function batchPreloadVisibleEntries() {
		if (!isPreloadEnabled || !browser) return;

		// Use requestIdleCallback for background loading
		if ('requestIdleCallback' in window) {
			(window as any).requestIdleCallback(
				async (deadline: any) => {
					let i = 0;
					const entriesToPreload = tableData.slice(0, 5); // First 5 visible entries

					while (i < entriesToPreload.length && deadline.timeRemaining() > 0) {
						const entry = entriesToPreload[i];
						const cached = preloadedEntries.get(entry._id);

						if (!cached || Date.now() - cached.timestamp > PRELOAD_CACHE_TTL) {
							try {
								const preloadUrl = new URL(page.url);
								preloadUrl.searchParams.set('edit', entry._id);

								// Use new warm-cache endpoint for batch preloading
								await fetch('/api/collections/warm-cache', {
									method: 'POST',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify({
										collectionId: currentCollection?._id,
										entryIds: [entry._id] // We could batch this further if we refactor the loop
									})
								});

								// Keep existing preload for edit page data if needed, or rely on warm cache
								/* await fetch(preloadUrl.toString(), {
									method: 'GET',
									credentials: 'include',
									headers: { 'X-Preload': 'true', 'X-Batch-Preload': 'true' }
								}); */

								preloadedEntries.set(entry._id, {
									data: null,
									timestamp: Date.now(),
									hoverCount: 0
								});

								logger.debug(`[Batch Preload] Entry ${entry._id.substring(0, 8)} preloaded during idle`);
							} catch (error) {
								logger.warn('[Batch Preload] Failed:', error);
							}
						}
						i++;
					}
				},
				{ timeout: 2000 }
			);
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
		}, 10000); // Cleanup every 10 seconds

		return () => clearInterval(cleanupInterval);
	});

	function handleDndConsider(event: CustomEvent) {
		displayTableHeaders = event.detail.items;
	}
	function handleDndFinalize(event: CustomEvent) {
		displayTableHeaders = event.detail.items;
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
	let entryListPaginationSettings = $state(defaultPaginationSettings(collection.value?._id ?? null));

	// Simplified stable state management
	let showDeleted = $state(false); // Controls whether to view active or archived entries
	let globalSearchValue = $state('');
	let expand = $state(false);
	let filterShow = $state(false);
	let columnShow = $state(false);
	const currentStates = $derived.by(() => ({
		language: contentLanguage.value,
		systemLanguage: systemLanguage.value,
		mode: mode.value,
		collection: collection.value,
		screenSize: screenSize.value
	}));

	// Initialize globalSearchValue from URL parameter on mount/navigation
	$effect(() => {
		const urlSearch = page.url.searchParams.get('search') || '';
		if (urlSearch !== globalSearchValue) {
			globalSearchValue = urlSearch;
		}
	});

	// Reactive effect to update URL when globalSearchValue changes (user typing)
	$effect(() => {
		const searchValue = globalSearchValue;
		const currentUrlSearch = page.url.searchParams.get('search') || '';

		// Skip if values match (avoid loop) or initial empty state
		if (searchValue === currentUrlSearch) {
			return;
		}

		// Use untrack to prevent infinite loops from URL changes
		untrack(() => {
			filterDebounce(() => {
				updateURL({
					search: searchValue || null,
					page: searchValue ? 1 : null // Reset to page 1 when searching, preserve page when clearing
				});
			});
		});
	}); // Destructure for easier access
	const currentLanguage = $derived(propContentLanguage || currentStates.language);
	const currentMode = $derived(currentStates.mode);
	const currentCollection = $derived(currentStates.collection);

	// Optimized table headers with better caching
	const tableHeaders = $derived.by((): TableHeader[] => {
		if (!currentCollection?.fields) return [];

		const cacheKey = `${currentCollection._id}-${currentCollection.fields.length}`;

		const schemaHeaders: TableHeader[] = currentCollection.fields.map(
			(field: any): TableHeader => ({
				id: `${cacheKey}-${getFieldName(field)}`,
				label: field.label,
				name: getFieldName(field),
				visible: true
			})
		);

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
					newFilters[th.name] = '';
					filtersChanged = true;
				}
			}
			if (filtersChanged) {
				entryListPaginationSettings.filters = newFilters;
			}
		} else {
			if (Object.keys(entryListPaginationSettings.filters).length > 0) {
				entryListPaginationSettings.filters = {};
			}
		}
	});

	// displayTableHeaders are the actual headers shown, considering user's order/visibility preferences from localStorage
	let displayTableHeaders: TableHeader[] = $state([]);

	$effect(() => {
		// Sync displayTableHeaders with settings or defaults from tableHeaders
		const currentCollId = currentCollection?._id;
		const settings = entryListPaginationSettings;

		if (tableHeaders.length > 0) {
			if (settings.collectionId === currentCollId && Array.isArray(settings.displayTableHeaders) && settings.displayTableHeaders.length > 0) {
				const schemaHeaderMap = new Map(tableHeaders.map((th) => [th.name, th]));
				const reconciledHeaders: TableHeader[] = [];
				const addedNames = new Set();

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

	let selectAllColumns = $state(true);
	$effect(() => {
		selectAllColumns = displayTableHeaders.length > 0 ? displayTableHeaders.every((h) => h.visible) : false;
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
				Object.keys(selectedMap).forEach((key) => delete selectedMap[key]);
				SelectAll = false;
			});
		}
	});

	function process_selectAllRows(selectAllState: boolean) {
		if (!Array.isArray(tableData)) return;

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

	const hasSelections = $derived.by(() => {
		return Object.values(selectedMap).some((isSelected) => isSelected);
	});

	setModifyEntry(async (status?: keyof typeof statusMap): Promise<void> => {
		const selectedIds = getSelectedIds();
		if (!selectedIds.length) {
			showToast('No entries selected', 'warning');
			return;
		}

		showStatusChangeConfirm({
			status: String(status ?? ''),
			count: selectedIds.length,
			onConfirm: async () => {
				await setEntriesStatus(selectedIds, status as StatusType, onActionSuccess);
			}
		});
	});

	const pathSegments = $derived(page.url.pathname.split('/').filter(Boolean));
	const categoryName = $derived.by(() => {
		if (breadcrumb && breadcrumb.length > 0) {
			return breadcrumb.map((b) => b.name).join(' > ');
		}
		const segments = pathSegments?.slice() ?? [];
		if (segments.length > 0) {
			segments.shift();
		}
		return segments.slice(0, -1).join('>') || '';
	});

	const getSelectedIds = () =>
		Object.entries(selectedMap)
			.filter(([, isSelected]) => isSelected)
			.map(([index]) => tableData[Number(index)]._id);

	const getSelectedRawEntries = () =>
		Object.entries(selectedMap)
			.filter(([, isSelected]) => isSelected)
			.map(([index]) => tableData[Number(index)])
			.filter(Boolean);

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
		setMode('create');
		setCollectionValue(newEntry);

		// 2. Reflect in URL (passive, no reload)
		reflectModeInURL('create');

		// 3. Toggle UI
		await Promise.resolve();
		handleUILayoutToggle();

		logger.debug('[Create] INSTANT - New entry mode');
	};

	const onPublish = () => setEntriesStatus(getSelectedIds(), StatusTypes.publish, onActionSuccess);
	const onUnpublish = () => setEntriesStatus(getSelectedIds(), StatusTypes.unpublish, onActionSuccess);
	const onTest = () => setEntriesStatus(getSelectedIds(), StatusTypes.test, onActionSuccess);
	const onDelete = (isPermanent = false) => {
		const selectedIds = getSelectedIds();
		if (!selectedIds.length) {
			showToast('No entries selected', 'warning');
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
									showToast(`${selectedIds.length} ${selectedIds.length === 1 ? 'entry' : 'entries'} deleted successfully`, 'success');
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
							showToast(`${selectedIds.length} ${selectedIds.length === 1 ? 'entry' : 'entries'} deleted successfully`, 'success');
						}
					} else {
						await setEntriesStatus(selectedIds, StatusTypes.archive, () => {});
					}
					onActionSuccess();
				} catch (error) {
					showToast(`Failed to ${actionVerb} entries: ${(error as Error).message}`, 'error');
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

	function handleSelectAllColumnsToggle() {
		const newVisibility = selectAllColumns;
		displayTableHeaders = displayTableHeaders.map((h) => ({ ...h, visible: newVisibility }));
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
	<div class="dark:bg-error-950 flex h-64 flex-col items-center justify-center rounded-lg border border-error-500 bg-error-50 p-8">
		<svg class="mb-4 h-16 w-16 text-error-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
			/>
		</svg>
		<h3 class="mb-2 text-xl font-bold text-error-600 dark:text-error-400">Collection Not Found</h3>
		<p class="text-center text-error-600 dark:text-error-400">
			The requested collection could not be loaded. Please check the collection name and try again.
		</p>
	</div>
{:else}
	<!-- Header -->
	<div class="mb-2 flex justify-between dark:text-white">
		<!-- Row 1 for Mobile -->
		<div class="flex items-center justify-between">
			<!-- Hamburger -->
			{#if uiStateManager.uiState.value.leftSidebar === 'hidden'}
				<button
					type="button"
					onkeydown={() => {}}
					onclick={() => toggleUIElement('leftSidebar', isDesktop.value ? 'full' : 'collapsed')}
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
							{#if collectionStats}
								<span class="ml-2 text-xs font-normal text-surface-500">({collectionStats.count})</span>
							{/if}
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

					<button class="variant-ghost-surface btn btn-sm" onclick={resetViewSettings}>
						<iconify-icon icon="material-symbols-light:device-reset" width="20" class="mr-1 text-tertiary-500"></iconify-icon>
						Reset View
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

	{#if tableData.length > 0}
		<div class="table-container max-h-[calc(100dvh)] overflow-auto">
			<table
				class="table table-interactive table-hover {entryListPaginationSettings.density === 'compact'
					? 'table-compact'
					: entryListPaginationSettings.density === 'comfortable'
						? 'table-comfortable'
						: ''}"
			>
				<!-- Table Header -->
				<thead class="sticky top-0 z-10 bg-surface-100 text-tertiary-500 dark:bg-surface-900 dark:text-primary-500">
					{#if filterShow && visibleTableHeaders.length > 0}
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
							{#each visibleTableHeaders as header (header.id)}
								<th
									><div class="flex items-center justify-between">
										<FloatingInput
											type="text"
											icon="material-symbols:search-rounded"
											label={`Filter ${(header as TableHeader).label}`}
											name={(header as TableHeader).name}
											value={entryListPaginationSettings.filters[(header as TableHeader).name] || ''}
											onInput={(value: string) => onFilterChange((header as TableHeader).name, value)}
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
							onCheck={(checked: boolean) => {
								SelectAll = checked;
							}}
						/>

						{#each visibleTableHeaders as header (header.id)}
							<th
								class="cursor-pointer px-2 py-1 text-center text-xs sm:text-sm {(header as TableHeader).name ===
								entryListPaginationSettings.sorting.sortedBy
									? 'font-semibold text-primary-500 dark:text-secondary-400'
									: 'text-tertiary-500 dark:text-primary-500'}"
								onclick={() => onSortChange((header as TableHeader).name)}
							>
								<div class="flex items-center justify-center">
									{(header as TableHeader).label}
									{#if (header as TableHeader).name === entryListPaginationSettings.sorting.sortedBy && entryListPaginationSettings.sorting.isSorted !== 0}
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
							<tr
								class="divide-x divide-surface-400 dark:divide-surface-700 {selectedMap[index] ? 'bg-primary-500/5 dark:bg-secondary-500/10' : ''}"
								onmouseenter={() => handleRowHoverStart(entry._id)}
								onmouseleave={handleRowHoverEnd}
							>
								<TableIcons
									cellClass={`w-10 text-center ${selectedMap[index] ? 'bg-primary-500/10 dark:bg-secondary-500/20' : ''}`}
									checked={selectedMap[index]}
									onCheck={(isChecked: boolean) => {
										selectedMap[index] = isChecked;
									}}
								/>
								{#if visibleTableHeaders}
									{#each visibleTableHeaders as header (header.id)}
										<td
											class="p-0 text-center text-xs font-bold sm:text-sm {(header as TableHeader).name !== 'status'
												? 'cursor-pointer transition-colors duration-200 hover:bg-primary-500/10 dark:hover:bg-secondary-500/20'
												: 'cursor-pointer transition-colors duration-200 hover:bg-warning-500/10 dark:hover:bg-warning-500/20'}"
											title={(header as TableHeader).name !== 'status' ? 'Click to edit this entry' : 'Click to change status'}
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
																const result = await updateEntryStatus(collId, entry._id, String(nextStatus));
																if (result.success) {
																	showToast(`Entry status updated to ${nextStatus}`, 'success');
																	onActionSuccess();
																} else {
																	showToast(result.error || 'Failed to update entry status', 'error');
																}
															} catch (error) {
																logger.error('Error updating entry status:', error);
																showToast('An error occurred while updating entry status', 'error');
															}
														}
													});
												} else {
													// ✅ GUI-FIRST PATTERN: Navigate to edit mode (loads full multilingual data)
													const originalEntry = tableData.find((e: any) => e._id === entry._id);
													if (originalEntry) {
														// Navigate to edit mode - this triggers SSR to load full multilingual data
														// List view has language-projected data, edit mode needs all languages
														const newUrl = `${page.url.pathname}?edit=${originalEntry._id}`;
														goto(newUrl);
														logger.debug(`[Edit] Loading full data for entry ${originalEntry._id}`);
													}
												}
											}}
										>
											{#if (header as TableHeader).name === 'status'}
												<div class="flex w-full items-center justify-center">
													<Status value={entry.status || entry.raw_status || 'draft'} />
												</div>
											{:else if (header as TableHeader).name === 'createdAt' || (header as TableHeader).name === 'updatedAt'}
												<div class="flex flex-col text-xs">
													<div class="font-semibold">
														{formatDisplayDate(entry[(header as TableHeader).name], 'en', { year: 'numeric', month: 'short', day: 'numeric' })}
													</div>
													<div class="text-surface-500 dark:text-surface-400">
														{formatDisplayDate(entry[(header as TableHeader).name], 'en', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
													</div>
												</div>
											{:else if typeof entry[(header as TableHeader).name] === 'object' && entry[(header as TableHeader).name] !== null}
												{@const fieldData = entry[(header as TableHeader).name]}
												{@const translatedValue = fieldData[currentLanguage] || Object.values(fieldData)[0] || '-'}
												{@const debugInfo = `Field: ${(header as TableHeader).name}, Lang: ${currentLanguage}, Data: ${JSON.stringify(fieldData)}, Value: ${translatedValue}`}
												{#if (header as TableHeader).name === 'last_name'}
													<span title={debugInfo}>{@html translatedValue}</span>
												{:else}
													{@html translatedValue}
												{/if}
											{:else}
												{@html entry[(header as TableHeader).name] || '-'}
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
				currentPage={serverPagination.currentPage}
				rowsPerPage={serverPagination.pageSize}
				{pagesCount}
				{totalItems}
				{onUpdatePage}
				{onUpdateRowsPerPage}
			/>
		</div>
	{:else}
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
