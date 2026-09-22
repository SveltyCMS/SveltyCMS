<!--
@file src\components\watermark-selector.svelte
@component
**Enhanced WatermarkSelector component for selecting watermark images**

Features:
- Displays a grid of selectable watermark images
- Previews render from `md`/`lg` derivatives via `<Image>` (srcset) — never the original file
- Handles keyboard navigation and selection
- Visually indicates the selected image
- Fully accessible with proper ARIA attributes

Usage:
<WatermarkSelector {mediaItems} bind:selectedMedia {onSelect} />
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Image from '@components/ui/image.svelte';
	import type { MediaItem } from '@utils/media/media-models';

	interface Props {
		// Component props
		mediaItems?: MediaItem[];
		onSelect: (media: MediaItem) => void;
		selectedMedia?: MediaItem | null;
	}

	const { mediaItems = [], selectedMedia = null, onSelect }: Props = $props();

	// Handle selection of a media item
	function handleSelect(media: MediaItem) {
		onSelect(media);
	}

	// Handle keyboard navigation
	function handleKeydown(event: KeyboardEvent, media: MediaItem) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleSelect(media);
		}
	}
</script>

<div class="grid grid-cols-3 gap-4" role="radiogroup" aria-label="Watermark image selection">
	{#each mediaItems as media, index (media._id)}
		<Button
			variant="ghost"
			class="overflow-hidden rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-tertiary-500"
			onclick={() => handleSelect(media)}
			onkeydown={(e: KeyboardEvent) => handleKeydown(e, media)}
			aria-checked={media === selectedMedia}
			role="radio"
			tabindex={index === 0 ? 0 : -1}
		>
			<!-- Watermark detail decides the choice, so the tile gets `md`/`lg` (not `thumbnail`):
			     full resolution is never needed to judge a watermark. -->
			<Image
				asset={media}
				preset="hero"
				sizes="(min-width: 768px) 16rem, 33vw"
				alt={media.filename || 'Watermark preview'}
				class="h-auto w-full border-2 transition-all duration-300 {media === selectedMedia
					? 'scale-95 border-tertiary-500'
					: 'border-transparent hover:border-surface-500/40'}"
			/>
		</Button>
	{/each}
</div>
