<!--
@file src/routes/(app)/mediagallery/MediaGrid.svelte
@description Grid view component for the media gallery. Displays media items in a responsive grid layout with file information and actions.

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
	import { getMediaUrl } from '@utils/media/mediaUtils';
	import type { MediaBase } from '@utils/media/mediaModels';

	// Skeleton
	import { popup, type PopupSettings } from '@skeletonlabs/skeleton';

	interface Props {
		filteredFiles?: MediaBase[];
		gridSize?: 'small' | 'medium' | 'large';
		'on:deleteImage'?: (file: MediaBase) => void;
	}

	let { filteredFiles = [], gridSize, 'on:deleteImage': onDeleteImage = () => {} }: Props = $props();

	// Initialize the showInfo array with false values
	let showInfo = $state(Array.from({ length: filteredFiles.length }, () => false));

	// Popup Tooltips
	const FileTooltip: PopupSettings = {
		event: 'click',
		target: 'FileInfo',
		placement: 'right'
	};

	function handleDelete(file: MediaBase) {
		onDeleteImage(file);
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
		{#each filteredFiles as file, index}
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
								{#each Object.keys(file).filter((key) => key !== 'thumbnail' && key !== 'type') as size}
									{#if file[size]}
										<tr class="divide-x divide-surface-400 border-b border-surface-400 last:border-b-0">
											<td class="font-bold text-tertiary-500">{size}</td>
											<td class="pr-1 text-right">
												{#if file[size].width && file[size].height}
													{file[size].width}x{file[size].height}
												{:else}
													N/A
												{/if}
											</td>
											<td class="text-right">
												{#if file[size].size}
													{formatBytes(file[size].size)}
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
					<img
						src={getMediaUrl(file, 'thumbnail')}
						alt={file.name}
						class={`relative -top-4 left-0 ${gridSize === 'small' ? 'h-26 w-26' : gridSize === 'medium' ? 'h-48 w-48' : 'h-80 w-80'}`}
					/>
				</section>

				<footer class="p-2 text-sm">
					<p class="truncate">{file.name}</p>
					<p class="text-xs text-gray-500">{formatBytes(file.size)}</p>
					<p class="text-xs text-gray-500">{file.type || 'Unknown Type'}</p>
				</footer>
			</div>
		{/each}
	{/if}
</div>
