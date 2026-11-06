<!--
@file src/routes/(app)/mediagallery/media-grid.svelte
@component
**Grid view component for the media gallery**

### Features:
- Keyboard navigation (Enter/Space to select)
- Multi-select integration
- High-contrast focus states
- Drag media (or multi-selection) onto sidebar virtual folders
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
	import {
		type MediaBase,
		type MediaImage,
		normalizeProcessingStatus
	} from '@utils/media/media-models';
	import { mediaDisplayUrl } from '@utils/media/media-utils';
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
	import { SvelteSet } from 'svelte/reactivity';

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
		/** Asks the parent for the next server page. */
		onLoadMore?: () => void;
		ondeleteImage?: (file: MediaBase | MediaImage) => void;
		onEditImage?: (file: MediaImage) => void;
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
		onLoadMore = () => {},
		ondeleteImage = () => {},
		onEditImage = () => {},
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
	let failedImages = $state(new SvelteSet<string>());
	let touchActiveId = $state<string | null>(null);
	/** Shift-click range anchor (grid order of the last selected tile). */
	let lastSelectedId = $state<string | null>(null);
	/** File drag from the OS is hovering the grid — shows the drop overlay. */
	let osDragOver = $state(false);
	let osDragDepth = 0;

	const BATCH_SIZE = 60;
	let visibleCount = $state(BATCH_SIZE);
	let scrollRoot = $state<HTMLElement>();
	let sentinel = $state<HTMLElement>();
	let lastHeadKey = '';
	let lastTotal = 0;

	const visibleFiles = $derived(filteredFiles.slice(0, visibleCount));
	const hasMore = $derived(visibleCount < filteredFiles.length);
	const previewSize = $derived(
		gridSize === 'large' ? 'md' : gridSize === 'medium' ? 'sm' : 'thumbnail'
	);

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
		scrollRoot?.scrollTo({ top: 0 });
	});

	$effect(() => {
		if (!sentinel) return;
		// Reading the paging state re-arms the observer when a server page lands: a
		// fresh observer emits an initial entry, which is what continues the chain
		// while the sentinel never left the viewport (IntersectionObserver only
		// reports threshold *changes*).
		const hasServerMore = serverHasMore;
		const loading = isLoadingMore;
		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries[0]?.isIntersecting) return;
				if (visibleCount < filteredFiles.length) {
					visibleCount = Math.min(visibleCount + BATCH_SIZE, filteredFiles.length);
					return;
				}
				// Local batches exhausted — pull the next server page of the folder.
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

	/** Shift-click selects the whole range from the previous anchor (visible batch). */
	function selectWithRange(file: MediaBase | MediaImage, shiftKey: boolean) {
		const fileId = fileIdOf(file);
		if (shiftKey && lastSelectedId) {
			const ids = visibleFiles.map(fileIdOf);
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
	role="grid"
	tabindex="-1"
	aria-label={mediagallery_media_grid_aria()}
	data-testid="media-grid"
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
							const input = e.target as HTMLInputElement;
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
		{#each visibleFiles as file (file._id || file.filename)}
			{@const fileId = file._id?.toString() || file.filename}
			{@const processing = processingStatusOf(file)}
			{@const inUse = publishedMediaIds.has(fileId)}

			<!-- Row wrapper (display: contents) keeps the gridcell as the grid item while
			     satisfying the grid's required row → gridcell ownership. -->
			<div role="row" class="contents">
				<div
					class="group relative flex h-full flex-col focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-(--admin-focus-ring) cursor-grab active:cursor-grabbing
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
					in:adminFade={{ duration: motionDuration(120) }}
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

					{#if processing !== 'ready' || inUse}
						<div class="pointer-events-none absolute bottom-9 inset-s-2 z-20 flex flex-wrap gap-1">
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

					<div
						class="media-checkerboard relative aspect-square w-full overflow-hidden rounded-t-lg ring-1 ring-inset ring-surface-500/20 dark:ring-surface-500/30"
					>
						<!--
            Use a div (not <button>) so HTML5 drag can start from the thumbnail.
            Native buttons cancel dragstart in Chromium when nested under a draggable parent.
          -->
						<Tooltip
							title={mediagallery_drag_to_folder()}
							positioning={{ placement: 'top' }}
							triggerClass="h-full w-full"
						>
							<div
								role="button"
								tabindex="0"
								class="relative h-full w-full cursor-grab text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 active:cursor-grabbing"
								onclick={(e) => handleItemClick(file, e)}
								onkeydown={(e: KeyboardEvent) => handleKeyDown(e, file)}
								aria-label={mediagallery_preview_drag_aria({ name: file.filename })}
							>
								{#if file.type === 'image' && !failedImages.has(fileId)}
									<div
										class="h-full w-full transition-colors duration-500"
										style:background-color={(file.metadata?.dominantColor as string) ||
											'transparent'}
									>
										{#if file.metadata?.placeholder}
											<img
												src={file.metadata.placeholder as string}
												alt=""
												class="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-xl"
												aria-hidden="true"
												draggable="false"
												crossorigin="anonymous"
											/>
										{/if}

										<img
											src={mediaDisplayUrl(file, previewSize)}
											alt=""
											class="relative h-full w-full object-cover transition-transform duration-300 sm:group-hover:scale-[1.02] pointer-events-none"
											style:object-position={file.metadata?.focalPoint
												? `${file.metadata.focalPoint.x}% ${file.metadata.focalPoint.y}%`
												: 'center'}
											loading="lazy"
											decoding="async"
											draggable="false"
											crossorigin="anonymous"
											onerror={() => failedImages.add(fileId)}
											onload={(e) => (e.currentTarget as HTMLElement).classList.add('opacity-100')}
										/>
									</div>
								{:else}
									<div
										class="flex h-full w-full items-center justify-center bg-(--admin-bg-card)/80"
									>
										<iconify-icon
											icon={file.type === 'image' ? 'mdi:image-off-outline' : getFileIcon(file)}
											width={36}
											class="text-(--admin-text-muted)"
										></iconify-icon>
									</div>
								{/if}

								<div
									class="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-linear-to-t from-black/75 via-black/30 to-transparent px-2.5 pb-2 pt-8"
								>
									<p dir="auto" class="truncate text-[11px] font-medium leading-tight text-white">
										{file.filename}
									</p>
								</div>
							</div>
						</Tooltip>

						<div
							class="absolute inset-e-2 top-2 z-20 flex flex-col gap-1 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 {touchActiveId ===
							fileId
								? 'opacity-100'
								: 'opacity-0'}"
							data-no-drag
							data-testid="media-grid-actions"
						>
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
											class="mb-0 border-b border-(--admin-border-default) pb-2 text-center text-[13px] font-semibold wrap-break-word"
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
													<td class="py-1 px-2 text-center border-e border-(--admin-border-default)"
														>{getDimensionsLabel(file) || '-'}</td
													>
													<td class="py-1 px-2 text-end tabular-nums" colspan="2"
														>{formatBytes((file as MediaImage).size)}</td
													>
												</tr>
												{#if file.thumbnails}
													{@const hasWebp = hasWebpVariants(file.thumbnails)}
													{@const primaryLabel = primaryFormatLabel(
														file.thumbnails,
														(file as MediaImage).mimeType
													)}
													<tr class="border-b border-(--admin-border-default)">
														<td
															class="py-1 px-2 font-bold text-(--admin-text-muted) border-e border-(--admin-border-default) text-start"
															colspan="4"
														>
															{mediagallery_resized_variants()}{#if primaryLabel}{primaryLabel}{#if hasWebp}
																	+ WebP{/if}{/if}
														</td>
													</tr>
													{#each deriveSizeKeys(file.thumbnails) as sizeKey (sizeKey)}
														{@const webpKey = getWebpKey(file.thumbnails, sizeKey)}
														{@const thumb = file.thumbnails[sizeKey]!}
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
																	{(thumb as any).size ? formatBytes((thumb as any).size) : '-'}
																</td>
																<td class="py-1 px-2 text-end tabular-nums">
																	{#if webpKey}
																		{formatBytes((file.thumbnails[webpKey] as any).size)}
																	{:else}
																		<span
																			class="text-(--admin-text-muted) dark:text-(--admin-text-muted)"
																			>—</span
																		>
																	{/if}
																</td>
															{:else}
																<td class="py-1 px-2 text-end tabular-nums">
																	{(thumb as any).size ? formatBytes((thumb as any).size) : '-'}
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
									onEditImage(file as MediaImage);
								}}
							>
								{#snippet children()}
									<iconify-icon icon="mdi:pencil" width={15}></iconify-icon>
								{/snippet}
							</MediaGridActionTooltip>

							{#if file.type === 'image'}
								<MediaGridActionTooltip
									title={builder_tag_input_label()}
									ariaLabel="Tags for {file.filename}"
									class={actionBtnClass}
									onclick={(e) => {
										e.stopPropagation();
										openTagEditor(file as MediaImage);
									}}
								>
									{#snippet children()}
										<iconify-icon
											icon={(file as MediaImage).metadata?.tags?.length ||
											(file as MediaImage).metadata?.aiTags?.length
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
						</div>
					</div>

					<div
						class="mt-1.5 flex items-baseline justify-between gap-2 border-b border-surface-500/30 px-1.5 pb-2 pt-0.5 sm:px-2 dark:border-surface-500/40"
					>
						<span
							class="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wide text-(--admin-text-muted) sm:text-[11px] dark:text-(--admin-text-muted)"
						>
							{formatMimeType((file as MediaImage).mimeType)}
						</span>
						<span
							class="shrink-0 font-mono text-[10px] tabular-nums text-(--admin-text-muted) sm:text-[11px] dark:text-(--admin-text-muted)"
						>
							{formatBytes((file as MediaImage).size)}
						</span>
					</div>
				</div>
			</div>
		{/each}

		{#if hasMore || serverHasMore}
			<div
				bind:this={sentinel}
				class="col-span-full flex items-center justify-center gap-2 py-5 font-mono text-[11px] text-(--admin-text-muted)"
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
