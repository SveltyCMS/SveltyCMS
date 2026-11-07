<!--
@file src/routes/(app)/mediagallery/media-grid.svelte
@component
**Grid view component for the media gallery**

### Features:
- Keyboard navigation (Enter/Space to select)
- Multi-select integration
- High-contrast focus states
- Drag media (or multi-selection) onto sidebar virtual folders
- Rendition fallback (thumbnail → sm → md → lg → original) with a visible "File missing" state
- Large folders: row windowing with spacers plus `content-visibility` on tiles
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import {
		button_edit,
		builder_tag_input_label,
		mediagallery_copy_url,
		mediagallery_copy_url_aria,
		mediagallery_copy_url_failed,
		mediagallery_copy_url_missing,
		mediagallery_copy_url_success,
		mediagallery_drag_to_folder,
		mediagallery_drop_files,
		mediagallery_filter_media_aria,
		mediagallery_focal_title,
		mediagallery_loading_more,
		mediagallery_media_grid_aria,
		mediagallery_name,
		mediagallery_no_media,
		mediagallery_original,
		mediagallery_picker_empty_filtered,
		mediagallery_picker_reset_filters,
		mediagallery_preview_drag_aria,
		mediagallery_resized_variants,
		mediagallery_size,
		mediagallery_Pixel,
		mediagallery_upload_first
	} from '@src/paraglide/messages';
	import Checkbox from '@components/ui/checkbox.svelte';
	import Tooltip from '@components/ui/tooltip.svelte';
	import MediaGridActionTooltip from './media-grid-action-tooltip.svelte';
	import MediaTableRowMenu from './media-table-row-menu.svelte';
	import {
		type MediaBase,
		type MediaImage,
		type StoredMediaBase,
		type Thumbnail,
		type ThumbnailSet,
		normalizeProcessingStatus
	} from '@utils/media/media-models';
	import { mediaDisplayUrl, mediaPreviewCandidates } from '@utils/media/media-utils';
	import { adminFade, motionDuration } from '@utils/admin-transitions';
	import {
		MEDIA_DRAG_CONTAINER,
		resolveMediaDragIds,
		suppressNativeDragGhost
	} from '@utils/media/media-dnd';
	import { liftAndCarry } from '@utils/media/media-lift-drag';
	import { formatBytes } from '@utils/file';
	import { logger } from '@utils/logger';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { dndState } from '@thisux/sveltednd';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import Badge from '@components/ui/badge.svelte';
	import { computeGridWindow, countGridColumns, shouldVirtualize } from './grid-window';

	interface Props {
		filteredFiles?: (MediaBase | MediaImage)[];
		gridSize?: 'tiny' | 'small' | 'medium' | 'large';
		isSelectionMode?: boolean;
		selectedFiles: SvelteSet<string>;
		publishedMediaIds?: SvelteSet<string>;
		/** The folder holds server pages the client has not fetched yet. */
		serverHasMore?: boolean;
		/** A server page request is in flight (parent-owned). */
		isLoadingMore?: boolean;
		/** The parent is replacing the result set (debounced search); keep tiles painted. */
		isRefreshing?: boolean;
		/** Asks the parent for the next server page. */
		onLoadMore?: () => void;
		ondeleteImage?: (file: MediaBase | MediaImage) => void;
		onEditImage?: (file: MediaImage) => void;
		/** Opens the quick focal-point modal (images only). */
		onSetFocalPoint?: (file: MediaImage) => void;
		onUpdateImage?: (file: MediaImage) => void;
		onOpenFileDetails?: (file: MediaBase | MediaImage) => void;
		/** True when a search/filter is narrowing the folder — drives the filtered-empty state. */
		hasActiveFilters?: boolean;
		onClearFilters?: () => void;
		onCreateFolder?: () => void;
	}

	let {
		filteredFiles = $bindable([]),
		gridSize = 'medium',
		isSelectionMode = false,
		selectedFiles = $bindable(),
		publishedMediaIds = $bindable(new SvelteSet<string>()),
		serverHasMore = false,
		isLoadingMore = false,
		isRefreshing = false,
		onLoadMore = () => {},
		ondeleteImage = () => {},
		onEditImage = () => {},
		onSetFocalPoint = () => {},
		onUpdateImage = () => {},
		onOpenFileDetails = () => {},
		hasActiveFilters = false,
		onClearFilters = () => {},
		onCreateFolder = undefined
	}: Props = $props();

	const minColWidthCss = $derived(
		gridSize === 'tiny'
			? 'clamp(88px, 22vw, 120px)'
			: gridSize === 'small'
				? 'clamp(120px, 38vw, 180px)'
				: gridSize === 'medium'
					? 'clamp(140px, 28vw, 240px)'
					: 'clamp(180px, 22vw, 300px)'
	);

	let showTagModal = $state(false);
	let taggingFile = $state<MediaImage | null>(null);
	let fileUploadInput = $state<HTMLInputElement>();
	/** Per-tile `<img>` attempt index, keyed by file + rendition ladder. */
	const previewAttempts = new SvelteMap<string, number>();
	/** Tiles whose entire preview ladder failed — icon fallback + "File missing" badge. */
	const missingImages = new SvelteSet<string>();
	let touchActiveId = $state<string | null>(null);
	/** Shift-click range anchor (grid order of the last selected tile). */
	let lastSelectedId = $state<string | null>(null);
	/** File drag from the OS is hovering the grid — shows the drop overlay. */
	let osDragOver = $state(false);
	let osDragDepth = 0;

	const BATCH_SIZE = 60;
	/**
	 * Above this many loaded rows the grid stops mounting every tile: only the
	 * rows around the scroll position stay in the DOM and spacers stand in for
	 * the rest. Small folders keep the progressive batch reveal — it is cheaper
	 * than measuring layout and behaves exactly as it did before.
	 */
	const VIRTUALIZE_THRESHOLD = 500;
	const OVERSCAN_ROWS = 3;
	/** Used until the first layout pass reports real tile geometry. */
	const FALLBACK_ROW_HEIGHT = 220;
	const FALLBACK_VIEWPORT_HEIGHT = 800;

	let visibleCount = $state(BATCH_SIZE);
	/**
	 * Bumped whenever a new result head resets the batch. The sentinel observer
	 * reads it so a reset re-creates the observer: IntersectionObserver only
	 * reports threshold changes, and a sentinel that never left the scroll root
	 * would otherwise stay silent after the reset.
	 */
	let revealEpoch = $state(0);
	/** Cooldown for the scroll fallback so one gesture cannot queue several pages. */
	let lastLoadMoreAt = 0;
	let scrollRoot = $state<HTMLElement>();
	let sentinel = $state<HTMLElement>();
	let lastHeadKey = '';
	let lastTotal = 0;

	interface GridGeometry {
		columns: number;
		rowHeight: number;
		rowGap: number;
	}

	let geometry = $state<GridGeometry>({
		columns: 1,
		rowHeight: FALLBACK_ROW_HEIGHT,
		rowGap: 12
	});
	let viewport = $state({ scrollTop: 0, height: FALLBACK_VIEWPORT_HEIGHT });
	let scrollFrame = 0;

	const virtualized = $derived(shouldVirtualize(filteredFiles.length, VIRTUALIZE_THRESHOLD));
	const gridWindow = $derived(
		computeGridWindow({
			totalItems: filteredFiles.length,
			columns: geometry.columns,
			rowHeight: geometry.rowHeight,
			rowGap: geometry.rowGap,
			scrollTop: viewport.scrollTop,
			viewportHeight: viewport.height,
			overscanRows: OVERSCAN_ROWS
		})
	);
	const visibleFiles = $derived(
		virtualized
			? filteredFiles.slice(gridWindow.startIndex, gridWindow.endIndex)
			: filteredFiles.slice(0, visibleCount)
	);
	const hasMore = $derived(!virtualized && visibleCount < filteredFiles.length);
	const topSpacerHeight = $derived(virtualized ? gridWindow.topSpacerHeight : 0);
	const bottomSpacerHeight = $derived(virtualized ? gridWindow.bottomSpacerHeight : 0);
	const previewSize = $derived(
		gridSize === 'large' ? 'md' : gridSize === 'medium' ? 'sm' : 'thumbnail'
	);

	/**
	 * Read the resolved grid geometry: columns from the used track list (the
	 * `auto-fill` template resolves to explicit tracks), row height from the first
	 * mounted tile. Tiles are uniform — square preview plus a fixed badge row.
	 */
	function measureGrid() {
		const root = scrollRoot;
		if (!root) return;

		const style = getComputedStyle(root);
		const rowGap = Number.parseFloat(style.rowGap) || 0;
		const columnGap = Number.parseFloat(style.columnGap) || 0;
		const rect = root
			.querySelector<HTMLElement>('[data-testid="media-item"]')
			?.getBoundingClientRect();

		let columns = countGridColumns(style.gridTemplateColumns);
		if (columns === 0 && rect && rect.width > 0 && root.clientWidth > 0) {
			columns = Math.max(1, Math.round((root.clientWidth + columnGap) / (rect.width + columnGap)));
		}
		columns = Math.max(1, columns || geometry.columns);
		const rowHeight = rect && rect.height > 0 ? rect.height : geometry.rowHeight;

		if (
			columns !== geometry.columns ||
			Math.abs(rowHeight - geometry.rowHeight) > 0.5 ||
			Math.abs(rowGap - geometry.rowGap) > 0.5
		) {
			geometry = { columns, rowHeight, rowGap };
		}

		const height = root.clientHeight > 0 ? root.clientHeight : viewport.height;
		if (height !== viewport.height) viewport = { ...viewport, height };
	}

	$effect(() => {
		const root = scrollRoot;
		// Reading the layout-affecting inputs re-measures on a density change or a
		// newly appended server page (a new first row).
		const layoutKey = `${gridSize}:${filteredFiles.length}`;
		if (!root) return;
		const frame = requestAnimationFrame(() => {
			if (layoutKey) measureGrid();
		});
		return () => cancelAnimationFrame(frame);
	});

	$effect(() => {
		const root = scrollRoot;
		if (!root || typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(() => measureGrid());
		observer.observe(root);
		return () => observer.disconnect();
	});

	/** Only re-window when the first visible row changes; overscan covers sub-row gaps. */
	function commitViewport(scrollTop: number) {
		const stride = geometry.rowHeight + geometry.rowGap;
		const currentRow = stride > 0 ? Math.floor(viewport.scrollTop / stride) : 0;
		const nextRow = stride > 0 ? Math.floor(scrollTop / stride) : 0;
		if (nextRow === currentRow && scrollTop !== 0) return;
		viewport = { ...viewport, scrollTop };
	}

	function handleGridScroll() {
		const root = scrollRoot;
		if (!root || scrollFrame) return;
		scrollFrame = requestAnimationFrame(() => {
			scrollFrame = 0;
			const element = scrollRoot;
			if (!element) return;
			commitViewport(element.scrollTop);
			if (element.clientHeight > 0 && element.clientHeight !== viewport.height) {
				viewport = { ...viewport, height: element.clientHeight };
			}
			// Belt-and-braces for the sentinel: IntersectionObserver only reports
			// threshold changes, so a list reset can leave it silent. Proximity to the
			// bottom is the same signal and always fires while scrolling.
			if (
				element.clientHeight > 0 &&
				element.scrollTop + element.clientHeight >= element.scrollHeight - 600
			) {
				if (!virtualized && visibleCount < filteredFiles.length) {
					visibleCount = Math.min(visibleCount + BATCH_SIZE, filteredFiles.length);
				} else if (serverHasMore && !isLoadingMore && Date.now() - lastLoadMoreAt > 500) {
					lastLoadMoreAt = Date.now();
					onLoadMore();
				}
			}
		});
	}

	$effect(() => () => {
		if (scrollFrame) cancelAnimationFrame(scrollFrame);
	});

	$effect(() => {
		// Reset batching only when the head of the visible set changes or the list
		// shrinks. Appending a server page keeps the head, and resetting on every
		// list change made the grid snap back to the first batch while scrolling.
		const head = filteredFiles[0]?._id ?? filteredFiles[0]?.filename ?? '';
		const total = filteredFiles.length;
		const shouldReset = head !== lastHeadKey || total < lastTotal;
		lastHeadKey = String(head);
		lastTotal = total;
		if (!shouldReset) return;
		visibleCount = BATCH_SIZE;
		revealEpoch += 1;
		viewport = { ...viewport, scrollTop: 0 };
		if (scrollRoot) scrollRoot.scrollTop = 0;
	});

	$effect(() => {
		if (!sentinel) return;
		// Reading the paging state re-arms the observer when a server page lands: a
		// fresh observer emits an initial entry, which is what continues the chain
		// while the sentinel never left the viewport (IntersectionObserver only
		// reports threshold *changes*). `revealEpoch` does the same for a list
		// reset after a search.
		const epoch = revealEpoch;
		const hasServerMore = serverHasMore;
		const loading = isLoadingMore;
		const windowed = virtualized;
		const observer = new IntersectionObserver(
			(entries) => {
				void epoch;
				if (!entries[0]?.isIntersecting) return;
				// A virtualised list already exposes every loaded row through scrolling;
				// the sentinel only fetches the next server page.
				if (!windowed && visibleCount < filteredFiles.length) {
					visibleCount = Math.min(visibleCount + BATCH_SIZE, filteredFiles.length);
					return;
				}
				if (hasServerMore && !loading) onLoadMore();
			},
			{ root: scrollRoot ?? null, rootMargin: '600px 0px' }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});

	function formatMimeType(mime: string | undefined = undefined): string {
		if (!mime) return 'Unknown';
		const parts = mime.split('/');
		return parts[1] ? parts[1].toUpperCase() : parts[0].toUpperCase();
	}

	function getFileIcon(file: MediaBase): string {
		const fileName = file.filename || '';
		const fileExt = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
		switch (true) {
			case file.type === 'image':
				return 'fa-solid:image';
			case file.type === 'video':
				return 'fa-solid:video';
			case file.type === 'audio':
				return 'fa-solid:play-circle';
			case fileExt === '.pdf':
				return 'vscode-icons:file-type-pdf2';
			default:
				return 'vscode-icons:file';
		}
	}

	function toggleSelection(file: MediaBase | MediaImage) {
		const fileId = file._id?.toString() || file.filename;
		if (selectedFiles.has(fileId)) {
			selectedFiles.delete(fileId);
		} else {
			selectedFiles.add(fileId);
		}
	}

	function fileIdOf(file: MediaBase | MediaImage): string {
		return file._id?.toString() || file.filename;
	}

	/**
	 * Per-tile preview state key. The candidate ladder is part of the key so a
	 * grid-size change (different preferred rendition) or freshly generated
	 * thumbnails restart the ladder instead of inheriting a stale failure.
	 */
	function previewKeyOf(fileId: string, candidates: string[]): string {
		return `${fileId}\u0000${candidates.join('\u0001')}`;
	}

	/** Walk the rendition ladder on `<img>` errors; mark the tile missing when it is exhausted. */
	function handlePreviewError(candidates: string[], previewKey: string, attemptedIndex: number) {
		const index = previewAttempts.get(previewKey) ?? 0;
		// A stale error from a previous `src` must not advance the ladder twice.
		if (attemptedIndex !== index) return;
		if (index < candidates.length - 1) {
			previewAttempts.set(previewKey, index + 1);
			return;
		}
		missingImages.add(previewKey);
	}

	/**
	 * Shift-click selects the whole range from the previous anchor. The range runs
	 * over the complete result list, not the mounted window — the anchor can sit
	 * outside the virtualised window after scrolling.
	 */
	function selectWithRange(file: MediaBase | MediaImage, shiftKey: boolean) {
		const fileId = fileIdOf(file);
		if (shiftKey && lastSelectedId) {
			const ids = filteredFiles.map(fileIdOf);
			const from = ids.indexOf(lastSelectedId);
			const to = ids.indexOf(fileId);
			if (from !== -1 && to !== -1) {
				const [start, end] = from < to ? [from, to] : [to, from];
				for (let i = start; i <= end; i++) selectedFiles.add(ids[i]);
				return;
			}
		}
		toggleSelection(file);
		lastSelectedId = fileId;
	}

	function processingStatusOf(file: MediaBase | MediaImage): 'processing' | 'ready' | 'failed' {
		return (
			normalizeProcessingStatus(
				(file.metadata as Record<string, unknown> | undefined)?.processingStatus
			) ?? 'ready'
		);
	}

	/**
	 * The props accept the display union, but gallery rows are always stored media.
	 * Narrowing here keeps the template free of type assertions (the compiler that
	 * mounts this component in DOM tests does not parse TS inside markup).
	 */
	function imageOf(file: MediaBase | MediaImage): MediaImage {
		return file as MediaImage;
	}

	function storedSize(file: MediaBase | MediaImage): number {
		return (file as StoredMediaBase).size ?? 0;
	}

	function storedMime(file: MediaBase | MediaImage): string {
		return (file as StoredMediaBase).mimeType ?? '';
	}

	/** Metadata values are unknown at the type level; only text is renderable. */
	function metadataText(file: MediaBase | MediaImage, key: string): string | undefined {
		const value = (file.metadata as Record<string, unknown> | undefined)?.[key];
		return typeof value === 'string' && value ? value : undefined;
	}

	function thumbnailSize(thumbnail: unknown): number | undefined {
		if (!thumbnail || typeof thumbnail !== 'object') return undefined;
		const size = (thumbnail as { size?: unknown }).size;
		return typeof size === 'number' ? size : undefined;
	}

	function thumbnailOf(thumbnails: ThumbnailSet | undefined, key: string): Thumbnail {
		return thumbnails?.[key] as Thumbnail;
	}

	function isFileDrag(event: DragEvent): boolean {
		return Array.from(event.dataTransfer?.types ?? []).includes('Files');
	}

	function handleOsDragEnter(event: DragEvent) {
		if (dndState.isDragging || !isFileDrag(event)) return;
		event.preventDefault();
		osDragDepth++;
		osDragOver = true;
	}

	function handleOsDragOver(event: DragEvent) {
		if (dndState.isDragging || !isFileDrag(event)) return;
		event.preventDefault();
	}

	function handleOsDragLeave() {
		osDragDepth = Math.max(0, osDragDepth - 1);
		if (osDragDepth === 0) osDragOver = false;
	}

	function handleOsDrop(event: DragEvent) {
		if (dndState.isDragging) return;
		event.preventDefault();
		osDragDepth = 0;
		osDragOver = false;
		const files = event.dataTransfer?.files;
		if (!files?.length) return;
		document.dispatchEvent(new CustomEvent('externalUpload', { detail: { files } }));
	}

	function handleItemClick(file: MediaBase | MediaImage, event?: MouseEvent) {
		if (!isSelectionMode) {
			onOpenFileDetails(file);
			return;
		}
		selectWithRange(file, event?.shiftKey ?? false);
	}

	function handleKeyDown(e: KeyboardEvent, file: MediaBase | MediaImage) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			if (!isSelectionMode) {
				onOpenFileDetails(file);
			} else {
				toggleSelection(file);
				lastSelectedId = fileIdOf(file);
			}
		}
	}

	function openTagEditor(file: MediaImage) {
		taggingFile = file;
		showTagModal = true;
	}

	function getDimensionsLabel(file: MediaBase | MediaImage): string {
		const img = file as MediaImage;
		if (img.width && img.height) return `${img.width}x${img.height}`;
		return 'N/A';
	}

	/** Return thumbnail size keys excluding _webp variants (grouped into the same row). */
	function deriveSizeKeys(thumbnails: Record<string, any>): string[] {
		return Object.keys(thumbnails).filter((k) => !k.endsWith('_webp') && thumbnails[k]);
	}

	/** Get the webp variant key for a given thumbnail size, if it exists. */
	function getWebpKey(thumbnails: Record<string, any>, sizeKey: string): string | null {
		const webp = `${sizeKey}_webp`;
		return thumbnails[webp]?.size ? webp : null;
	}

	/**
	 * Detect if the thumbnails record has _webp variant entries.
	 * Only `MEDIA_OUTPUT_FORMAT_QUALITY.format: "original"` pairs each step with a
	 * WebP sidecar; an explicit jpeg/webp/avif writes one file per step.
	 */
	function hasWebpVariants(thumbnails: Record<string, any>): boolean {
		return Object.keys(thumbnails).some((k) => k.endsWith('_webp'));
	}

	/**
	 * Derive the primary thumbnail format label from the first thumbnail's mimeType.
	 * Handles: webp, avif, jpeg, png, gif, etc.
	 */
	function primaryFormatLabel(thumbnails: Record<string, any>, fallbackMimeType = ''): string {
		const keys = deriveSizeKeys(thumbnails);
		const mime =
			(keys.length ? ((thumbnails[keys[0]] as any)?.mimeType as string | undefined) : undefined) ||
			fallbackMimeType;
		if (!mime) return '';
		if (mime === 'image/webp') return 'WebP';
		if (mime === 'image/avif') return 'AVIF';
		if (mime === 'image/jpeg') return 'JPEG';
		if (mime === 'image/png') return 'PNG';
		if (mime === 'image/gif') return 'GIF';
		// Extract clean label from mime
		const fmt = mime.split('/').pop();
		return fmt ? fmt.toUpperCase() : '';
	}

	const actionBtnClass =
		'group/action flex h-8 w-8 min-w-0 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/55 p-0! text-white/80 shadow-sm backdrop-blur-sm transition-colors hover:bg-black/75 hover:text-white';
</script>

<div
	bind:this={scrollRoot}
	class="media-grid-scroll grid min-h-0 flex-1 content-start items-stretch gap-x-2 gap-y-3 overflow-y-auto overflow-x-hidden p-2 sm:gap-x-3 sm:gap-y-4 sm:px-3 sm:pt-2 sm:pb-3"
	style:grid-template-columns="repeat(auto-fill, minmax({minColWidthCss}, 1fr))"
	style:--media-tile-estimate="calc({minColWidthCss} + 2.25rem)"
	role="grid"
	tabindex="-1"
	aria-label={mediagallery_media_grid_aria()}
	aria-busy={isRefreshing}
	data-testid="media-grid"
	onscroll={handleGridScroll}
	ondragenter={handleOsDragEnter}
	ondragover={handleOsDragOver}
	ondragleave={handleOsDragLeave}
	ondrop={handleOsDrop}
	ontouchstart={() => {
		touchActiveId = null;
	}}
>
	<!--
		Intro-only fade: the empty state is a full-width grid row (`col-span-full`).
		With a two-way `transition:`, the outgoing row would stay in the grid's flow
		for the fade duration while the tiles are already rendered, then collapse and
		shift every tile up by its height. Intro-only keeps the grid rows stable.
	-->
	{#if filteredFiles.length === 0}
		<!-- The grid requires row children (axe `aria-required-children`); the row is
		     `display: contents` so the gridcell still owns the full-width grid area. -->
		<div role="row" class="contents">
			<div
				role="gridcell"
				class="col-span-full flex min-h-full flex-col items-center justify-center gap-3 py-16 text-center"
				in:adminFade={{ duration: 200 }}
				data-testid="media-grid-empty"
			>
				{#if hasActiveFilters}
					<iconify-icon icon="mdi:filter-off-outline" width="48" class="text-(--admin-text-muted)"
					></iconify-icon>
					<div class="space-y-1">
						<h3 class="text-base font-semibold">{mediagallery_picker_empty_filtered()}</h3>
						<p class="max-w-xs text-sm text-(--admin-text-muted)">
							Try a different search or filter.
						</p>
					</div>
					<Button variant="primary" onclick={onClearFilters}>
						<iconify-icon icon="mdi:filter-remove-outline" width="18"></iconify-icon>
						<span>{mediagallery_picker_reset_filters()}</span>
					</Button>
				{:else}
					<iconify-icon icon="mdi:cloud-upload-outline" width="48" class="text-(--admin-text-muted)"
					></iconify-icon>
					<div class="space-y-1">
						<h3 class="text-base font-semibold">{mediagallery_no_media()}</h3>
						<p class="max-w-xs text-sm text-(--admin-text-muted)">
							{mediagallery_drop_files()}
						</p>
					</div>

					<div class="flex flex-wrap items-center justify-center gap-2">
						<Button variant="primary" onclick={() => fileUploadInput?.click()}>
							<iconify-icon icon="mdi:plus" width="18"></iconify-icon>
							<span>{mediagallery_upload_first()}</span>
						</Button>
						{#if onCreateFolder}
							<Button variant="secondary" onclick={onCreateFolder}>
								<iconify-icon icon="mdi:folder-plus" width="18"></iconify-icon>
								<span>Create folder</span>
							</Button>
						{/if}
					</div>
					<input
						aria-label={mediagallery_filter_media_aria()}
						type="file"
						multiple
						class="hidden"
						bind:this={fileUploadInput}
						onchange={(e) => {
							const input = e.currentTarget;
							if (input.files?.length) {
								const event = new CustomEvent('externalUpload', {
									detail: { files: input.files }
								});
								document.dispatchEvent(event);
							}
						}}
						accept="image/*,video/*,audio/*,application/pdf"
					/>
				{/if}
			</div>
		</div>
	{:else}
		<!--
			Rows above the window are stood in for by a spacer. `content-visibility`
			on the tiles lets the browser skip layout/paint for the offscreen members
			of the mounted window as well.
		-->
		{#if virtualized && topSpacerHeight > 0}
			<div
				class="col-span-full"
				style:height={`${topSpacerHeight}px`}
				aria-hidden="true"
				data-testid="media-grid-top-spacer"
			></div>
		{/if}
		{#each visibleFiles as file (file._id || file.filename)}
			{@const fileId = file._id?.toString() || file.filename}
			{@const processing = processingStatusOf(file)}
			{@const inUse = publishedMediaIds.has(fileId)}
			{@const isImage = file.type === 'image'}
			{@const candidateUrls = mediaPreviewCandidates(file, previewSize, {
				includeOriginal: isImage
			})}
			{@const previewKey = previewKeyOf(fileId, candidateUrls)}
			{@const previewIndex = previewAttempts.get(previewKey) ?? 0}
			{@const previewSrc = candidateUrls[previewIndex] ?? ''}
			{@const previewFailed =
				missingImages.has(previewKey) || (isImage && candidateUrls.length === 0)}

			<!-- Row wrapper (display: contents) keeps the gridcell as the grid item while
			     satisfying the grid's required row → gridcell ownership. -->
			<div role="row" class="contents">
				<div
					class="media-grid-tile rounded border border-surface-500 group relative flex h-full min-w-0 flex-col focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-(--admin-focus-ring) cursor-grab active:cursor-grabbing
          {selectedFiles.has(fileId) ? 'ring-1 ring-inset ring-primary-500/50' : ''}"
					role="gridcell"
					tabindex="-1"
					aria-selected={selectedFiles.has(fileId)}
					use:liftAndCarry={{
						container: MEDIA_DRAG_CONTAINER,
						dragData: {
							ids: resolveMediaDragIds(fileId, selectedFiles),
							preview: {
								filename: file.filename,
								url: file.type === 'image' ? mediaDisplayUrl(file, previewSize) : undefined,
								type: file.type
							}
						},
						interactive: ['[data-no-drag]'],
						attributes: { draggingClass: 'opacity-50' }
					}}
					ondragstart={suppressNativeDragGhost}
					data-testid="media-item"
					data-media-id={fileId}
					in:adminFade={{ duration: virtualized ? 0 : motionDuration(120) }}
					ontouchstart={(e) => {
						e.stopPropagation();
						touchActiveId = fileId;
					}}
				>
					{#if selectedFiles.has(fileId)}
						<div
							class="absolute inset-y-0 inset-s-0 z-10 w-0.5 bg-primary-500"
							aria-hidden="true"
						></div>
					{/if}

					{#if isSelectionMode || selectedFiles.has(fileId)}
						<div
							class="absolute inset-s-1.5 top-1.5 z-20 sm:inset-s-2 sm:top-2"
							data-no-drag
							in:adminFade={{ duration: motionDuration(120) }}
							role="presentation"
							onclick={(e) => e.stopPropagation()}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
							}}
						>
							<Checkbox
								checked={selectedFiles.has(fileId)}
								onchange={() => {
									lastSelectedId = fileId;
									toggleSelection(file);
								}}
								label="Select {file.filename}"
								hideLabel
								size="sm"
							/>
						</div>
					{/if}

					<div
						class="media-checkerboard relative aspect-square w-full overflow-hidden rounded-t-lg border border-surface-500/30 dark:border-surface-500/40"
					>
						<!--
            Use a div (not <button>) so HTML5 drag can start from the thumbnail.
            Native buttons cancel dragstart in Chromium when nested under a draggable parent.
          -->
						<Tooltip
							title={mediagallery_drag_to_folder()}
							positioning={{ placement: 'top' }}
							triggerClass="h-full w-full"
							disabled={gridSize === 'tiny'}
						>
							<div
								role="button"
								tabindex="0"
								class="relative h-full w-full cursor-grab text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 active:cursor-grabbing"
								onclick={(e) => handleItemClick(file, e)}
								onkeydown={(e) => handleKeyDown(e, file)}
								aria-label={mediagallery_preview_drag_aria({ name: file.filename })}
							>
								{#if candidateUrls.length > 0 && !previewFailed}
									<div
										class="h-full w-full transition-colors duration-500 {isImage ? '' : 'bg-white'}"
										style:background-color={isImage
											? metadataText(file, 'dominantColor') || 'transparent'
											: undefined}
									>
										{#if isImage && file.metadata?.placeholder}
											<img
												src={metadataText(file, 'placeholder')}
												alt=""
												class="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-xl"
												aria-hidden="true"
												draggable="false"
												crossorigin="anonymous"
											/>
										{/if}

										<img
											src={previewSrc}
											alt=""
											class="relative h-full w-full pointer-events-none {isImage
												? 'object-cover'
												: 'object-contain'}"
											style:object-position={file.metadata?.focalPoint
												? `${file.metadata.focalPoint.x}% ${file.metadata.focalPoint.y}%`
												: 'center'}
											loading="lazy"
											decoding="async"
											draggable="false"
											crossorigin="anonymous"
											onerror={() => handlePreviewError(candidateUrls, previewKey, previewIndex)}
											onload={(e) => e.currentTarget.classList.add('opacity-100')}
										/>
									</div>
								{:else}
									<div
										class="flex h-full w-full flex-col items-center justify-center gap-2 bg-(--admin-bg-card)/80"
									>
										<iconify-icon
											icon={isImage ? 'mdi:image-off-outline' : getFileIcon(file)}
											width={36}
											class="text-(--admin-text-muted)"
										></iconify-icon>
										{#if previewFailed}
											<span
												class="relative z-20 inline-flex items-center gap-1 rounded-full border border-error-500/30 bg-error-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-error-500 dark:border-error-500/40 dark:bg-error-900/20 dark:text-error-400"
												title="File missing — open the file details to replace it"
											>
												<iconify-icon icon="mdi:file-alert-outline" width="11" aria-hidden="true"
												></iconify-icon>
												File missing
											</span>
										{/if}
									</div>
								{/if}

								<div
									class="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-linear-to-t from-black/75 via-black/30 to-transparent px-2 pb-1.5 pt-8 text-center"
								>
									<p dir="auto" class="truncate text-[11px] font-medium leading-tight text-white">
										{file.filename}
									</p>
								</div>

								{#if processing !== 'ready' || inUse}
									<div
										class="pointer-events-none absolute inset-x-0 bottom-8 z-10 flex flex-wrap justify-center gap-1 px-1.5"
									>
										{#if processing === 'processing'}
											<span
												class="inline-flex items-center gap-1 rounded-full bg-warning-500 px-1.5 py-0.5 text-[10px] font-semibold text-surface-950 shadow-sm"
											>
												<iconify-icon icon="mdi:progress-clock" width="11" aria-hidden="true"
												></iconify-icon>
												Processing
											</span>
										{:else if processing === 'failed'}
											<span
												class="inline-flex items-center gap-1 rounded-full bg-error-500 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm"
											>
												<iconify-icon icon="mdi:alert-circle-outline" width="11" aria-hidden="true"
												></iconify-icon>
												Failed
											</span>
										{/if}
										{#if inUse}
											<span
												class="inline-flex items-center gap-1 rounded-full bg-tertiary-500 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm dark:bg-primary-500"
											>
												<iconify-icon icon="mdi:link-variant" width="11" aria-hidden="true"
												></iconify-icon>
												In use
											</span>
										{/if}
									</div>
								{/if}
							</div>
						</Tooltip>

						<div
							class="absolute inset-e-1 top-1 z-20 flex flex-col gap-1 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 {touchActiveId ===
							fileId
								? 'opacity-100'
								: 'opacity-0'}"
							data-no-drag
							data-testid="media-grid-actions"
						>
							{#if gridSize === 'tiny'}
								<!-- A 6-button rail cannot fit an 88–120 px tile; one portalled
								     menu keeps every action reachable without clipping. -->
								<MediaTableRowMenu
									{file}
									onDetails={() => onOpenFileDetails(file)}
									onEdit={() => onEditImage(imageOf(file))}
									onFocal={() => onSetFocalPoint(imageOf(file))}
									onTags={() => openTagEditor(imageOf(file))}
									onDelete={() => ondeleteImage(file)}
								/>
							{:else}
								<MediaGridActionTooltip
									theme="light"
									ariaLabel="Details for {file.filename}"
									class="{actionBtnClass} hidden sm:flex"
									onclick={(e) => {
										e.stopPropagation();
										onOpenFileDetails(file);
									}}
								>
									{#snippet children()}
										<span
											class="font-serif text-sm font-semibold italic leading-none text-primary-500 transition-colors group-hover/action:text-white"
											>i</span
										>
									{/snippet}
									{#snippet content()}
										<div class="flex flex-col text-[11px] text-(--admin-text-muted) min-w-60">
											<div
												class="mb-0 border-b border-(--admin-border-default) pb-2 text-center text-tertiary-500 dark:text-primary-500 text-[13px] font-semibold wrap-break-word"
												dir="auto"
											>
												{file.filename}
											</div>
											<table class="w-full text-start border-collapse mt-2">
												<thead>
													<tr
														class="border-b border-(--admin-border-default) text-tertiary-500 dark:text-primary-500"
													>
														<th
															class="font-bold py-1 px-2 border-e border-(--admin-border-default) text-start"
															>{mediagallery_name()}</th
														>
														<th
															class="font-bold py-1 px-2 border-e border-(--admin-border-default) text-center"
															>{mediagallery_Pixel()}</th
														>
														<th class="font-bold py-1 px-2 text-end" colspan="2"
															>{mediagallery_size()}</th
														>
													</tr>
												</thead>
												<tbody class="text-(--admin-text-muted)">
													<tr class="border-b border-(--admin-border-default)">
														<td
															class="py-1 px-2 font-bold text-tertiary-500 dark:text-primary-500 border-e border-(--admin-border-default) text-start"
															>{mediagallery_original()}</td
														>
														<td
															class="py-1 px-2 text-center border-e border-(--admin-border-default)"
															>{getDimensionsLabel(file) || '-'}</td
														>
														<td class="py-1 px-2 text-end tabular-nums" colspan="2"
															>{formatBytes(storedSize(file))}</td
														>
													</tr>
													{#if file.thumbnails}
														{@const hasWebp = hasWebpVariants(file.thumbnails)}
														{@const primaryLabel = primaryFormatLabel(
															file.thumbnails,
															storedMime(file)
														)}
														<tr class="border-b border-(--admin-border-default)">
															<td
																class="py-1 px-2 text-center font-bold text-tertiary-500 dark:text-primary-500"
																colspan="4"
															>
																{mediagallery_resized_variants()}{#if primaryLabel}{primaryLabel}{#if hasWebp}
																		+ WebP{/if}{/if}
															</td>
														</tr>
														{#each deriveSizeKeys(file.thumbnails) as sizeKey (sizeKey)}
															{@const webpKey = getWebpKey(file.thumbnails, sizeKey)}
															{@const thumb = thumbnailOf(file.thumbnails, sizeKey)}
															{@const thumbSize = thumbnailSize(thumb)}
															<tr class="border-b border-(--admin-border-default) last:border-0">
																<td
																	class="py-1 px-2 font-bold text-tertiary-500 dark:text-primary-500 border-e border-(--admin-border-default) text-start"
																	>{sizeKey}</td
																>
																<td
																	class="py-1 px-2 text-center border-e border-(--admin-border-default)"
																>
																	{thumb.width}x{thumb.height}
																</td>
																{#if hasWebp}
																	<td
																		class="py-1 px-2 text-end tabular-nums border-e border-(--admin-border-default)"
																	>
																		{thumbSize ? formatBytes(thumbSize) : '-'}
																	</td>
																	<td class="py-1 px-2 text-end tabular-nums">
																		{#if webpKey}
																			{formatBytes(thumbnailSize(file.thumbnails[webpKey]) ?? 0)}
																		{:else}
																			<span
																				class="text-(--admin-text-muted) dark:text-(--admin-text-muted)"
																				>—</span
																			>
																		{/if}
																	</td>
																{:else}
																	<td class="py-1 px-2 text-end tabular-nums">
																		{thumbSize ? formatBytes(thumbSize) : '-'}
																	</td>
																{/if}
															</tr>
														{/each}
													{/if}
												</tbody>
											</table>
										</div>
									{/snippet}
								</MediaGridActionTooltip>

								<MediaGridActionTooltip
									title={button_edit()}
									ariaLabel="Edit {file.filename}"
									class={actionBtnClass}
									data-testid="media-edit-button"
									onclick={(e) => {
										e.stopPropagation();
										onEditImage(imageOf(file));
									}}
								>
									{#snippet children()}
										<iconify-icon icon="mdi:pencil" width={15}></iconify-icon>
									{/snippet}
								</MediaGridActionTooltip>

								{#if file.type === 'image'}
									<MediaGridActionTooltip
										title={mediagallery_focal_title()}
										ariaLabel={mediagallery_focal_title()}
										class={actionBtnClass}
										data-testid="media-focal-button"
										onclick={(e) => {
											e.stopPropagation();
											onSetFocalPoint(imageOf(file));
										}}
									>
										{#snippet children()}
											<iconify-icon icon="mdi:crosshairs-gps" width={15}></iconify-icon>
										{/snippet}
									</MediaGridActionTooltip>

									<MediaGridActionTooltip
										title={builder_tag_input_label()}
										ariaLabel="Tags for {file.filename}"
										class={actionBtnClass}
										onclick={(e) => {
											e.stopPropagation();
											openTagEditor(imageOf(file));
										}}
									>
										{#snippet children()}
											<iconify-icon
												icon={file.metadata?.tags?.length || file.metadata?.aiTags?.length
													? 'mdi:tag'
													: 'mdi:tag-outline'}
												width={15}
											></iconify-icon>
										{/snippet}
									</MediaGridActionTooltip>
								{/if}

								<MediaGridActionTooltip
									title={mediagallery_copy_url()}
									ariaLabel={mediagallery_copy_url_aria({ name: file.filename })}
									class={actionBtnClass}
									data-testid="media-copy-url"
									onclick={async (e) => {
										e.stopPropagation();
										const raw = file.url || mediaDisplayUrl(file);
										if (!raw) {
											toast.error(mediagallery_copy_url_missing());
											return;
										}
										try {
											const absolute = raw.startsWith('http')
												? raw
												: new URL(raw, window.location.origin).toString();
											await navigator.clipboard.writeText(absolute);
											toast.success(mediagallery_copy_url_success());
										} catch (error) {
											logger.warn('Clipboard write failed', error);
											toast.error(mediagallery_copy_url_failed());
										}
									}}
								>
									{#snippet children()}
										<iconify-icon icon="mdi:link-variant" width={15}></iconify-icon>
									{/snippet}
								</MediaGridActionTooltip>

								<MediaGridActionTooltip
									title="Delete"
									ariaLabel="Delete {file.filename}"
									class={actionBtnClass}
									onclick={(e) => {
										e.stopPropagation();
										ondeleteImage(file);
									}}
								>
									{#snippet children()}
										<iconify-icon
											icon="mdi:trash-can-outline"
											width={15}
											class="text-error-400 transition-colors group-hover/action:text-white"
										></iconify-icon>
									{/snippet}
								</MediaGridActionTooltip>
							{/if}
						</div>
					</div>

					<div
						class="m-1 flex min-w-0 items-center gap-1 {gridSize === 'tiny'
							? 'justify-center'
							: 'justify-between'}"
					>
						{#if gridSize !== 'tiny'}
							<Badge preset="tonal" size="sm" class="shrink-0 whitespace-nowrap"
								>{formatMimeType(storedMime(file))}</Badge
							>
						{/if}

						<Badge preset="tonal" size="sm" class="shrink-0 whitespace-nowrap"
							>{formatBytes(storedSize(file))}</Badge
						>
					</div>
				</div>
			</div>
		{/each}

		<!-- Rows below the window keep the scrollbar length identical to the full list. -->
		{#if virtualized && bottomSpacerHeight > 0}
			<div
				class="col-span-full"
				style:height={`${bottomSpacerHeight}px`}
				aria-hidden="true"
				data-testid="media-grid-bottom-spacer"
			></div>
		{/if}

		{#if hasMore || serverHasMore}
			<div
				bind:this={sentinel}
				class="col-span-full flex items-center justify-center gap-1 py-5 font-mono text-[11px] text-(--admin-text-muted)"
				data-testid="media-grid-load-more"
				aria-hidden="true"
			>
				<iconify-icon icon="mdi:loading" width="18" class="animate-spin"></iconify-icon>
				<span>{mediagallery_loading_more()}</span>
			</div>
		{/if}
	{/if}

	{#if osDragOver}
		<div
			class="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-primary-500/10"
			role="status"
			aria-live="polite"
		>
			<div
				class="flex items-center gap-3 rounded-(--admin-radius-card) border-2 border-dashed border-primary-500 bg-(--admin-bg-card)/95 px-6 py-4 text-sm font-semibold text-(--admin-text-body) shadow-xl"
			>
				<iconify-icon
					icon="mdi:tray-arrow-down"
					width="26"
					aria-hidden="true"
					class="text-primary-500"
				></iconify-icon>
				Drop files to upload
			</div>
		</div>
	{/if}
</div>

{#if showTagModal}
	{#await import('@src/components/media/tag-editor/tag-editor-modal.svelte') then mod}
		<mod.default
			bind:show={showTagModal}
			bind:file={taggingFile}
			onUpdate={onUpdateImage}
			hideGenerate={true}
		/>
	{/await}
{/if}

<style>
	.media-grid-tile {
		/* Skip layout/paint for tiles outside the viewport while keeping the DOM
		   (selection, drag, focus semantics stay) — the row estimate is replaced by
		   the remembered real size after first paint. */
		content-visibility: auto;
		contain-intrinsic-size: auto var(--media-tile-estimate, 14rem);
	}

	.media-checkerboard {
		background-color: var(--color-surface-100);
		background-image:
			linear-gradient(45deg, var(--color-surface-200) 25%, transparent 25%),
			linear-gradient(-45deg, var(--color-surface-200) 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, var(--color-surface-200) 75%),
			linear-gradient(-45deg, transparent 75%, var(--color-surface-200) 75%);
		background-size: 12px 12px;
		background-position:
			0 0,
			0 6px,
			6px -6px,
			-6px 0;
	}

	:global(.dark) .media-checkerboard {
		background-color: var(--color-surface-900);
		background-image:
			linear-gradient(45deg, var(--color-surface-800) 25%, transparent 25%),
			linear-gradient(-45deg, var(--color-surface-800) 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, var(--color-surface-800) 75%),
			linear-gradient(-45deg, transparent 75%, var(--color-surface-800) 75%);
	}

	.media-grid-scroll {
		scrollbar-width: thin;
		scrollbar-color: var(--color-surface-300) transparent;
	}

	.media-grid-scroll::-webkit-scrollbar {
		width: 6px;
	}

	.media-grid-scroll::-webkit-scrollbar-thumb {
		border-radius: 4px;
		background: var(--color-surface-300);
	}

	:global(.dark) .media-grid-scroll::-webkit-scrollbar-thumb {
		background: var(--color-surface-700);
	}
</style>
