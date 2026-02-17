<script lang="ts">
	import MediaGrid from '@src/routes/(app)/mediagallery/MediaGrid.svelte';
	import LocalUpload from '@src/routes/(app)/mediagallery/uploadMedia/LocalUpload.svelte';
	import RemoteUpload from '@src/routes/(app)/mediagallery/uploadMedia/RemoteUpload.svelte';
	import { logger } from '@utils/logger';
	import type { MediaBase, MediaImage } from '@utils/media/mediaModels';
	import { modalState } from '@utils/modalState.svelte';
	import { onMount } from 'svelte';

	import { SvelteSet } from 'svelte/reactivity';

	// Props interface

	interface Props {
		allowedTypes?: string[];
		folder?: string;
		parent?: unknown;
	}

	let { allowedTypes = [], folder = 'global' }: Props = $props();

	let activeTab = $state<'library' | 'local' | 'remote'>('local');
	let files = $state<(MediaBase | MediaImage)[]>([]);
	// eslint-disable-next-line svelte/no-unnecessary-state-wrap
	let selectedFiles = $state(new SvelteSet<string>());
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	async function fetchMedia() {
		isLoading = true;
		error = null;
		try {
			// Construct query with allowedTypes if provided
			const typesQuery = allowedTypes.length > 0 ? `&types=${allowedTypes.join(',')}` : '';
			// Fetch more files for the library, e.g., 50, recursively from all folders
			const response = await fetch(`/api/media?limit=100&recursive=true${typesQuery}`);
			if (!response.ok) throw new Error('Failed to fetch media');
			const data = await response.json();
			logger.debug('Fetched media files:', data);
			files = data;
		} catch (e) {
			logger.error('Error fetching media for modal:', e);
			error = 'Failed to load media library.';
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		fetchMedia();
	});

	function handleConfirm() {
		const selectedItems = files.filter((f) => selectedFiles.has(f._id?.toString() || f.filename));
		if (selectedItems.length > 0) {
			modalState.close(selectedItems);
		}
	}

	function handleClose() {
		modalState.close();
	}
</script>

{#if modalState.active}
	<div class="modal-media-library flex flex-col h-full grow p-4 shadow-xl bg-white dark:bg-surface-800">
		<header class="flex items-center justify-between border-b border-surface-200 dark:border-surface-600 pb-2 mb-4">
			<h2 class="text-xl font-bold text-primary-500">Media Library</h2>
			<div class="flex gap-2">
				<button
					class="btn {activeTab === 'local' ? 'preset-filled-primary-500' : 'preset-outline-surface-500'}"
					onclick={() => (activeTab = 'local')}
				>
					Local Upload
				</button>
				<button
					class="btn {activeTab === 'library' ? 'preset-filled-primary-500' : 'preset-outline-surface-500'}"
					onclick={() => (activeTab = 'library')}
				>
					Library
				</button>
				<button
					class="btn {activeTab === 'remote' ? 'preset-filled-primary-500' : 'preset-outline-surface-500'}"
					onclick={() => (activeTab = 'remote')}
				>
					Remote Upload
				</button>
			</div>
		</header>

		<main class="grow overflow-auto p-2">
			{#if activeTab === 'local'}
				<LocalUpload
					{folder}
					redirectOnSuccess={false}
					onUploadComplete={() => {
						fetchMedia();
						activeTab = 'library';
					}}
				/>
			{:else if activeTab === 'library'}
				{#if isLoading}
					<div class="flex h-full items-center justify-center">
						<iconify-icon icon="line-md:loading-twotone-loop" width="48" class="text-primary-500"></iconify-icon>
					</div>
				{:else if error}
					<div class="flex h-full flex-col items-center justify-center text-error-500">
						<iconify-icon icon="mdi:alert-circle" width="48"></iconify-icon>
						<p>{error}</p>
						<button class="btn preset-filled-primary-500 mt-4" onclick={fetchMedia}>Retry</button>
					</div>
				{:else}
					<MediaGrid bind:filteredFiles={files} bind:selectedFiles isSelectionMode={true} gridSize="small" />
				{/if}
			{:else if activeTab === 'remote'}
				<RemoteUpload
					{folder}
					onUploadComplete={() => {
						fetchMedia();
						activeTab = 'library';
					}}
				/>
			{/if}
		</main>

		<footer class="flex justify-end gap-2 pt-4 border-t border-surface-200 dark:border-surface-600 mt-4">
			<button type="button" class="btn preset-outline-surface-500" onclick={handleClose}>Cancel</button>
			{#if activeTab === 'library' && selectedFiles.size > 0}
				<button type="button" class="btn preset-filled-primary-500 font-bold" onclick={handleConfirm}>
					Select {selectedFiles.size} Item{selectedFiles.size > 1 ? 's' : ''}
				</button>
			{/if}
		</footer>
	</div>
{/if}
