<!-- 
@file src/components/WatermarkSelector.svelte
@component
**Enhanced WatermarkSelector component for selecting watermark images**

Features:
- Displays a grid of selectable watermark images
- Handles keyboard navigation and selection
- Visually indicates the selected image
- Fully accessible with proper ARIA attributes

Usage:
<WatermarkSelector {mediaItems} bind:selectedMedia {onSelect} />
-->

<script lang="ts">
	import type { MediaType } from '@utils/media/mediaModels';

	interface Props {
		// Component props
		mediaItems?: MediaType[];
		selectedMedia?: MediaType | null;
		onSelect: (media: MediaType) => void;
	}

	let { mediaItems = [], selectedMedia = null, onSelect }: Props = $props();

	// Handle selection of a media item
	function handleSelect(media: MediaType) {
		onSelect(media);
	}

	// Handle keyboard navigation
	function handleKeydown(event: KeyboardEvent, media: MediaType) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleSelect(media);
		}
	}
</script>

<div class="grid grid-cols-3 gap-4" role="radiogroup" aria-label="Watermark image selection">
	{#each mediaItems as media, index}
		<button
			type="button"
			class="cursor-pointer overflow-hidden rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
			onclick={() => handleSelect(media)}
			onkeydown={(e) => handleKeydown(e, media)}
			aria-checked={media === selectedMedia}
			role="radio"
			tabindex={index === 0 ? 0 : -1}
		>
			<img
				src={media.url}
				alt={media.name}
				class="h-auto w-full border-2 transition-all duration-300 {media === selectedMedia
					? 'scale-95 border-blue-500'
					: 'border-transparent hover:border-gray-300'}"
			/>
		</button>
	{/each}
</div>
