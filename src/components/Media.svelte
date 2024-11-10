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
	import { SIZES, formatBytes, debounce } from '@utils/utils';
	import axios from 'axios';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// State management using Svelte 5's $state
	let files = $state<MediaImage[]>([]);
	let search = $state('');
	let showInfo = $state(Array.from({ length: files.length }, () => false));

	// Props using Svelte 5's $props
	let { onselect = (file: MediaImage) => {} } = $props<{
		onselect?: (file: MediaImage) => void;
	}>();

	const searchDeb = debounce(500);

	async function refresh() {
		const res = await axios.get('/media/getAll');
		files = res.data;
		// Update showInfo array length when files change
		showInfo = Array.from({ length: files.length }, () => false);
	}

	// Initial load
	refresh();

	// Reactive search using $derived
	let searchEffect = $derived(() => {
		if (search !== undefined) {
			searchDeb(() => refresh());
		}
	});

	function toggleInfo(event: Event, index: number) {
		event.stopPropagation();
		showInfo[index] = !showInfo[index];
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
		<input type="text" bind:value={search} placeholder="Search" class="input" />
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
							{#each Object.keys(SIZES) as size}
								<tr>
									<td class="!pl-[10px]">
										{size}
									</td>
									<td>
										{file.thumbnails[size].width}x{file.thumbnails[size].height}
									</td>
									<td>
										{formatBytes(file.thumbnails[size].size)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		{/each}
	</div>
{/if}
