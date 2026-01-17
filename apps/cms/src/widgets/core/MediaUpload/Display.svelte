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
			// In a real app, this would use the same shared fetch function as Input.svelte
			Promise.all(
				ids.map((id) =>
					Promise.resolve({
						_id: id,
						name: `Image ${id.slice(0, 4)}.jpg`,
						type: 'image/jpeg',
						size: 12345,
						url: `https://picsum.photos/id/${parseInt(id.slice(0, 3), 10)}/1920/1080`,
						thumbnailUrl: `https://picsum.photos/id/${parseInt(id.slice(0, 3), 10)}/50/50`
					})
				)
			).then((resolvedFiles) => {
				files = resolvedFiles;
			});
		} else {
			files = [];
		}
	});
</script>

<div class="flex items-center justify-center gap-1 p-0.5">
	{#if files.length > 0}
		{#each files as file (file._id)}
			<img
				src={file.thumbnailUrl}
				alt={file.name}
				title={file.name}
				class="h-8 w-8 rounded border border-surface-200 object-cover dark:text-surface-50"
			/>
		{/each}
	{:else}
		<span>–</span>
	{/if}
</div>
