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
			<img
				src={media.url}
				alt={media.name}
				class="transition-border-color h-auto w-full border duration-300 {media === selectedMedia ? 'border-tertiary-500' : ''}"
			/>
		</button>
	{/each}
</div>
