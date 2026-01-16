<!--
@file src/components/Media.svelte
@component
**Media Gallery Component with Accessibility**

Displays a grid of media files with search, thumbnails, and detailed info view.

@example
<Media onselect={(file) => logger.debug('Selected:', file)} />

### Props
- `onselect` {function} - Callback when a file is selected

### Features
- Searchable media list
- Thumbnail previews
- Toggleable detailed info view	
-->

<script lang="ts">
	import { logger } from '@utils/logger';
	import type { MediaImage } from '@utils/media/mediaModels';
	import { debounce } from '@utils/utils';
	import axios from 'axios';
	import { onMount } from 'svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Types
	type ThumbnailSize = 'sm' | 'md' | 'lg';

	// Props
	interface Props {
		onselect?: (file: MediaImage) => void;
	}

	const { onselect = () => {} }: Props = $props();

	// Constants
	const THUMBNAIL_SIZES: ThumbnailSize[] = ['sm', 'md', 'lg'];
	const DEBOUNCE_MS = 500;

	// State
	let files = $state<MediaImage[]>([]);
	let search = $state('');
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let showInfoSet = $state(new Set<number>()); // More efficient than array for toggles

	// Debounced search
	const searchDebounced = debounce(DEBOUNCE_MS);

	// Filtered files based on search
	const filteredFiles = $derived.by(() => {
		if (!search.trim()) return files;

		const searchLower = search.toLowerCase();
		return files.filter((file) => file.filename.toLowerCase().includes(searchLower));
	});

	// Check if info is shown for a specific index
	function isInfoShown(index: number): boolean {
		return showInfoSet.has(index);
	}

	// Toggle info display for a file
	function toggleInfo(event: Event, index: number): void {
		event.stopPropagation();
		event.preventDefault();

		const newSet = new Set(showInfoSet);
		if (newSet.has(index)) {
			newSet.delete(index);
		} else {
			newSet.add(index);
		}
		showInfoSet = newSet;
	}

	// Fetch all media files
	async function fetchMedia(): Promise<void> {
		isLoading = true;
		error = null;

		try {
			const res = await axios.get<MediaImage[]>('/media/getAll');
			files = res.data;
			showInfoSet = new Set(); // Reset info toggles on refresh
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load media';
			logger.error('Error fetching media:', err);
		} finally {
			isLoading = false;
		}
	}

	// Handle file selection
	function handleSelect(file: MediaImage): void {
		onselect(file);
	}

	// Handle keyboard selection
	function handleKeydown(event: KeyboardEvent, file: MediaImage): void {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleSelect(file);
		}
	}

	// Handle info toggle keyboard
	function handleInfoKeydown(event: KeyboardEvent, index: number): void {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			toggleInfo(event, index);
		}
	}

	// Get thumbnail URL safely
	function getThumbnailUrl(file: MediaImage, size: ThumbnailSize = 'sm'): string {
		return file.thumbnails?.[size]?.url || '';
	}

	// Get thumbnail dimensions safely
	function getThumbnailDimensions(file: MediaImage, size: ThumbnailSize): string {
		const thumbnail = file.thumbnails?.[size];
		return thumbnail ? `${thumbnail.width}x${thumbnail.height}` : 'N/A';
	}

	// Search effect
	$effect(() => {
		// Trigger search only when search value changes
		if (search !== undefined) {
			searchDebounced(() => {
				// Search is handled by filteredFiles derived state
				// This could trigger a server-side search if needed
			});
		}
	});

	// Initial load
	onMount(() => {
		fetchMedia();
	});
</script>

<div class="flex h-full flex-col gap-4">
	<!-- Header with search -->
	<div class="flex items-center gap-2">
		<label for="media-search" class="font-bold text-tertiary-500 dark:text-primary-500"> Media </label>
		<input
			type="text"
			bind:value={search}
			placeholder="Search files..."
			class="input"
			id="media-search"
			aria-label="Search media files"
			disabled={isLoading}
		/>
		<button onclick={fetchMedia} class="preset-ghost-primary-500 btn btn-sm" disabled={isLoading} aria-label="Refresh media">
			<iconify-icon icon="mdi:refresh" width="20"></iconify-icon>
		</button>
	</div>

	<!-- Loading state -->
	{#if isLoading}
		<div class="flex flex-1 items-center justify-center text-center">
			<div class="flex flex-col items-center gap-2">
				<iconify-icon icon="svg-spinners:ring-resize" height="44" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
				<p class="text-lg text-tertiary-500 dark:text-primary-500">Loading media...</p>
			</div>
		</div>
	{:else if error}
		<!-- Error state -->
		<div class="flex flex-1 items-center justify-center text-center">
			<div class="flex flex-col items-center gap-2">
				<iconify-icon icon="bi:exclamation-circle-fill" height="44" class="text-error-500"></iconify-icon>
				<p class="text-lg text-error-500">Error: {error}</p>
				<button onclick={fetchMedia} class="preset-filled-primary-500 btn btn-sm"> Try Again </button>
			</div>
		</div>
	{:else if filteredFiles.length === 0}
		<!-- Empty state -->
		<div class="flex flex-1 items-center justify-center text-center">
			<div class="flex flex-col items-center gap-2">
				<iconify-icon icon="bi:exclamation-circle-fill" height="44" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
				<p class="text-lg text-tertiary-500 dark:text-primary-500">
					{search ? `No media found for "${search}"` : m.mediagallery_nomedia()}
				</p>
			</div>
		</div>
	{:else}
		<!-- Media grid -->
		<div class="grid flex-1 grid-cols-1 gap-4 overflow-auto md:grid-cols-2 lg:grid-cols-3" role="list" aria-label="Media files">
			{#each filteredFiles as file, index (file.filename)}
				<div class="group card relative flex flex-col overflow-hidden">
					<!-- Header -->
					<div class="relative z-10 flex w-full items-center bg-surface-700/90 backdrop-blur-sm">
						<button
							onclick={(event) => toggleInfo(event, index)}
							onkeydown={(event) => handleInfoKeydown(event, index)}
							aria-label={`${isInfoShown(index) ? 'Hide' : 'Show'} info for ${file.filename}`}
							aria-pressed={isInfoShown(index)}
							class="btn btn-sm m-1 p-1 hover:bg-surface-600"
							type="button"
						>
							<iconify-icon icon={isInfoShown(index) ? 'mdi:information-off' : 'raphael:info'} width="24" class="text-tertiary-500"></iconify-icon>
						</button>
						<p class="flex-1 truncate pr-2 text-center text-sm text-white" title={file.filename}>
							{file.filename}
						</p>
					</div>

					<!-- Content - Clickable area -->
					<button
						onclick={() => handleSelect(file)}
						onkeydown={(event) => handleKeydown(event, file)}
						aria-label={`Select ${file.filename}`}
						class="flex flex-1 items-center justify-center pt-2 transition-transform hover:scale-[1.02] focus:scale-[1.02] focus:outline-2 focus:outline-primary-500"
						type="button"
					>
						{#if !isInfoShown(index)}
							<!-- Thumbnail view -->
							<img src={getThumbnailUrl(file)} alt={file.filename} class="max-h-full max-w-full rounded-md object-contain" loading="lazy" />
						{:else}
							<!-- Info view -->
							<div class="w-full p-4 text-left">
								<h4 class="mb-2 text-sm font-semibold">Thumbnail Sizes</h4>
								<table class="table w-full">
									<thead>
										<tr>
											<th class="text-left">Size</th>
											<th class="text-left">Dimensions</th>
										</tr>
									</thead>
									<tbody>
										{#each THUMBNAIL_SIZES as size (size)}
											{#if file.thumbnails?.[size]}
												<tr>
													<td class="uppercase">{size}</td>
													<td>{getThumbnailDimensions(file, size)}</td>
												</tr>
											{/if}
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>
