<script lang="ts">
	import type { MediaFile } from './types';

	let { value }: { value: string | string[] | null | undefined } = $props();

	// Local state for the resolved file(s).
	let files = $state<MediaFile[]>([]);

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

<div class="display-container">
	{#if files.length > 0}
		{#each files as file (file._id)}
			<img src={file.thumbnailUrl} alt={file.name} title={file.name} class="thumbnail" />
		{/each}
	{:else}
		<span>–</span>
	{/if}
</div>

<style lang="postcss">
	.display-container {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		padding: 2px;
	}
	.thumbnail {
		width: 32px;
		height: 32px;
		object-fit: cover;
		border-radius: 4px;
		border: 1px solid #eee;
	}
</style>
