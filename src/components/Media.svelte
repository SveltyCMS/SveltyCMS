<!-- 
@file src/components/Media.svelte
@component
**Media component with accessibility updates and button nesting resolved**

```tsx
<Media bind:files={files} />
```
#### Props
- `files` {array} - Array of media files
-->

<script lang="ts">
	import type { MediaImage } from '@utils/media/mediaModels';
	import { debounce } from '@utils/utils';
	import axios from 'axios';
	import { publicEnv } from '@root/config/public';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Props
	let { onselect = () => {} } = $props<{
		onselect?: (file: MediaImage) => void;
	}>();

	// State declarations using $state
	let files = $state<MediaImage[]>([]);
	let search = $state('');
	let showInfo = $state<boolean[]>([]);
	let thumbnailSizes = $state<(keyof typeof publicEnv.IMAGE_SIZES)[]>(['sm', 'md', 'lg']);

	// Create a separate state updater function
	function updateShowInfo() {
		showInfo = Array.from({ length: files.length }, () => false);
	}

	const searchDeb = debounce(500);

	async function refresh() {
		const res = await axios.get('/media/getAll');
		files = res.data;
		updateShowInfo(); // Update showInfo when files change
	}

	// Initial load
	refresh();

	// Search effect using $effect instead of $derived
	$effect(() => {
		if (search !== undefined) {
			searchDeb(() => refresh());
		}
	});

	function toggleInfo(event: Event, index: number) {
		event.stopPropagation();
		const newShowInfo = [...showInfo];
		newShowInfo[index] = !newShowInfo[index];
		showInfo = newShowInfo; // Properly update the state array
	}
</script>

{#if files.length === 0}
	<!-- Display a message when no media is found -->
	<div class="mx-auto text-center text-tertiary-500 dark:text-primary-500">
		<iconify-icon icon="bi:exclamation-circle-fill" height="44" class="mb-2"></iconify-icon>
		<p class="text-lg">{m.mediagallery_nomedia()}</p>
	</div>
{:else}
	<div class="header flex items-center gap-2">
		<label for="search" class="font-bold text-tertiary-500 dark:text-primary-500">Media</label>
		<input type="text" bind:value={search} placeholder="Search" class="input" id="search" />
	</div>
	<div class="flex max-h-[calc(100%-55px)] flex-wrap items-center justify-center overflow-auto">
		{#each files as file, index}
			<div
				onclick={() => onselect(file)}
				onkeydown={(event) => (event.key === 'Enter' || event.key === ' ') && onselect(file)}
				role="button"
				tabindex="0"
				class="card relative flex w-full cursor-pointer flex-col md:w-[30%]"
			>
				<div class="absolute flex w-full items-center bg-surface-700">
					<span
						onclick={(event) => toggleInfo(event, index)}
						onkeydown={(event) => (event.key === 'Enter' || event.key === ' ') && toggleInfo(event, index)}
						aria-label="Show info"
						role="button"
						tabindex="0"
						class="ml-[2px] mt-[2px] block w-[30px]"
					>
						<iconify-icon icon="raphael:info" width="25" class="text-tertiary-500"></iconify-icon>
					</span>
					<p class="mx-auto pr-[30px] text-white">{file.name}</p>
				</div>
				{#if !showInfo[index]}
					<img src={file.thumbnails.sm.url} alt={file.name} class="mx-auto mt-auto max-h-[calc(100%-35px)] rounded-md" />
				{:else}
					<table class="mt-[30px] min-h-[calc(100%-30px)] w-full">
						<tbody class="table-compact">
							{#each thumbnailSizes as size}
								{#if file.thumbnails && file.thumbnails[size]}
									<tr>
										<td class="!pl-[10px]">
											{size}
										</td>
										<td>
											{file.thumbnails[size].width}x{file.thumbnails[size].height}
										</td>
									</tr>
								{/if}
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		{/each}
	</div>
{/if}
