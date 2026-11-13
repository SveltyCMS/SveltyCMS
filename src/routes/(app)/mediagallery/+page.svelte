<!--
@file src/routes/(app)/mediagallery/+page.svelte
@component
**Enhanced Media Gallery Page**

### Features:
- Global hotkeys via src/utils/hotkeys.ts
- Drag media onto sidebar folders or breadcrumbs (same targets everywhere)
- Mobile: the sidebar drawer opens itself on drag and closes when the drag
  ends; tapping a breadcrumb also moves a selection without dragging
-->

<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import {
		Collections_MediaGallery,
		mediagallery_advanced_search,
		mediagallery_batch_processor,
		mediagallery_cancel_upload,
		mediagallery_create_folder,
		mediagallery_del_esc_hint,
		mediagallery_done_button,
		mediagallery_download_archive,
		mediagallery_drop,
		mediagallery_drop_move_hint,
		mediagallery_filter_status,
		mediagallery_filter_type,
		mediagallery_folder_drop_path,
		mediagallery_grid_size,
		mediagallery_grid_view,
		mediagallery_loading_more,
		mediagallery_loading_table,
		mediagallery_list_pagination_sr,
		mediagallery_new_folder,
		mediagallery_search_assets,
		mediagallery_search_modf,
		mediagallery_selected,
		mediagallery_select_button,
		mediagallery_sort_by,
		mediagallery_status_all,
		mediagallery_status_failed,
		mediagallery_status_processing,
		mediagallery_status_ready,
		mediagallery_table_view,
		mediagallery_tap_parent_hint,
		mediagallery_toggle_selection,
		mediagallery_upload,
		mediagallery_upload_progress,
		mediagallery_view_mode,
		media_root_title,
		button_cancel
	} from '@src/paraglide/messages';
	import { slide } from 'svelte/transition';
	import { refreshAll, goto, replaceState } from '$app/navigation';
	import { browser } from '$app/env';
	import { page } from '$app/state';
	import type { PageData } from './$types';
	import MediaGrid from './media-grid.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import Portal from '@components/ui/portal.svelte';
	import type { SearchCriteria } from '@utils/media/advanced-search';
	import {
		hasMediaStructuredFilters,
		readMediaStructuredFilters
	} from '@utils/media/media-query-filters';
	import { mediaUrl, updateMediaMetadata, MEDIA_UPLOAD_ACCEPT } from '@utils/media/media-utils';
	import {
		IMAGE_EDITOR_MODAL_CLASSES,
		IMAGE_EDITOR_MODAL_SIZE
	} from '@src/components/image-editor/image-editor-modal.ts';
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import Slot from '@components/system/slot.svelte';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { logger } from '@utils/logger';
	import { motionDuration } from '@utils/admin-transitions';
	import type { MediaBase, MediaImage } from '@utils/media/media-models';
	import {
		MediaTypeEnum,
		normalizeProcessingStatus,
		type MediaType
	} from '@utils/media/media-values';
	import { droppable, dndState, type DragDropState } from '@thisux/sveltednd';
	import {
		MEDIA_DRAG_CONTAINER,
		MEDIA_DROP_OK,
		MEDIA_DROP_SAME,
		moveMediaToFolder,
		type MediaDragData
	} from '@utils/media/media-dnd';
	import { useMediaDragSidebar } from '@utils/media/media-drag-sidebar.svelte.ts';
	import { modalState } from '@utils/modal.svelte';
	import { showConfirm } from '@utils/modal.svelte';
	import { registerHotkey } from '@src/utils/hotkeys';
	import { clientJsonHeaders } from '@utils/security/client-csrf';
	import { uploadMediaFilesHandle } from '@utils/media/upload-client';
	import { matchesJsonPathFilter } from '@utils/json-path-filter';
	import { SvelteSet } from 'svelte/reactivity';
	import Button from '@components/ui/button.svelte';
	import Breadcrumb from '@components/ui/breadcrumb.svelte';
	import Input from '@components/ui/input.svelte';
	import Select from '@components/ui/select.svelte';
	import SmartTableSavedViewsMenu from '@components/ui/smart-table/smart-table-saved-views-menu.svelte';
	import type { SmartTableSavedView } from '@utils/smart-table-saved-views';
	import {
		buildMediaAdvancedSearchUrl,
		buildMediaSearchUrl,
		clientSideCriteria,
		MEDIA_SEARCH_MAX_LENGTH,
		structuredFiltersFromCriteria
	} from './media-search-query';
	import { compareMedia, dateBoundToIso, matchesDateBounds } from './media-sort';

	let { data }: { data: PageData } = $props();

	// State
	//
	// Seed from the SSR payload, not from the `$effect` below: effects never run
	// on the server, so an empty seed made SSR paint `media-grid-empty` (a
	// `col-span-full` row) and the grid swap to tiles after hydration — while the
	// empty state's 200ms outro finished, a stale full-width row stayed in the
	// grid and every tile then jumped up by its height. Seeding keeps the
	// pre-hydration box and the settled box identical.
	// untrack: one-time seed from page data — avoids state_referenced_locally on $props().
	const initialMedia = untrack(
		() => ((data as { media?: unknown }).media ?? []) as Array<MediaBase | MediaImage>
	);
	let files = $state<Array<MediaBase | MediaImage>>([...initialMedia]);

	/** Server page contract for the gallery (see `+page.server.ts` → `mediaPagination`). */
	interface MediaPagination {
		page: number;
		pageSize: number;
		total: number;
		hasNextPage: boolean;
		hasPreviousPage: boolean;
	}

	const mediaPagination = $derived<MediaPagination>(
		(data as { mediaPagination?: MediaPagination }).mediaPagination ?? {
			page: 1,
			pageSize: 100,
			total: files.length,
			hasNextPage: false,
			hasPreviousPage: false
		}
	);
	let isLoadingMore = $state(false);

	// Filters seed from the URL so a shared link restores the whole view, not just
	// `jsonPath`. `replaceState` keeps the URL in step without re-running the load.
	const initialParams = untrack(() => page.url.searchParams);
	function mediaTypeFromParam(value: string | null): 'All' | MediaType {
		return value && (Object.values(MediaTypeEnum) as string[]).includes(value)
			? (value as MediaType)
			: 'All';
	}
	function statusFromParam(value: string | null): 'all' | 'processing' | 'ready' | 'failed' {
		return value === 'processing' || value === 'ready' || value === 'failed' ? value : 'all';
	}
	function sortFromParams(sort: string | null, dir: string | null): string {
		const ascending = dir === 'asc';
		switch (sort) {
			case 'filename':
				return ascending ? 'name-asc' : 'name-desc';
			case 'size':
				return ascending ? 'size-asc' : 'size-desc';
			case 'createdAt':
			case 'updatedAt':
				return ascending ? 'oldest' : 'newest';
			default:
				return 'newest';
		}
	}

	let globalSearchValue = $state(initialParams.get('q') ?? initialParams.get('search') ?? '');
	let selectedMediaType = $state<'All' | MediaType>(mediaTypeFromParam(initialParams.get('type')));
	let selectedProcessingStatus = $state<'all' | 'processing' | 'ready' | 'failed'>(
		statusFromParam(initialParams.get('status'))
	);
	let view = $state<'grid' | 'table'>('grid');
	let gridSize = $state<'tiny' | 'small' | 'medium' | 'large'>('small');
	/** Grid density is one cycling control; the four-letter segmented row was redundant chrome. */
	const GRID_SIZES = ['tiny', 'small', 'medium', 'large'] as const;
	const GRID_SIZE_LABELS: Record<(typeof GRID_SIZES)[number], string> = {
		tiny: 'XS',
		small: 'S',
		medium: 'M',
		large: 'L'
	};
	function cycleGridSize() {
		const next = (GRID_SIZES.indexOf(gridSize) + 1) % GRID_SIZES.length;
		gridSize = GRID_SIZES[next] ?? 'small';
	}
	let selectedFiles = $state(new SvelteSet<string>());
	let isSelectionMode = $state(false);
	let fileUploadInput = $state<HTMLInputElement>();
	let isUploading = $state(false);
	let uploadProgress = $state(0);
	let uploadFileLabel = $state('');
	let uploadCancel: (() => void) | null = $state(null);
	let isBulkDownloading = $state(false);
	let showBatchProcessor = $state(false);
	let focalFile = $state<MediaImage | null>(null);
	let showFocalModal = $state(false);
	let showAdvancedSearch = $state(false);
	let searchCriteria = $state<SearchCriteria | null>(null);
	// Seed from server ?jsonPath= for shareable filtered views
	// svelte-ignore state_referenced_locally — data is from $props(), initial seed only
	let jsonPathFilter = $state((data as { jsonPathFilter?: string }).jsonPathFilter ?? '');
	let sortBy = $state(sortFromParams(initialParams.get('sort'), initialParams.get('dir')));
	let mobileFiltersExpanded = $state(false);

	/** Client sort value → the adapter's `sort`/`dir` query contract. */
	const MEDIA_SORT_PARAMS: Record<
		string,
		{ sort: 'updatedAt' | 'filename' | 'size'; dir: 'asc' | 'desc' }
	> = {
		newest: { sort: 'updatedAt', dir: 'desc' },
		oldest: { sort: 'updatedAt', dir: 'asc' },
		'name-asc': { sort: 'filename', dir: 'asc' },
		'name-desc': { sort: 'filename', dir: 'desc' },
		'size-desc': { sort: 'size', dir: 'desc' },
		'size-asc': { sort: 'size', dir: 'asc' }
	};

	/** Last query the effect wrote — avoids a replaceState per unchanged render. */
	let lastSyncedQuery: string | null = null;

	/**
	 * Query the server has already answered (`?q=`; the loader still accepts the
	 * legacy `?search=` alias). The input is committed to the URL only after a
	 * typing pause, so typing in a 20k folder does not spend one load per keystroke.
	 */
	const committedSearchQuery = $derived(
		(page.url.searchParams.get('q') ?? page.url.searchParams.get('search') ?? '').trim()
	);

	/**
	 * Structured filters the loader applied (`?mime=`, `?minSize=`, `?minWidth=`, …).
	 * The URL is the single source of truth: the advanced modal writes it through
	 * `goto`, so a shared link and the rendered result cannot disagree.
	 */
	const appliedFilters = $derived(readMediaStructuredFilters(page.url.searchParams));
	const hasAppliedFilters = $derived(hasMediaStructuredFilters(appliedFilters));

	const SEARCH_DEBOUNCE_MS = 300;
	let isSearching = $state(false);
	let searchInFlight = false;
	let queuedSearchQuery: string | null = null;

	$effect(() => {
		if (!browser) return;
		// A filter navigation owns the URL until its load settles, exactly like the
		// search pipeline below; arming a timer mid-flight would race its target.
		if (isSearching) return;

		const next = globalSearchValue.trim().slice(0, MEDIA_SEARCH_MAX_LENGTH);
		// `committedSearchQuery` is read so the effect settles after the server
		// answers: the URL now carries the query and no new timer is armed.
		if (next === committedSearchQuery) return;

		const timer = setTimeout(() => void commitSearchQuery(next), SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	});

	/**
	 * Drive `?q=` from the debounced input. A second search can land while a load
	 * is still in flight; queue it instead of cancelling the navigation so neither
	 * result set is dropped.
	 */
	async function commitSearchQuery(query: string) {
		if (searchInFlight) {
			queuedSearchQuery = query;
			return;
		}
		searchInFlight = true;
		isSearching = true;
		try {
			let next: string | null = query;
			while (next !== null) {
				queuedSearchQuery = null;
				await navigateToSearch(next);
				next = queuedSearchQuery;
			}
		} catch (err) {
			logger.error('Media search navigation failed', err);
			toast.error('Could not load search results');
		} finally {
			searchInFlight = false;
			isSearching = false;
		}
	}

	async function navigateToSearch(query: string) {
		if (query === committedSearchQuery) return;
		// `replace` keeps the history stack clean while typing; `reset: false` leaves
		// scroll and focus alone across the server round-trip (the grid resets its own
		// scroll when the result head changes).
		await goto(buildMediaSearchUrl(page.url.href, query), {
			replace: true,
			reset: false
		});
	}

	/**
	 * Apply an advanced search. The adapter-evaluable criteria (size, dimensions,
	 * MIME) go into the URL and are re-queried across the whole folder; everything
	 * else stays a page-scoped client filter. `?page=` is dropped by the builder —
	 * page 7 of the previous result set is meaningless once the filter changed.
	 */
	async function applyAdvancedSearch(criteria: SearchCriteria, jsonPath: string) {
		const target = buildMediaAdvancedSearchUrl(
			buildMediaSearchUrl(page.url.href, globalSearchValue),
			structuredFiltersFromCriteria(criteria),
			{ jsonPath }
		);

		isSearching = true;
		try {
			await goto(target, { replace: true, reset: false });
		} catch (err) {
			logger.error('Advanced media search navigation failed', err);
			toast.error('Could not apply the advanced search');
		} finally {
			isSearching = false;
		}
	}

	$effect(() => {
		// A search navigation owns the URL until its load settles; writing filter
		// params from here mid-flight would race the `goto` target. The effect
		// re-runs when `isSearching` drops and then writes the current values.
		if (!browser || isSearching) return;

		const jsonPath = jsonPathFilter.trim();
		const sort = MEDIA_SORT_PARAMS[sortBy] ?? MEDIA_SORT_PARAMS.newest!;
		const next: Record<string, string | null> = {
			type: selectedMediaType === 'All' ? null : selectedMediaType,
			status: selectedProcessingStatus === 'all' ? null : selectedProcessingStatus,
			jsonPath: jsonPath || null,
			sort: sortBy === 'newest' ? null : sort.sort,
			dir: sortBy === 'newest' ? null : sort.dir
		};

		const params = new URLSearchParams(window.location.search);
		// One-time alias normalisation: the loader accepts `?search=` from older
		// links. `?q=` is owned by the debounced search effect above, so it is not
		// written here on every keystroke.
		if (params.has('search')) {
			const legacy = (params.get('search') ?? '').trim();
			params.delete('search');
			if (legacy && !params.has('q')) params.set('q', legacy);
		}
		for (const [key, value] of Object.entries(next)) {
			if (value) params.set(key, value);
			else params.delete(key);
		}

		const query = params.toString();
		if (query === lastSyncedQuery) return;
		lastSyncedQuery = query;

		const url = new URL(window.location.href);
		url.search = query;
		void replaceState(url, page.state);
	});

	/** Drives the "no matches" state instead of the first-run empty gallery. */
	const hasActiveFilters = $derived(
		Boolean(
			globalSearchValue.trim() ||
			selectedMediaType !== 'All' ||
			selectedProcessingStatus !== 'all' ||
			jsonPathFilter.trim() ||
			hasAppliedFilters ||
			searchCriteria
		)
	);

	/**
	 * Reset every filter. The structured ones are adapter filters, so they live in
	 * the URL and clearing them needs one navigation. It is issued here together
	 * with the `?q=` reset (`isSearching` holds the debounced search effect off) so
	 * the two pipelines cannot race two different loads.
	 */
	async function clearMediaFilters() {
		globalSearchValue = '';
		selectedMediaType = 'All';
		selectedProcessingStatus = 'all';
		jsonPathFilter = '';
		searchCriteria = null;
		if (!hasAppliedFilters) return;

		isSearching = true;
		try {
			await goto(
				buildMediaAdvancedSearchUrl(buildMediaSearchUrl(page.url.href, ''), {}, { jsonPath: '' }),
				{ replace: true, reset: false }
			);
		} catch (err) {
			logger.error('Clearing media filters failed', err);
			toast.error('Could not clear the filters');
		} finally {
			isSearching = false;
		}
	}

	let bulkMoveFolderId = $state('');
	const folderMoveOptions = $derived.by(() => {
		const all = (data.systemVirtualFolders ?? []) as Array<{
			_id: string;
			name: string;
			path: string;
		}>;
		return all
			.filter((folder) => folder._id !== currentFolderId)
			.map((folder) => ({
				value: folder._id,
				label:
					folder.path && folder.path !== '/'
						? folder.path.split('/').filter(Boolean).join(' / ')
						: folder.name
			}));
	});

	async function handleBulkMove() {
		if (!bulkMoveFolderId) return;
		const label = folderMoveOptions.find((option) => option.value === bulkMoveFolderId)?.label;
		await moveIdsToFolder([...selectedFiles], bulkMoveFolderId, label ?? 'folder');
		bulkMoveFolderId = '';
	}
	/** True only while a media-gallery card (not some unrelated drag) is in flight */
	const isMediaDragActive = $derived(
		dndState.isDragging && dndState.sourceContainer === MEDIA_DRAG_CONTAINER
	);
	/** Breadcrumbs accept drops on every viewport — mobile drags the same way */
	const breadcrumbDropEnabled = $derived(isMediaDragActive);
	let isMovingMedia = $state(false);

	function getMediaSavedViewSnapshot(): Omit<
		SmartTableSavedView,
		'id' | 'createdAt' | 'updatedAt' | 'name'
	> {
		return {
			filters: {
				type: selectedMediaType,
				status: selectedProcessingStatus,
				jsonPath: jsonPathFilter,
				view,
				gridSize
			},
			search: globalSearchValue,
			sort: { sortedBy: sortBy, isSorted: 1 as const },
			pageSize: 25
		};
	}

	function applyMediaSavedView(saved: SmartTableSavedView) {
		if (saved.search !== undefined) globalSearchValue = saved.search;
		if (saved.sort?.sortedBy) sortBy = saved.sort.sortedBy;
		if (saved.filters) {
			const f = saved.filters as Record<string, any>;
			if (f.type) selectedMediaType = f.type;
			if (f.status) selectedProcessingStatus = f.status;
			if (f.jsonPath !== undefined) jsonPathFilter = f.jsonPath;
			if (f.view === 'grid' || f.view === 'table') view = f.view;
			if (f.gridSize) gridSize = f.gridSize;
		}
	}

	// Mobile: surface the sidebar folder tree for the duration of the drag.
	useMediaDragSidebar(() => isMediaDragActive);

	const sortOptions = [
		{ value: 'newest', label: 'Newest first' },
		{ value: 'oldest', label: 'Oldest first' },
		{ value: 'name-asc', label: 'Name (A-Z)' },
		{ value: 'name-desc', label: 'Name (Z-A)' },
		{ value: 'size-desc', label: 'Size (Largest)' },
		{ value: 'size-asc', label: 'Size (Smallest)' }
	];

	// Keep the grid in sync with server data: re-runs whenever `load` re-fetches
	// (e.g. after invalidateAll following an upload), so new media appears without
	// a full page reload. Local optimistic edits (delete/edit) mutate `files`
	// directly and are reconciled on the next invalidation.
	$effect(() => {
		const incoming = (data?.media ?? []) as unknown as (MediaBase | MediaImage)[];
		if (mediaPagination.page <= 1) {
			files = [...incoming];
			return;
		}
		// `refreshAll()` on a deep page re-delivers only that page — merge instead of
		// clobbering the pages the user already revealed by scrolling.
		const known = new Set(untrack(() => files).map(mediaFileKey));
		const additions = incoming.filter((file) => !known.has(mediaFileKey(file)));
		if (additions.length > 0) files = [...files, ...additions];
	});

	/** Stable identity across server pages (`_id` is always present on gallery rows). */
	function mediaFileKey(file: MediaBase | MediaImage): string {
		return String(file._id ?? file.filename ?? '');
	}

	/**
	 * Go to a server page of the listing. `?page=` is sanitised server-side; page 1
	 * deletes the param so folder links and the browser URL stay clean.
	 */
	async function navigateMediaPage(pageNumber: number) {
		const target = new URL(page.url.href);
		if (pageNumber <= 1) target.searchParams.delete('page');
		else target.searchParams.set('page', String(pageNumber));
		if (target.href === page.url.href) {
			await refreshAll();
			return;
		}
		// Pagination is query state, not a route change — the sanctioned goto escape
		// hatch. `replace` keeps infinite scroll from flooding the history stack.
		await goto(target, { reset: false, replace: pageNumber > 1 });
	}

	/** Fetch the next 100 rows of the folder (grid sentinel / table "load more"). */
	async function loadMoreMedia() {
		if (isLoadingMore || isSearching || !mediaPagination.hasNextPage) return;
		isLoadingMore = true;
		try {
			await navigateMediaPage(mediaPagination.page + 1);
		} catch (err) {
			logger.error('Failed to load more media', err);
			toast.error('Could not load more assets');
		} finally {
			isLoadingMore = false;
		}
	}

	/** Uploads land on page 1 (newest first) — collapse the paged window to show them. */
	async function reloadMediaFromFirstPage() {
		if (mediaPagination.page <= 1) {
			await refreshAll();
			return;
		}
		await navigateMediaPage(1);
	}

	const mediaTypes = [
		{ value: 'All', label: 'ALL' },
		{ value: MediaTypeEnum.Image, label: 'IMAGE' },
		{ value: MediaTypeEnum.Document, label: 'DOCUMENT' },
		{ value: MediaTypeEnum.Audio, label: 'AUDIO' },
		{ value: MediaTypeEnum.Video, label: 'VIDEO' }
	];

	const mediaTypeOptions = mediaTypes.map((type) => ({
		value: type.value,
		label: type.label
	}));

	const processingStatusOptions = $derived([
		{ value: 'all', label: mediagallery_status_all() },
		{ value: 'processing', label: mediagallery_status_processing() },
		{ value: 'ready', label: mediagallery_status_ready() },
		{ value: 'failed', label: mediagallery_status_failed() }
	]);

	// Published media reference gating
	const publishedMediaIds = $derived(
		new SvelteSet<string>((data as { publishedMediaIds?: string[] }).publishedMediaIds ?? [])
	);

	// Derived
	/** The batch engine (Sharp) only processes images; the panel explains the rest. */
	const selectedImageIds = $derived(
		files
			.filter((file) => file.type === 'image' && selectedFiles.has(mediaFileKey(file)))
			.map(mediaFileKey)
	);

	const filteredFiles = $derived.by(() => {
		// Quick search (`?q=`) and the advanced size/dimension/MIME filters are
		// server-side — the adapter applies them before LIMIT and COUNT, so they cover
		// the whole library. Re-filtering them here would both duplicate the work and
		// hide a valid server match whose slimmed gallery row omitted the field.
		// Everything still below runs on the assets loaded so far (page-scoped).

		// Advanced-search date bounds: converted once per filter pass (not two
		// `Date` allocations per row). Canonical ISO rows then compare as strings.
		const uploadedAfterIso = dateBoundToIso(searchCriteria?.uploadedAfter);
		const uploadedBeforeIso = dateBoundToIso(searchCriteria?.uploadedBefore);

		let result = files.filter((file) => {
			if (selectedMediaType !== 'All' && file.type !== selectedMediaType) {
				return false;
			}
			if (selectedProcessingStatus !== 'all') {
				const status =
					normalizeProcessingStatus(
						(file.metadata as Record<string, unknown> | undefined)?.processingStatus
					) ?? 'ready';
				if (status !== selectedProcessingStatus) return false;
			}

			if (searchCriteria) {
				const img = file as MediaImage;
				const meta = file.metadata as Record<string, any> | undefined;

				if (
					searchCriteria.filename &&
					!file.filename?.toLowerCase().includes(searchCriteria.filename.toLowerCase())
				)
					return false;
				if (!matchesDateBounds(file.createdAt, uploadedAfterIso, uploadedBeforeIso)) {
					return false;
				}

				if (searchCriteria.tags && searchCriteria.tags.length > 0) {
					const tags = meta?.tags as string[] | undefined;
					if (!tags || !searchCriteria.tags.some((t) => tags.includes(t))) return false;
				}
				if (
					searchCriteria.camera &&
					(!meta?.exif || (meta.exif as any).camera !== searchCriteria.camera)
				)
					return false;
				if (
					searchCriteria.location &&
					(!meta?.exif || (meta.exif as any).location !== searchCriteria.location)
				)
					return false;
				if (searchCriteria.dominantColor && meta?.dominantColor !== searchCriteria.dominantColor)
					return false;
				if (searchCriteria.hasEXIF !== undefined) {
					const hasExif = !!meta?.exif;
					if (hasExif !== searchCriteria.hasEXIF) return false;
				}
				if (searchCriteria.aspectRatio) {
					if (!img.width || !img.height) return false;
					const ratio = img.width / img.height;
					if (searchCriteria.aspectRatio === 'landscape' && ratio <= 1) return false;
					if (searchCriteria.aspectRatio === 'portrait' && ratio >= 1) return false;
					if (searchCriteria.aspectRatio === 'square' && ratio !== 1) return false;
				}
			}

			// JSON path filter: `metadata.camera = Canon` · multi AND via `;`
			// Applied independently of advanced search so ?jsonPath= / live input always work.
			if (jsonPathFilter.trim() && !matchesJsonPathFilter(file, jsonPathFilter)) {
				return false;
			}

			return true;
		});

		result.sort((a, b) => compareMedia(a, b, sortBy));

		return result;
	});

	// Breadcrumb trail mirroring the sidebar folder path. Each ancestor segment of
	// the current folder's path is resolved back to its folder via systemVirtualFolders.
	const breadcrumbs = $derived.by(() => {
		const crumbs: Array<{ name: string; folderId: string | null }> = [
			// The page title lives in AdminPageShell; the root crumb must read as a
			// path ("Media Root", same as the sidebar), not repeat the page title.
			{ name: media_root_title(), folderId: null }
		];
		const current = data.currentFolder as { path?: string } | null;
		if (current?.path && current.path !== '/') {
			const all = (data.systemVirtualFolders ?? []) as Array<{
				_id: string;
				name: string;
				path: string;
			}>;
			let ancestor = '';
			for (const segment of current.path.split('/').filter(Boolean)) {
				ancestor += `/${segment}`;
				const match = all.find((f) => f.path === ancestor);
				crumbs.push({ name: match?.name ?? segment, folderId: match?._id ?? null });
			}
		}
		return crumbs;
	});

	// The primitive owns the list semantics and separators; `data` carries the
	// folder id into the custom crumb snippet so drop targets stay identical.
	const breadcrumbItems = $derived(
		breadcrumbs.map((crumb) => ({
			label: crumb.name,
			href: crumb.folderId ? `/mediagallery?folderId=${crumb.folderId}` : '/mediagallery',
			data: { folderId: crumb.folderId }
		}))
	);

	const assetStats = $derived.by(() => ({
		total: files.length,
		filtered: filteredFiles.length,
		selected: selectedFiles.size
	}));

	// The batch panel operates on the current selection only. Clearing the selection
	// closes it; opening it again is an explicit action from the bulk bar.
	$effect(() => {
		if (assetStats.selected === 0) showBatchProcessor = false;
	});

	const currentFolderId = $derived(
		((data.currentFolder as { _id?: string } | null)?._id as string | undefined) ?? null
	);

	/** Key used for drop highlight / compare (`root` for media gallery root) */
	function crumbDropKey(folderId: string | null): string {
		return folderId ?? 'root';
	}

	/** Recover the folder id from a crumb's opaque `data` payload (null = media root). */
	function crumbFolderId(item: { data?: Record<string, unknown> }): string | null {
		const folderId = item.data?.folderId;
		return typeof folderId === 'string' ? folderId : null;
	}

	function isCurrentCrumb(folderId: string | null): boolean {
		return (folderId ?? null) === currentFolderId;
	}

	async function moveIdsToFolder(
		ids: string[],
		targetFolderId: string | null,
		folderLabel: string
	): Promise<void> {
		if (!ids.length || isMovingMedia) return;

		if ((targetFolderId ?? null) === currentFolderId) {
			toast.info('Already in this folder');
			return;
		}

		isMovingMedia = true;
		try {
			const moved = await moveMediaToFolder(ids, targetFolderId, {
				csrfToken: page.data.csrfToken
			});
			toast.success(
				moved.movedCount === 1
					? `Moved 1 item to ${folderLabel}`
					: `Moved ${moved.movedCount} items to ${folderLabel}`
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Move failed';
			toast.error(message);
			logger.error('[MediaGallery] Breadcrumb move failed', err);
		} finally {
			isMovingMedia = false;
		}
	}

	async function handleBreadcrumbDrop(
		state: DragDropState<MediaDragData>,
		folderId: string | null,
		label: string
	): Promise<void> {
		if (isCurrentCrumb(folderId)) {
			toast.info('Already in this folder');
			return;
		}
		const ids = state.draggedItem?.ids ?? [];
		if (!ids.length) {
			toast.error('No media to move');
			return;
		}
		await moveIdsToFolder(ids, folderId, label);
	}

	/**
	 * Mobile / touch: with a multi-selection active, tapping an ancestor breadcrumb
	 * moves the selection there (HTML5 drag is unreliable on touch devices).
	 * Without a selection, navigation proceeds as normal.
	 */
	function handleBreadcrumbActivate(
		e: MouseEvent,
		folderId: string | null,
		label: string,
		isLast: boolean
	): void {
		if (isLast || isCurrentCrumb(folderId)) return;
		if (selectedFiles.size === 0) return; // let the link navigate

		e.preventDefault();
		e.stopPropagation();
		void moveIdsToFolder([...selectedFiles], folderId, label);
	}

	onMount(() => {
		// Prefetch the table chunk so the first grid → table toggle does not
		// flash the `{#await}` placeholder (a visible layout jump).
		setTimeout(() => void import('./media-table.svelte'), 0);

		// Register Keyboard Shortcuts
		registerHotkey(
			'mod+f',
			() => document.getElementById('media-gallery-search')?.focus(),
			'Focus Search'
		);
		registerHotkey(
			'mod+a',
			() => {
				if (isSelectionMode) {
					filteredFiles.forEach((f) => selectedFiles.add(f._id as string));
				} else {
					isSelectionMode = true;
					filteredFiles.forEach((f) => selectedFiles.add(f._id as string));
				}
			},
			'Select All'
		);
		registerHotkey(
			'escape',
			() => {
				if (selectedFiles.size > 0) selectedFiles.clear();
				else if (globalSearchValue) globalSearchValue = '';
				else if (isSelectionMode) isSelectionMode = false;
			},
			'Clear Selection/Search',
			false
		);
		registerHotkey(
			'delete',
			() => {
				if (selectedFiles.size > 0) {
					const filesToDelete = files.filter((f) => selectedFiles.has(f._id as string));
					handleBulkDelete(filesToDelete);
				}
			},
			'Delete Selected'
		);

		// Wire the grid's empty-state "Upload First File" button, which dispatches
		// an `externalUpload` event with the chosen files.
		const onExternalUpload = (e: Event) => {
			const detail = (e as CustomEvent<{ files: FileList }>).detail;
			if (detail?.files) uploadFiles(detail.files);
		};

		// Sidebar folder drop → optimistic remove from current view, then revalidate
		const onMediaMoved = (e: Event) => {
			const detail = (e as CustomEvent<{ ids: string[]; targetFolderId: string | null }>).detail;
			if (!detail?.ids?.length) return;

			const moved = new Set(detail.ids.map(String));
			// Optimistically drop moved items from the current folder listing
			files = files.filter((f) => !moved.has(String(f._id ?? f.filename)));
			for (const id of moved) {
				selectedFiles.delete(id);
			}
			// Reconcile with server (folder membership, counts, etc.)
			void refreshAll();
		};

		document.addEventListener('externalUpload', onExternalUpload);
		document.addEventListener('mediaMoved', onMediaMoved);
		return () => {
			document.removeEventListener('externalUpload', onExternalUpload);
			document.removeEventListener('mediaMoved', onMediaMoved);
		};
	});

	async function handleEditImage(file: any) {
		// Editor needs the original; gallery tiles use thumbnails via mediaDisplayUrl.
		const fullUrl = file.url || mediaUrl(file);
		if (!fullUrl) {
			toast.error('Invalid image URL');
			return;
		}

		const { default: ImageEditorModal } =
			await import('@src/components/image-editor/image-editor-modal.svelte');
		modalState.trigger(ImageEditorModal as any, {
			image: { ...file, url: fullUrl },
			onsave: handleEditorSave,
			size: IMAGE_EDITOR_MODAL_SIZE,
			modalClasses: IMAGE_EDITOR_MODAL_CLASSES
		});
	}

	async function handleEditorSave(detail: any) {
		try {
			const { mediaId, manipulations } = detail;
			if (!mediaId) {
				toast.error('Media ID missing');
				return;
			}

			// --- SERVER-SIDE BAKING ---
			const response = await fetch(`/api/media/manipulate/${mediaId}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-Token': page.data.csrfToken ?? ''
				},
				body: JSON.stringify({ manipulations })
			});

			if (response.ok) {
				await response.json();
				toast.success('Image processed and saved');

				await refreshAll();
			} else {
				const error = await response.json();
				toast.error(`Save failed: ${error.message || 'Unknown error'}`);
			}
		} catch (err) {
			logger.error('Editor save failed', err);
			toast.error('An unexpected error occurred during save');
		}
	}

	/**
	 * SvelteKit answers a form action with an `ActionResult` envelope (`type`
	 * `success` | `failure` | `error`); a 200 status can still be a failure, so
	 * both the status and the envelope are part of the outcome.
	 */
	async function evaluateDeleteResponse(
		response: Response
	): Promise<{ ok: boolean; message?: string }> {
		const envelope = (await response.json().catch(() => null)) as {
			type?: string;
			error?: { message?: string };
		} | null;
		if (response.ok && envelope?.type === 'success') return { ok: true };
		return {
			ok: false,
			message: envelope?.error?.message ?? `HTTP ${response.status}`
		};
	}

	async function handleBulkDelete(filesToDelete: (MediaBase | MediaImage)[]) {
		const referenced = filesToDelete.filter((file) =>
			publishedMediaIds.has(mediaFileKey(file))
		).length;
		showConfirm({
			title: `Delete ${filesToDelete.length} files?`,
			body:
				referenced > 0
					? `${referenced} of these assets ${referenced === 1 ? 'is' : 'are'} referenced by published content — deleting will break those references. This action cannot be undone.`
					: 'This action cannot be undone.',
			onConfirm: async () => {
				// Per-file outcomes: an HTTP or action error must never be announced as
				// "complete" nor hide the asset — the row still exists on the server.
				const deletedKeys = new Set<string>();
				const failedNames: string[] = [];

				for (const file of filesToDelete) {
					const formData = new FormData();
					formData.append('imageData', JSON.stringify(file));
					try {
						const response = await fetch('?/deleteMedia', { method: 'POST', body: formData });
						const outcome = await evaluateDeleteResponse(response);
						if (outcome.ok) {
							deletedKeys.add(mediaFileKey(file));
						} else {
							failedNames.push(file.filename);
							logger.warn(`Bulk delete failed for ${file._id}: ${outcome.message}`);
						}
					} catch (err) {
						failedNames.push(file.filename);
						logger.error(`Bulk delete request failed for ${file._id}`, err);
					}
				}

				// Only confirmed deletions leave the list and the selection, so failed
				// rows stay visible for a retry.
				files = files.filter((f) => !deletedKeys.has(mediaFileKey(f)));
				for (const key of deletedKeys) selectedFiles.delete(key);
				await refreshAll();

				if (failedNames.length === 0) {
					toast.success('Batch delete complete');
					return;
				}

				const listed = failedNames.slice(0, 3).join(', ');
				const summary = failedNames.length > 3 ? `${listed}…` : listed;
				if (deletedKeys.size === 0) {
					toast.error(`Batch delete failed: ${summary}`);
				} else {
					toast.warning(
						`${deletedKeys.size} of ${filesToDelete.length} files deleted — ${failedNames.length} failed: ${summary}`
					);
				}
			}
		});
	}

	// Shared upload path for both the toolbar button and the grid's empty-state.
	// Re-syncs the gallery via invalidateAll() (no full page reload) so new media
	// fades in within the current folder context.
	async function uploadFiles(fileList: FileList | File[]) {
		const list = Array.from(fileList ?? []);
		if (!list.length || isUploading) return;

		isUploading = true;
		uploadProgress = 0;
		uploadFileLabel = list.length > 1 ? `0/${list.length}` : list[0]?.name || '';
		const controller = new AbortController();
		const handle = uploadMediaFilesHandle(list, {
			formActionUrl: '?/upload',
			folder: data.currentFolder?._id || 'global',
			// Sequential multi-file for accurate per-file progress labels
			sequential: list.length > 1,
			onProgress: (percent) => {
				uploadProgress = percent;
			},
			onFileProgress: (fp) => {
				uploadProgress = fp.overallPercent;
				uploadFileLabel =
					list.length > 1 ? `${fp.fileIndex + 1}/${fp.fileCount}: ${fp.fileName}` : fp.fileName;
			},
			signal: controller.signal
		});
		uploadCancel = () => {
			controller.abort();
			handle.cancel();
		};
		try {
			const result = await handle.promise;
			if (result.aborted) {
				toast.info('Upload cancelled');
			} else {
				// Sequential uploads continue past a rejected file now, so the outcome
				// list is the honest count — never "uploaded" for the whole batch.
				const outcomes = result.files ?? [];
				const uploaded = outcomes.filter((outcome) => outcome.success).length;
				const reported = outcomes.length || list.length;

				if (result.success) {
					toast.success(
						reported > 1 ? `${reported} files uploaded successfully` : 'Media uploaded successfully'
					);
					await reloadMediaFromFirstPage();
				} else if (uploaded > 0) {
					toast.warning(
						`${uploaded} of ${reported} files uploaded — ${result.message || 'some files failed'}`
					);
					await reloadMediaFromFirstPage();
				} else {
					toast.error(result.message || 'Upload failed');
				}
			}
		} catch (err) {
			logger.error('Upload failed', err);
			toast.error('Upload failed');
		} finally {
			isUploading = false;
			uploadCancel = null;
			uploadProgress = 0;
			uploadFileLabel = '';
		}
	}

	function cancelUpload() {
		uploadCancel?.();
	}

	async function handleBulkDownload() {
		if (selectedFiles.size === 0 || isBulkDownloading) return;

		isBulkDownloading = true;
		try {
			const params = new URLSearchParams();
			for (const id of selectedFiles) {
				params.append('id', id);
			}

			const response = await fetch(`/api/media/bulk-download?${params}`);
			if (!response.ok) {
				const err = await response.json().catch(() => ({}));
				toast.error((err as { message?: string }).message || 'Bulk download failed');
				return;
			}

			const blob = await response.blob();
			const disposition = response.headers.get('Content-Disposition');
			let filename = `media-bulk-${Date.now()}.tar.gz`;
			const match = disposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
			if (match?.[1]) {
				filename = match[1].replace(/['"]/g, '');
			}

			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = filename;
			anchor.click();
			URL.revokeObjectURL(url);
			toast.success('Archive download started');
		} catch (err) {
			logger.error('Bulk download failed', err);
			toast.error('Bulk download failed');
		} finally {
			isBulkDownloading = false;
		}
	}

	async function handleUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		await uploadFiles(input.files ?? []);
		// Reset so selecting the same file again still fires `change`.
		input.value = '';
	}

	/**
	 * `validationMessage` is set when the prompt is re-opened after an empty
	 * submit: the dialog closes itself before the page can inspect the field, so
	 * the message is what tells the user why the previous confirm did nothing.
	 */
	async function handleCreateFolder(validationMessage?: string) {
		const { default: ModalPrompt } = await import('@components/modal-prompt.svelte');
		modalState.trigger(
			ModalPrompt as any,
			{
				title: mediagallery_new_folder(),
				body: validationMessage ?? 'Enter a name for the new folder:',
				value: '',
				type: 'text',
				size: 'md',
				contentClass: 'min-w-80 sm:min-w-sm'
			},
			async (name: string | null) => {
				if (name === null) return; // Cancelled — nothing to validate.

				const folderName = name.trim();
				if (!folderName) {
					// An empty name used to close the dialog and return silently, so the
					// click looked like a no-op. Re-open the prompt with the reason.
					// `ModalManager.close()` detaches the dialog before firing this
					// response, so triggering the next prompt from here is safe.
					void handleCreateFolder('A folder name is required. Enter a name for the new folder:');
					return;
				}

				try {
					const response = await fetch('/api/system-virtual-folder', {
						method: 'POST',
						headers: clientJsonHeaders(page.data.csrfToken),
						body: JSON.stringify({
							name: folderName,
							parent: data.currentFolder?._id
						})
					});
					if (response.ok) {
						toast.success('Folder created');
						// The sidebar owns its own data: `media-folders.svelte` listens for
						// `folderCreated` and reloads only the folder tree.
						document.dispatchEvent(new CustomEvent('folderCreated'));
						// The listing, the breadcrumb trail and the empty state come from the
						// page load, not from the sidebar tree — without re-running it the grid
						// kept painting "No media found" after the folder was created.
						await refreshAll();
					} else {
						const result = await response.json().catch(() => null);
						toast.error(result?.error?.message || result?.message || 'Folder creation failed');
					}
				} catch (err) {
					logger.error('Folder creation failed', err);
					toast.error('Folder creation failed');
				}
			}
		);
	}

	async function handleOpenFileDetails(file: any) {
		const { default: MediaDetailsModal } =
			await import('@src/components/media/media-details-modal.svelte');
		modalState.trigger(MediaDetailsModal as any, {
			file,
			size: 'xl',
			dialogClass: 'max-md:p-0',
			contentClass: 'max-md:overflow-hidden max-md:p-0',
			modalClasses:
				'w-full md:w-[min(88vw,56rem)] md:h-[min(85dvh,42rem)] max-md:max-w-none max-md:max-h-[100dvh] max-md:rounded-none max-md:border-0 max-md:shadow-none',
			onUpdate: (updatedFile: any) => {
				const index = files.findIndex((f) => f._id === updatedFile._id);
				if (index !== -1) {
					files[index] = updatedFile;
				}
			},
			onEdit: (f: MediaImage) => {
				modalState.close();
				handleEditImage(f);
			},
			onDelete: (f: MediaBase | MediaImage) => {
				modalState.close();
				handleDeleteImage(f);
			}
		});
	}

	function handleUpdateImage(updatedFile: MediaImage) {
		if (!updatedFile?._id) return;
		const index = files.findIndex((f) => f._id === updatedFile._id);
		if (index !== -1) {
			files[index] = updatedFile;
		}
	}

	/** Grid/table crosshair action → quick focal-point modal. */
	function handleSetFocalPoint(file: MediaImage) {
		focalFile = file;
		showFocalModal = true;
	}

	async function handleFocalSave(focalPoint: { x: number; y: number }) {
		const target = focalFile;
		if (!target?._id) return;
		try {
			await updateMediaMetadata(String(target._id), { focalPoint });
			// Optimistic tile update so the new object-position applies immediately;
			// `refreshAll` reconciles the rest of the metadata.
			handleUpdateImage({ ...target, metadata: { ...target.metadata, focalPoint } });
			toast.success('Focal point saved');
			focalFile = null;
			await refreshAll();
		} catch (err) {
			logger.error('Focal point save failed', err);
			toast.error('Could not save the focal point');
		}
	}

	async function handleDeleteImage(file: MediaBase | MediaImage) {
		const referenced = publishedMediaIds.has(mediaFileKey(file));
		showConfirm({
			title: `Delete "${file.filename}"?`,
			body: referenced
				? 'This asset is referenced by published content — deleting it will break those references. This action cannot be undone.'
				: 'This action cannot be undone.',
			onConfirm: async () => {
				const formData = new FormData();
				formData.append('imageData', JSON.stringify(file));
				const response = await fetch('?/deleteMedia', { method: 'POST', body: formData });
				const outcome = await evaluateDeleteResponse(response);
				if (outcome.ok) {
					files = files.filter((f) => f._id !== file._id);
					await refreshAll();
					toast.success('File deleted');
				} else {
					toast.error(outcome.message || 'Delete failed');
				}
			}
		});
	}
</script>

{#snippet gridSizeToggle()}
	<Button
		type="button"
		variant="surface"
		size="md"
		onclick={cycleGridSize}
		aria-label={`${mediagallery_grid_size()}: ${GRID_SIZE_LABELS[gridSize]}`}
		title={mediagallery_grid_size()}
		data-testid="media-grid-size-toggle"
		data-size={gridSize}
		class="h-10 min-w-14 shrink-0 gap-1.5 px-2"
	>
		<iconify-icon icon="mdi:image-size-select-small" width="16" aria-hidden="true"></iconify-icon>
		<span class="text-xs font-bold tabular-nums">{GRID_SIZE_LABELS[gridSize]}</span>
	</Button>
{/snippet}

<AdminPageShell
	title={Collections_MediaGallery()}
	icon="bi:images"
	highlight="Gallery"
	showBackButton={true}
	backUrl="/"
	fullHeight={true}
	flushContent={true}
	titleCompact={true}
>
	{#snippet actions()}
		<div class="flex items-center gap-1 sm:gap-1.5">
			<Button
				variant="surface"
				size="sm"
				onclick={() => handleCreateFolder()}
				aria-label={mediagallery_create_folder()}
				data-testid="media-create-folder"
				class="h-9 gap-1.5 px-2 sm:px-3"
			>
				<iconify-icon icon="mdi:folder-plus" width="18"></iconify-icon>
				<span class="hidden sm:inline">{mediagallery_new_folder()}</span>
			</Button>

			<span class="hidden h-4 w-px bg-(--admin-border-default) sm:block" aria-hidden="true"></span>

			<Button
				size="sm"
				variant="primary"
				onclick={() => fileUploadInput?.click()}
				disabled={isUploading}
				aria-busy={isUploading}
				class="h-9 gap-1.5 px-2 sm:px-3"
			>
				<iconify-icon
					icon={isUploading ? 'mdi:loading' : 'mdi:upload'}
					width="18"
					class={isUploading ? 'animate-spin' : ''}
				></iconify-icon>
				<span class="hidden sm:inline">{isUploading ? `Uploading…` : 'Quick upload'}</span>
				<span class="sr-only sm:hidden">{isUploading ? 'Uploading' : 'Quick upload'}</span>
			</Button>

			<Button
				size="sm"
				variant="surface"
				href={`/mediagallery/upload-media${data.currentFolder?._id ? `?folderId=${data.currentFolder._id}` : ''}`}
				title="Stage several files in a queue before uploading"
				class="h-9 gap-1.5 px-2 sm:px-3"
			>
				<iconify-icon icon="mdi:upload-multiple" width="18"></iconify-icon>
				<span class="hidden sm:inline">Queue</span>
				<span class="sr-only sm:hidden">Open the staged upload queue</span>
			</Button>

			<input
				aria-label={mediagallery_upload()}
				type="file"
				multiple
				class="hidden"
				bind:this={fileUploadInput}
				onchange={handleUpload}
				accept={MEDIA_UPLOAD_ACCEPT}
				data-testid="media-upload-input"
			/>
		</div>
	{/snippet}

	{#if isUploading}
		<div class="shrink-0 pb-1">
			<div
				class="flex items-center gap-3 rounded border border-surface-500/30 bg-surface-500/10 p-2 text-xs dark:border-surface-500/40 dark:bg-surface-800"
				role="progressbar"
				aria-label={mediagallery_upload_progress()}
				aria-valuenow={uploadProgress}
				aria-valuemin={0}
				aria-valuemax={100}
			>
				<iconify-icon icon="mdi:upload" width="16" class="shrink-0 text-primary-500"></iconify-icon>
				<div class="h-2 flex-1 overflow-hidden rounded-full bg-surface-300 dark:bg-surface-600">
					<div
						class="h-full rounded-full bg-primary-500 transition-all duration-300"
						style="width: {uploadProgress}%"
					></div>
				</div>
				{#if uploadFileLabel}
					<span
						class="hidden max-w-40 truncate text-(--admin-text-muted) sm:inline dark:text-(--admin-text-muted)"
						title={uploadFileLabel}
					>
						{uploadFileLabel}
					</span>
				{/if}
				<span class="shrink-0 font-medium tabular-nums text-(--admin-text-muted)"
					>{uploadProgress}%</span
				>
				<Button
					variant="outline"
					size="sm"
					type="button"
					onclick={cancelUpload}
					aria-label={mediagallery_cancel_upload()}
					class="shrink-0"
				>
					{button_cancel()}
				</Button>
			</div>
		</div>
	{/if}

	<div class="flex min-h-0 flex-1 flex-col gap-0">
		{#if assetStats.selected > 0}
			<div class="shrink-0">
				<div
					class="flex flex-wrap items-center justify-between gap-2 border-b border-primary-500/30 py-2"
					role="status"
					aria-live="polite"
					data-testid="media-bulk-bar"
				>
					<p class="text-xs text-(--admin-text-muted)">
						<span
							class="font-medium text-(--admin-text-muted) dark:text-surface-100"
							data-testid="media-bulk-count"
							>{assetStats.selected}{' '}{mediagallery_selected()}</span
						>
						<span class="hidden text-(--admin-text-muted) sm:inline dark:text-(--admin-text-muted)">
							{mediagallery_del_esc_hint()}</span
						>
					</p>
					<div class="flex flex-wrap items-center gap-2">
						<div class="w-40 shrink-0">
							<Select
								bind:value={bulkMoveFolderId}
								options={folderMoveOptions}
								placeholder="Move to…"
								aria-label="Move selected media to folder"
								data-testid="media-bulk-move-target"
							/>
						</div>
						<Button
							variant="surface"
							size="sm"
							onclick={handleBulkMove}
							disabled={!bulkMoveFolderId || isMovingMedia}
							aria-busy={isMovingMedia}
							aria-label="Move selected media"
							data-testid="media-bulk-move"
							class="h-8 gap-1.5 px-3"
						>
							<iconify-icon icon="mdi:folder-move-outline" width="16" aria-hidden="true"
							></iconify-icon>
							<span>Move</span>
						</Button>
						<Button
							variant="surface"
							size="sm"
							onclick={() => (showBatchProcessor = !showBatchProcessor)}
							aria-expanded={showBatchProcessor}
							aria-controls="media-batch-processor"
							aria-label={mediagallery_batch_processor()}
							data-testid="media-bulk-batch-process"
							class="h-8 gap-1.5 px-3"
						>
							<iconify-icon icon="mdi:auto-fix" width="16" aria-hidden="true"></iconify-icon>
							<span>{mediagallery_batch_processor()}</span>
						</Button>
						<Button
							variant="surface"
							size="sm"
							onclick={handleBulkDownload}
							disabled={isBulkDownloading}
							aria-busy={isBulkDownloading}
							aria-label={mediagallery_download_archive()}
							data-testid="media-bulk-download"
							class="h-8 gap-1.5 px-3"
						>
							<iconify-icon
								icon={isBulkDownloading ? 'mdi:loading' : 'mdi:archive-arrow-down-outline'}
								width="16"
								class={isBulkDownloading ? 'animate-spin' : ''}
							></iconify-icon>
							<span>{isBulkDownloading ? 'Preparing…' : 'Download Archive'}</span>
						</Button>
					</div>
				</div>
			</div>
		{/if}

		<!--
			Breadcrumbs — always rendered, including at Media Root where the trail is a
			single crumb, so the path strip never collapses to empty space.

			Every crumb is a drop target on every viewport, mirroring the sidebar tree:
			an ancestor takes the media (primary ring), the current folder rejects it
			(error ring) rather than being inert, so the gesture always gets feedback.
		-->
		<div class="shrink-0" data-testid="media-gallery-breadcrumbs">
			<Breadcrumb
				items={breadcrumbItems}
				ariaLabel={mediagallery_folder_drop_path()}
				navClass="flex min-w-0 items-center gap-1 overflow-x-auto border-b border-surface-500/30 py-1 text-sm text-(--admin-text-muted) sm:gap-2.5 dark:border-surface-500/40 dark:text-(--admin-text-muted)"
				listClass="flex w-max shrink-0 items-center gap-1 text-sm sm:gap-2.5"
			>
				{#snippet crumb({ item, isLast })}
					{@const folderId = crumbFolderId(item)}
					{@const dropKey = crumbDropKey(folderId)}
					{@const sameFolder = isCurrentCrumb(folderId)}
					{@const isDropTarget = breadcrumbDropEnabled && dndState.targetContainer === dropKey}
					{@const dropOptions = {
						container: dropKey,
						disabled: !breadcrumbDropEnabled,
						attributes: { dragOverClass: sameFolder ? MEDIA_DROP_SAME : MEDIA_DROP_OK },
						callbacks: {
							onDrop: (state: DragDropState<MediaDragData>) =>
								handleBreadcrumbDrop(state, folderId, item.label)
						}
					}}

					{#if isLast}
						<!-- Current folder: not a link, but still a droppable so the drag is
							 told "already here" with the same error ring the sidebar uses. -->
						<span
							class="inline-flex max-w-48 shrink-0 items-center gap-1 truncate rounded-md px-2 py-2 font-medium text-(--admin-text-body) sm:max-w-[16rem] sm:px-1.5 sm:py-1 dark:text-surface-100"
							aria-current="page"
							data-media-drop-target={dropKey}
							data-testid={`media-breadcrumb-${dropKey}`}
							title={sameFolder && breadcrumbDropEnabled ? 'Already in this folder' : item.label}
							use:droppable={dropOptions}
						>
							{#if isDropTarget}
								<iconify-icon
									icon="mdi:folder-remove-outline"
									width="16"
									class="shrink-0 text-error-500"
									aria-hidden="true"
								></iconify-icon>
							{/if}
							<span class="truncate">{item.label}</span>
						</span>
					{:else}
						<a
							href={item.href ?? '/mediagallery'}
							class="inline-flex max-w-48 shrink-0 items-center gap-1 truncate rounded-md px-2 py-2 text-sm font-medium transition-colors sm:max-w-[16rem] sm:px-1.5 sm:py-1 sm:text-base
								{selectedFiles.size > 0
								? 'bg-surface-500/10 text-surface-800 hover:bg-primary-500/10 hover:text-primary-600 dark:bg-surface-800 dark:text-surface-100 dark:hover:text-primary-400'
								: 'hover:text-primary-500'}"
							data-preload="hover"
							data-media-drop-target={dropKey}
							data-testid={`media-breadcrumb-${dropKey}`}
							aria-label={selectedFiles.size > 0
								? `Move ${selectedFiles.size} selected to ${item.label}`
								: `Open folder ${item.label}`}
							title={selectedFiles.size > 0
								? `Move selection to ${item.label}`
								: `Drop media here (or open) — same as sidebar`}
							use:droppable={dropOptions}
							onclick={(e) => handleBreadcrumbActivate(e, folderId, item.label, isLast)}
						>
							{#if isDropTarget || selectedFiles.size > 0}
								<iconify-icon
									icon={isDropTarget ? 'mdi:folder-move-outline' : 'mdi:folder-outline'}
									width="16"
									class="shrink-0 {isDropTarget ? 'text-primary-500' : 'opacity-70'}"
									aria-hidden="true"
								></iconify-icon>
							{/if}
							<span class="truncate">{item.label}</span>
						</a>
					{/if}
				{/snippet}
			</Breadcrumb>

			{#if selectedFiles.size > 0}
				<p class="pb-2 text-[11px] leading-tight text-(--admin-text-muted)" role="status">
					<span class="sm:hidden">{mediagallery_tap_parent_hint()}</span>
					<span class="hidden sm:inline">
						{mediagallery_drop()}
						{selectedFiles.size}
						{selectedFiles.size === 1 ? 'item' : 'items'}
						{mediagallery_drop_move_hint()}
					</span>
				</p>
			{/if}
		</div>

		<!-- Toolbar -->
		<div class="shrink-0" data-testid="media-gallery-toolbar">
			<!-- Mobile toolbar: search + expand button, then collapsible filters -->
			<div class="flex flex-col gap-1.5 py-1 sm:hidden">
				<div class="flex items-center gap-2">
					<div class="relative min-w-0 flex-1">
						<iconify-icon
							icon="mdi:magnify"
							class="pointer-events-none absolute inset-s-3 top-1/2 z-10 -translate-y-1/2 opacity-50"
							width="18"
						></iconify-icon>
						<Input
							id="media-gallery-search"
							bind:value={globalSearchValue}
							type="search"
							placeholder={mediagallery_search_modf()}
							title="Ctrl/⌘ + F"
							class="w-full ps-9 pe-11 dark:border-surface-500/40 focus-visible:ring-1"
							aria-label={mediagallery_search_assets()}
						/>
						<span class="absolute inset-e-1 top-1/2 z-10 -translate-y-1/2">
							<Button
								type="button"
								variant="transparent"
								size="sm"
								onclick={() => (showAdvancedSearch = true)}
								aria-label={mediagallery_advanced_search()}
								class="h-10! w-10! min-w-0! px-0! text-(--admin-text-muted) hover:bg-surface-500/10 dark:hover:bg-surface-500/20 {searchCriteria ||
								hasAppliedFilters ||
								jsonPathFilter.trim()
									? 'text-primary-500'
									: ''}"
								data-testid="media-advanced-search-mobile"
							>
								<iconify-icon icon="mdi:filter-variant" width="16"></iconify-icon>
							</Button>
						</span>
					</div>
					<Button
						type="button"
						variant="outline"
						size="md"
						onclick={() => (mobileFiltersExpanded = !mobileFiltersExpanded)}
						aria-label={mobileFiltersExpanded ? 'Hide filters' : 'Show filters'}
						aria-expanded={mobileFiltersExpanded}
						class="h-10 w-10 shrink-0 px-0!"
					>
						<iconify-icon
							icon="mdi:chevron-down"
							width="18"
							class="transition-transform duration-200 {mobileFiltersExpanded ? 'rotate-180' : ''}"
						></iconify-icon>
					</Button>
				</div>

				{#if mobileFiltersExpanded}
					<div
						transition:slide={{ duration: motionDuration(200) }}
						class="flex flex-col gap-1.5 pb-1"
					>
						<div class="flex gap-2">
							{#if view === 'grid'}
								<label for="media-type-filter-m" class="sr-only">{mediagallery_filter_type()}</label
								>
								<Select
									id="media-type-filter-m"
									bind:value={selectedMediaType}
									options={mediaTypeOptions}
									placeholder=""
									class="flex-1"
								/>
							{/if}
							<label for="media-status-filter-m" class="sr-only"
								>{mediagallery_filter_status()}</label
							>
							<Select
								id="media-status-filter-m"
								bind:value={selectedProcessingStatus}
								options={processingStatusOptions}
								placeholder=""
								aria-label={mediagallery_filter_status()}
								data-testid="media-status-filter-m"
								class="flex-1"
							/>
							<label for="sort-by-filter-m" class="sr-only">{mediagallery_sort_by()}</label>
							<Select
								id="sort-by-filter-m"
								bind:value={sortBy}
								options={sortOptions}
								placeholder=""
								class="flex-1"
							/>
						</div>
						<div class="flex items-center gap-2">
							<div
								class="flex overflow-hidden rounded border border-surface-500/30 dark:border-surface-600"
								role="group"
								aria-label={mediagallery_view_mode()}
							>
								<Button
									type="button"
									variant={view === 'grid' ? 'primary' : 'ghost'}
									size="md"
									onclick={() => (view = 'grid')}
									aria-label={mediagallery_grid_view()}
									aria-pressed={view === 'grid'}
									class="h-10! w-10! px-0!"
								>
									<iconify-icon icon="mdi:grid-large" width="16"></iconify-icon>
								</Button>
								<Button
									type="button"
									variant={view === 'table' ? 'primary' : 'ghost'}
									size="md"
									onclick={() => (view = 'table')}
									aria-label={mediagallery_table_view()}
									aria-pressed={view === 'table'}
									class="h-10! w-10! px-0! border-s border-surface-500/30 dark:border-surface-600"
								>
									<iconify-icon icon="mdi:format-list-bulleted" width="16"></iconify-icon>
								</Button>
							</div>
							{#if view === 'grid'}
								{@render gridSizeToggle()}
								<Button
									type="button"
									variant={isSelectionMode ? 'primary' : 'outline'}
									size="md"
									onclick={() => (isSelectionMode = !isSelectionMode)}
									aria-label={mediagallery_toggle_selection()}
									aria-pressed={isSelectionMode}
									class="h-10 min-w-20 px-3"
								>
									{isSelectionMode ? mediagallery_done_button() : mediagallery_select_button()}
								</Button>
							{/if}
							<SmartTableSavedViewsMenu
								scope="media"
								getSnapshot={getMediaSavedViewSnapshot}
								onApply={applyMediaSavedView}
							/>
						</div>
					</div>
				{/if}
			</div>

			<!-- Desktop toolbar: wraps instead of collapsing the search field.
			     `flex-wrap` + `min-w-40` keep the primary search usable at 1280px;
			     without it the fixed controls squeezed it to ~24px and the
			     absolutely positioned advanced-search button rendered under the
			     left sidebar (pointer events hit the aside instead of the button). -->
			<div class="hidden flex-wrap items-center justify-center gap-1 py-1 sm:flex">
				<div class="relative min-w-40 flex-1">
					<iconify-icon
						icon="mdi:magnify"
						class="pointer-events-none absolute inset-s-3 top-1/2 z-10 -translate-y-1/2 opacity-50"
						width="18"
					></iconify-icon>
					<Input
						id="media-gallery-search-desktop"
						bind:value={globalSearchValue}
						type="search"
						placeholder={mediagallery_search_modf()}
						title="Ctrl/⌘ + F"
						class="w-full ps-9 pe-11 dark:border-surface-500/40 focus-visible:ring-1"
						aria-label={mediagallery_search_assets()}
					/>
					<span class="absolute inset-e-1 top-1/2 z-10 -translate-y-1/2">
						<Button
							type="button"
							variant="transparent"
							size="sm"
							onclick={() => (showAdvancedSearch = true)}
							aria-label={mediagallery_advanced_search()}
							data-testid="media-advanced-search"
							class="h-10! w-10! min-w-0! px-0! text-(--admin-text-muted) hover:bg-surface-500/10 dark:hover:bg-surface-500/20 {searchCriteria ||
							hasAppliedFilters ||
							jsonPathFilter.trim()
								? 'text-primary-500'
								: ''}"
						>
							<iconify-icon icon="mdi:filter-variant" width="16"></iconify-icon>
						</Button>
					</span>
				</div>

				{#if view === 'grid'}
					<div class="w-28 shrink-0">
						<label for="media-type-filter" class="sr-only">{mediagallery_filter_type()}</label>
						<Select
							id="media-type-filter"
							bind:value={selectedMediaType}
							options={mediaTypeOptions}
							placeholder=""
						/>
					</div>
				{/if}

				<div class="w-40 shrink-0">
					<label for="media-status-filter" class="sr-only">{mediagallery_filter_status()}</label>
					<Select
						id="media-status-filter"
						bind:value={selectedProcessingStatus}
						options={processingStatusOptions}
						placeholder=""
						data-testid="media-status-filter"
					/>
				</div>

				<div class="w-36 shrink-0">
					<label for="sort-by-filter" class="sr-only">{mediagallery_sort_by()}</label>
					<Select id="sort-by-filter" bind:value={sortBy} options={sortOptions} placeholder="" />
				</div>

				<div
					class="flex shrink-0 overflow-hidden rounded border border-(--admin-border-default)"
					role="group"
					aria-label={mediagallery_view_mode()}
				>
					<Button
						type="button"
						variant={view === 'grid' ? 'primary' : 'transparent'}
						size="sm"
						onclick={() => (view = 'grid')}
						class="h-10! w-10! min-w-0! rounded-none! p-0!"
						aria-label={mediagallery_grid_view()}
						aria-pressed={view === 'grid'}
						data-testid="media-view-grid"
					>
						<iconify-icon icon="mdi:grid-large" width="16" aria-hidden="true"></iconify-icon>
					</Button>
					<Button
						type="button"
						variant={view === 'table' ? 'primary' : 'transparent'}
						size="sm"
						onclick={() => (view = 'table')}
						class="h-10! w-10! min-w-0! rounded-none! border-s border-(--admin-border-default) p-0!"
						aria-label={mediagallery_table_view()}
						aria-pressed={view === 'table'}
						data-testid="media-view-table"
					>
						<iconify-icon icon="mdi:format-list-bulleted" width="16" aria-hidden="true"
						></iconify-icon>
					</Button>
				</div>

				{#if view === 'grid'}
					{@render gridSizeToggle()}

					<Button
						type="button"
						variant={isSelectionMode ? 'primary' : 'outline'}
						size="md"
						onclick={() => (isSelectionMode = !isSelectionMode)}
						aria-label={mediagallery_toggle_selection()}
						aria-pressed={isSelectionMode}
						data-testid="media-selection-toggle"
						class="h-10 min-w-20 shrink-0 text-sm"
					>
						{isSelectionMode ? mediagallery_done_button() : mediagallery_select_button()}
					</Button>
				{/if}
				<SmartTableSavedViewsMenu
					scope="media"
					getSnapshot={getMediaSavedViewSnapshot}
					onApply={applyMediaSavedView}
				/>
			</div>
		</div>

		<!--
			Server pagination state (audit F01): the SSR total, not the rendered slice.
			Screen-reader text only — the grid/table carry the visible affordance.
		-->
		<p
			class="sr-only"
			data-testid="media-gallery-pagination"
			data-page={mediaPagination.page}
			data-loaded={files.length}
			data-total={mediaPagination.total}
			data-has-more={mediaPagination.hasNextPage}
		>
			{mediagallery_list_pagination_sr({
				loaded: files.length,
				total: mediaPagination.total
			})}
		</p>

		<!-- Content — data-view is the canonical E2E signal for grid/table mode -->
		<div
			class="relative flex min-h-0 flex-1 flex-col"
			data-testid="media-gallery-content"
			data-view={view}
			aria-busy={isSearching}
		>
			<!--
				Non-blocking refresh state: the current tiles stay painted while the
				debounced ?q= load is in flight, so the search box (toolbar, outside this
				region) never unmounts or loses focus mid-query.
			-->
			{#if isSearching}
				<div
					class="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center"
					role="status"
					aria-live="polite"
					data-testid="media-gallery-searching"
				>
					<span
						class="mt-2 inline-flex items-center gap-2 rounded-full border border-primary-500/30 bg-(--admin-bg-card)/95 px-3 py-1 text-xs font-medium text-(--admin-text-body) shadow-sm"
					>
						<iconify-icon
							icon="mdi:loading"
							width="14"
							class="animate-spin text-primary-500 motion-reduce:animate-none"
							aria-hidden="true"
						></iconify-icon>
						{mediagallery_loading_more()}
					</span>
				</div>
			{/if}

			{#if view === 'grid'}
				<AdminCard class="flex min-h-0 w-full flex-1 flex-col" data-testid="media-grid-card">
					<MediaGrid
						{filteredFiles}
						{gridSize}
						{isSelectionMode}
						bind:selectedFiles
						{publishedMediaIds}
						{hasActiveFilters}
						onClearFilters={clearMediaFilters}
						onCreateFolder={() => handleCreateFolder()}
						serverHasMore={mediaPagination.hasNextPage}
						{isLoadingMore}
						isRefreshing={isSearching}
						onLoadMore={loadMoreMedia}
						onEditImage={handleEditImage}
						onSetFocalPoint={handleSetFocalPoint}
						onOpenFileDetails={handleOpenFileDetails}
						ondeleteImage={handleDeleteImage}
						onUpdateImage={handleUpdateImage}
					/>
				</AdminCard>
			{:else}
				{#await import('./media-table.svelte')}
					<div
						class="flex flex-1 items-center justify-center py-16 text-sm text-(--admin-text-muted)"
					>
						{mediagallery_loading_table()}
					</div>
				{:then mod}
					<mod.default
						{filteredFiles}
						{isSelectionMode}
						bind:selectedFiles
						{publishedMediaIds}
						{hasActiveFilters}
						onClearFilters={clearMediaFilters}
						serverHasMore={mediaPagination.hasNextPage}
						serverTotal={mediaPagination.total}
						serverLoaded={files.length}
						{isLoadingMore}
						onLoadMore={loadMoreMedia}
						onEditImage={handleEditImage}
						onSetFocalPoint={handleSetFocalPoint}
						onOpenFileDetails={handleOpenFileDetails}
						ondeleteImage={handleDeleteImage}
						onUpdateImage={handleUpdateImage}
					/>
				{/await}
			{/if}
		</div>
	</div>

	<Slot name="media_gallery" inline />

	{#if showBatchProcessor && assetStats.selected > 0}
		{#await import('./batch-processor.svelte') then mod}
			<mod.default
				selectedIds={selectedFiles}
				imageIds={selectedImageIds}
				onClose={() => (showBatchProcessor = false)}
			/>
		{/await}
	{/if}

	{#if showFocalModal && focalFile}
		{#await import('./focal-quick-modal.svelte') then mod}
			<mod.default
				media={focalFile}
				bind:show={showFocalModal}
				onClose={() => (focalFile = null)}
				onSave={handleFocalSave}
			/>
		{/await}
	{/if}

	{#if isMediaDragActive}
		{#await import('./media-drag-preview.svelte') then mod}
			<mod.default />
		{/await}
	{/if}

	{#if showAdvancedSearch}
		<Portal>
			<div
				class="fixed inset-0 z-100 bg-surface-900/50 backdrop-blur-sm transition-all"
				aria-hidden="true"
			></div>
			<div class="fixed inset-0 z-101 flex items-center justify-center p-4">
				{#await import('./advanced-search-modal.svelte') then mod}
					<mod.default
						{files}
						initialJsonPath={jsonPathFilter}
						initialFilters={appliedFilters}
						onSearch={(criteria, path) => {
							// Only the page-scoped criteria stay client-side; the adapter filters
							// are already on their way into the URL below.
							searchCriteria = clientSideCriteria(criteria);
							jsonPathFilter = path;
							showAdvancedSearch = false;
							void applyAdvancedSearch(criteria, path);
						}}
						onClose={() => {
							showAdvancedSearch = false;
						}}
					/>
				{/await}
			</div>
		</Portal>
	{/if}
</AdminPageShell>
