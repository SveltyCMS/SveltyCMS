<!--
@file src/routes/(app)/mediagallery/MediaGrid.svelte
@component
**Grid view component for the media gallery. Displays media items in a responsive grid layout with file information and actions**

```tsx
<MediaGrid filteredFiles={filteredFiles} gridSize="small" />
```
#### Props
- `filteredFiles: MediaBase[]`: An array of media items to be displayed in the grid view.
- `gridSize: 'small' | 'medium' | 'large'`: The size of the grid layout to be used.	

Key features:
- Responsive grid layout for media items
- Display of file name, size, and type
- Thumbnail preview for images
- Actions for file info, edit, and delete
- Uses formatBytes for human-readable file sizes
- Implements constructMediaUrl for proper URL handling
-->

<script lang="ts">
	// Utils
	import { formatBytes } from '@utils/utils';
	import type { MediaImage } from '@utils/media/mediaModels';

	// Skeleton
	import { popup, type PopupSettings } from '@skeletonlabs/skeleton';

	// Events
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	interface Props {
		filteredFiles?: MediaImage[];
		gridSize?: 'small' | 'medium' | 'large';
		ondeleteImage?: (file: MediaImage) => void;
	}

	let { filteredFiles = [], gridSize, ondeleteImage = () => {} }: Props = $props();

	// Initialize the showInfo array with false values
	let showInfo = $state(Array.from({ length: filteredFiles.length }, () => false));

	// Popup Tooltips
	const FileTooltip: PopupSettings = {
		event: 'click',
		target: 'FileInfo',
		placement: 'right'
	};

	function handleDelete(file: MediaImage) {
		ondeleteImage(file);
	}

	// Update showInfo array when filteredFiles length changes
	$effect(() => {
		showInfo = Array.from({ length: filteredFiles.length }, () => false);
	});
</script>

<div class="flex flex-wrap items-center gap-4 overflow-auto">
	{#if filteredFiles.length === 0}
		<div class="mx-auto text-center text-tertiary-500 dark:text-primary-500">
			<iconify-icon icon="bi:exclamation-circle-fill" height="44" class="mb-2"></iconify-icon>
			<p class="text-lg">No media found</p>
		</div>
	{:else}
		{#each filteredFiles as file, index (index)}
			<div
				onmouseenter={() => (showInfo[index] = true)}
				onmouseleave={() => (showInfo[index] = false)}
				role="button"
				tabindex="0"
				class="card border border-surface-300 dark:border-surface-500"
			>
				<header class="m-2 flex w-auto items-center justify-between">
					<button use:popup={FileTooltip} aria-label="File Info" class="btn-icon">
						<iconify-icon icon="raphael:info" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
					</button>

					<div class="card variant-filled z-50 min-w-[250px] p-2" data-popup="FileInfo">
						<table class="table-hover w-full table-auto">
							<thead class="text-tertiary-500">
								<tr class="divide-x divide-surface-400 border-b-2 border-surface-400 text-center">
									<th class="text-left">Format</th>
									<th class="">Pixel</th>
									<th class="">Size</th>
								</tr>
							</thead>
							<tbody>
								{#each Object.keys(file.thumbnails || {}) as size (size)}
									{#if file.thumbnails?.[size as keyof typeof file.thumbnails]}
										<tr
											class="divide-x divide-surface-400 border-b border-surface-400 last:border-b-0 {size === gridSize
												? 'bg-primary-50 dark:bg-primary-900/20'
												: ''}"
											onclick={(e) => {
												e.preventDefault();
												if (size === 'small' || size === 'medium' || size === 'large') {
													dispatch('sizechange', {
														size: size === 'small' ? 'medium' : size === 'medium' ? 'large' : 'small',
														type: 'grid'
													});
												}
											}}
										>
											<td class="font-bold text-tertiary-500"
												>{size}
												{#if size === gridSize}
													<span class="ml-1 text-xs text-primary-500">(active)</span>
												{/if}
											</td>
											<td class="pr-1 text-right">
												{#if file.thumbnails[size as keyof typeof file.thumbnails].width && file.thumbnails[size as keyof typeof file.thumbnails].height}
													{file.thumbnails[size as keyof typeof file.thumbnails].width}x{file.thumbnails[size as keyof typeof file.thumbnails].height}
												{:else}
													N/A
												{/if}
											</td>
											<td class="text-right">
												{#if file.size}
													{formatBytes(file.size)}
												{:else}
													N/A
												{/if}
											</td>
										</tr>
									{/if}
								{/each}
							</tbody>
						</table>
					</div>
					<button aria-label="Edit" class="btn-icon">
						<iconify-icon icon="mdi:pen" width="24" class="data:text-primary-500 text-tertiary-500"></iconify-icon>
					</button>
					<button onclick={() => handleDelete(file)} aria-label="Delete" class="btn-icon">
						<iconify-icon icon="icomoon-free:bin" width="24" class="text-error-500"> </iconify-icon>
					</button>
				</header>

				<section class="p-2">
					{#if file?.filename && file?.path && file?.hash}
						<img
							src={file.thumbnail?.url ?? '/static/Default_User.svg'}
							alt={`Thumbnail for ${file.filename}`}
							class={`relative -top-4 left-0 ${gridSize === 'small' ? 'h-26 w-26' : gridSize === 'medium' ? 'h-48 w-48' : 'h-80 w-80'}`}
							onerror={(e: Event) => {
								const target = e.target as HTMLImageElement;
								if (target) {
									console.error('Failed to load media thumbnail for file:', file.filename);
									target.src = '/static/Default_User.svg';
									target.alt = 'Fallback thumbnail image';
								}
							}}
							loading="lazy"
							decoding="async"
						/>
					{:else}
						<div class="flex h-full w-full items-center justify-center bg-surface-200 dark:bg-surface-700" aria-label="Missing thumbnail" role="img">
							<iconify-icon icon="bi:exclamation-triangle-fill" height="24" class="text-warning-500" aria-hidden="true"></iconify-icon>
						</div>
					{/if}
				</section>

				<footer class="p-2 text-sm">
					<p class="truncate" title={file.filename}>{file.filename}</p>
					<p class="text-xs text-gray-500">
						{#if file.size}
							{formatBytes(file.size)}
						{:else}
							Size unknown
						{/if}
					</p>
					<p class="text-xs text-gray-500">{file.type || 'Unknown Type'}</p>
				</footer>
			</div>
		{/each}
	{/if}
</div>
