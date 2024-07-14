<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { formatBytes } from '@src/utils/utils';
	import { popup, type PopupSettings } from '@skeletonlabs/skeleton';

	export let filteredFiles;
	export let gridSize;

	const dispatch = createEventDispatcher();

	// Initialize the showInfo array with false values
	const showInfo = Array.from({ length: filteredFiles.length }, () => false);

	// Popup Tooltips
	const FileTooltip: PopupSettings = {
		event: 'click',
		target: 'FileInfo',
		placement: 'right'
	};

	function handleDelete(file) {
		dispatch('deleteImage', file);
	}
</script>

<div class="flex flex-wrap items-center gap-4 overflow-auto">
	{#if filteredFiles.length === 0}
		<div class="mx-auto text-center text-tertiary-500 dark:text-primary-500">
			<iconify-icon icon="bi:exclamation-circle-fill" height="44" class="mb-2" />
			<p class="text-lg">No media found</p>
		</div>
	{:else}
		{#each filteredFiles as file, index}
			<div
				on:mouseenter={() => (showInfo[index] = true)}
				on:mouseleave={() => (showInfo[index] = false)}
				role="button"
				tabindex="0"
				class="card border border-surface-300 dark:border-surface-500"
			>
				<header class="m-2 flex w-auto items-center justify-between">
					<button class="btn-icon" use:popup={FileTooltip}>
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
							<div class="variant-filled arrow" />
						</table>
					</div>
					<button class="btn-icon">
						<iconify-icon icon="mdi:pen" width="24" class="data:text-primary-500 text-tertiary-500" />
					</button>
					<button class="btn-icon" on:click={() => handleDelete(file)}>
						<iconify-icon icon="icomoon-free:bin" width="24" class="text-error-500" />
					</button>
				</header>

				<section class="p-2">
					<img
						src={file.thumbnail.url}
						alt={file.thumbnail.name}
						class={`relative -top-4 left-0 ${gridSize === 'small' ? 'h-26 w-26' : gridSize === 'medium' ? 'h-48 w-48' : 'h-80 w-80'}`}
					/>
				</section>

				<footer class={`-mt-1 mb-3 text-center ${gridSize === 'small' ? 'text-xs' : 'text-base'}`}>
					{file.thumbnail.name}
				</footer>
			</div>
		{/each}
	{/if}
</div>
