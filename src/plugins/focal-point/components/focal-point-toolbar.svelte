<!--
@file src/plugins/focal-point/components/focal-point-toolbar.svelte
@component
**Focal Point Plugin Launcher — injected into the media_gallery Slot zone**

Provides a quick-access panel for the Focal Point & Aspect Preview feature.
Editors can search for a media item by filename and open the interactive
aspect ratio preview with draggable focal point.

### Features:
- Quick media search with debounced API lookup
- Opens core AspectPreviewModal for selected image
- Displays plugin branding and version info
- Lightweight — lazy-loaded via plugin slot system
-->

<script lang="ts">
	import { logger } from '@utils/logger';
	import AspectPreviewModal from '@components/media/aspect-preview-modal.svelte';
	import 'iconify-icon';

	let searchQuery = $state('');
	let searchResults = $state<any[]>([]);
	let isSearching = $state(false);
	let selectedMedia = $state<any>(null);
	let showPreview = $state(false);
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	interface MediaSearchResult {
		_id: string;
		filename: string;
		mimeType: string;
		url: string;
		thumbnails?: { md?: { url?: string }; sm?: { url?: string } };
		metadata?: { focalPoint?: { x: number; y: number } };
	}

	async function doSearch(query: string) {
		if (!query || query.length < 2) {
			searchResults = [];
			return;
		}
		isSearching = true;
		try {
			const res = await fetch(`/api/media?search=${encodeURIComponent(query)}&limit=6&mimeType=image`);
			if (res.ok) {
				const data = await res.json();
				searchResults = (data.data || data || []).slice(0, 6);
			}
		} catch (err) {
			logger.error('Focal Point plugin: search failed', err);
		} finally {
			isSearching = false;
		}
	}

	function handleSearchInput(e: Event) {
		searchQuery = (e.target as HTMLInputElement).value;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => doSearch(searchQuery), 300);
	}

	function openPreview(media: MediaSearchResult) {
		selectedMedia = media;
		showPreview = true;
	}

	function closePreview() {
		showPreview = false;
		selectedMedia = null;
	}
</script>

<div class="rounded-xl border border-surface-200 bg-surface-50 p-5 shadow-sm dark:border-surface-700 dark:bg-surface-800">
	<!-- Header -->
	<div class="mb-4 flex items-center gap-3">
		<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-500/10">
			<iconify-icon icon="mdi:crosshairs-gps" width="24" class="text-primary-500"></iconify-icon>
		</div>
		<div>
			<h4 class="text-sm font-semibold text-surface-900 dark:text-surface-50">Focal Point Preview</h4>
			<p class="text-xs text-surface-500 dark:text-surface-400">See how images crop across aspect ratios</p>
		</div>
	</div>

	<!-- Search input -->
	<div class="relative mb-3">
		<label for="focal-point-search" class="mb-1 block text-xs font-medium text-surface-600 dark:text-surface-400">Search for an image</label>
		<input id="focal-point-search" type="text"
			placeholder="Type a filename..."
			value={searchQuery}
			oninput={handleSearchInput}
			aria-label="Search media for focal point preview"
			class="w-full rounded-lg border border-surface-300 bg-surface-100 py-2 ps-3 pe-3 text-sm text-surface-900 placeholder:text-surface-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/30 dark:border-surface-600 dark:bg-surface-700 dark:text-surface-50"
		/>
	</div>

	<!-- Search results -->
	{#if isSearching}
		<div class="flex items-center justify-center py-4">
			<iconify-icon icon="mdi:loading" width="20" class="animate-spin text-surface-400"></iconify-icon>
		</div>
	{:else if searchResults.length > 0}
		<div class="grid grid-cols-3 gap-2">
			{#each searchResults as item (item._id)}
				<button
					type="button"
					onclick={() => openPreview(item)}
					class="group relative overflow-hidden rounded-lg border border-surface-200 bg-surface-100 transition-all hover:border-primary-400 hover:shadow-md dark:border-surface-600 dark:bg-surface-700 dark:hover:border-primary-500"
					aria-label={`Preview aspect ratios for ${item.filename}`}
				>
					<div class="aspect-square overflow-hidden">
						<img
							src={item.thumbnails?.sm?.url || item.thumbnails?.md?.url || item.url}
							alt={item.filename}
							class="h-full w-full object-cover transition-transform group-hover:scale-105"
							loading="lazy"
						/>
					</div>
					<div class="truncate px-1.5 py-1 text-[10px] font-medium text-surface-700 dark:text-surface-300">
						{item.filename}
					</div>
				</button>
			{/each}
		</div>
	{:else if searchQuery.length >= 2}
		<p class="py-3 text-center text-xs text-surface-400">No images found for "{searchQuery}"</p>
	{:else}
		<p class="py-3 text-center text-xs text-surface-400">Type to search for an image, then click to preview its aspect ratios</p>
	{/if}

	<!-- Plugin version footer -->
	<div class="mt-4 border-t border-surface-200 pt-3 dark:border-surface-700">
		<p class="text-[10px] text-surface-400">Focal Point Plugin v1.0.0 — Part of SveltyCMS Media Suite</p>
	</div>
</div>

<!-- Aspect Preview Modal -->
{#if showPreview && selectedMedia}
	<AspectPreviewModal
		media={selectedMedia}
		show={showPreview}
		onClose={closePreview}
		onSave={() => {
			// Refresh search results to pick up updated focal point
			if (searchQuery.length >= 2) doSearch(searchQuery);
		}}
	/>
{/if}
