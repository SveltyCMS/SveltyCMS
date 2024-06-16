<script lang="ts">
	export let mediaItems = [];
	export let selectedMedia = null;
	export let onSelect;

	function handleSelect(media) {
		onSelect(media);
	}
</script>

<div class="grid grid-cols-3 gap-4">
	{#each mediaItems as media}
		<div class="cursor-pointer" on:click={() => handleSelect(media)}>
			<img src={media.url} alt={media.name} class="thumbnail {media === selectedMedia ? 'selected' : ''}" />
		</div>
	{/each}
</div>

<style>
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
