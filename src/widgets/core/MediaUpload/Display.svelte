<!--
@file src/widgets/core/MediaUpload/Display.svelte
@component
**Media Upload Display Widget Component**

Renders selected media files as thumbnails for display purposes.

### Props
- `value: string | string[] | null | undefined` - The ID(s) of the selected media file(s).

### Features
- **Thumbnail Display**: Shows small thumbnails of selected media files.
- **Tooltip Support**: Displays the file name on hover.
- **Fallback Handling**: Displays a dash if no files are selected.
- **Svelte 5 Runes**: Uses `$state` and `$effect` for reactive state management.
- **Utility-Driven Styling**: All styling is done using Tailwind CSS utility classes.
- **Semantic Colors**: Uses theme-defined semantic colors for borders and backgrounds.
-->
<script lang="ts">
	import type { MediaFile } from './types';

	const { value }: { value: string | string[] | null | undefined } = $props();

	// Local state for the resolved file(s).
	let files: MediaFile[] = $state([]);

	// Fetch media data when the value prop changes.
	$effect(() => {
		const ids = Array.isArray(value) ? value : value ? [value] : [];
		if (ids.length > 0) {
			const fetchAll = async () => {
				const results: MediaFile[] = [];
				for (const id of ids) {
					try {
						const response = await fetch(`/api/media/${id}`);
						if (response.ok) {
							const found = await response.json();
							results.push({
								_id: found._id,
								name: found.filename,
								type: found.mimeType,
								size: found.size,
								url: found.url,
								thumbnailUrl: found.thumbnails?.sm?.url || found.url,
								aiTags: found.metadata?.aiTags || []
							} as any);
						}
					} catch (e) {
						console.error(`Failed to fetch media ${id}`, e);
					}
				}
				files = results;
			};
			fetchAll();
		} else {
			files = [];
		}
	});
</script>

<div class="flex items-center justify-center gap-1 p-0.5">
	{#if files.length > 0}
		{#each files as file (file._id)}
			<div class="group relative">
				<img
					src={file.thumbnailUrl}
					alt={file.name}
					title={file.name}
					class="h-8 w-8 rounded border border-surface-200 object-cover dark:text-surface-50"
				>
				{#if (file as any).aiTags?.length}
					<div
						class="absolute bottom-full left-1/2 z-10 hidden -translate-x-1/2 flex-wrap gap-1 rounded bg-surface-900 p-1 text-[8px] text-white group-hover:flex"
					>
						{#each (file as any).aiTags.slice(0, 5) as tag, i (tag + i)}
							<span class="badge variant-filled-primary py-0 px-1">{tag}</span>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	{:else}
		<span>–</span>
	{/if}
</div>
