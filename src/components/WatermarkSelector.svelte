<script lang="ts">
	type MediaItem = {
		url: string;
		name: string;
	};

	export let mediaItems: MediaItem[] = [];
	export let selectedMedia: MediaItem | null = null;
	export let onSelect: (media: MediaItem) => void;

	function handleSelect(media: MediaItem) {
		onSelect(media);
	}
</script>

<div class="grid grid-cols-3 gap-4">
	{#each mediaItems as media}
		<button
			type="button"
			class="cursor-pointer"
			on:click={() => handleSelect(media)}
			on:keydown={(e) => (e.key === 'Enter' ? handleSelect(media) : null)}
			aria-pressed={media === selectedMedia}
			role="button"
			tabindex="0"
		>
			<img src={media.url} alt={media.name} class="thumbnail {media === selectedMedia ? 'selected' : ''}" />
		</button>
	{/each}
</div>

<style lang="postcss">
	.thumbnail {
		width: 100%;
		height: auto;
		border: 2px solid transparent;
		transition: border-color 0.3s;
	}
	.selected {
		border-color: blue;
	}
</style>
