<!-- 
@file src/components/WatermarkEditor.svelte
@component
**Enhanced WatermarkEditor component for CMS integration using Tailwind CSS**

Features:
- Selects watermark image from media library
- Adjusts watermark size, opacity, position, and rotation
- Provides real-time preview of watermark settings
- Styled with Tailwind CSS for easy customization

Usage:
<WatermarkEditor mediaItems={yourMediaItems} />
-->

<script lang="ts">
	import type { MediaItem } from '@utils/media/mediaModels';
	import WatermarkSelector from './WatermarkSelector.svelte';
	import WatermarkSettings from './WatermarkSettings.svelte';

	interface Props {
		// Props
		mediaItems?: MediaItem[];
	}

	const { mediaItems = [] }: Props = $props();

	// Local state
	let selectedMedia: MediaItem | null = $state(null);
	let size = $state('100%');
	let opacity = $state(1);
	let positionX = $state(0);
	let positionY = $state(0);
	let rotation = $state(0);

	// Handle media selection
	function handleMediaSelect(media: MediaItem) {
		selectedMedia = media;
	}
</script>

<div class="space-y-6 p-5">
	<section>
		<h2 class="mb-3 text-xl font-bold">Select Watermark Image</h2>
		<WatermarkSelector {mediaItems} {selectedMedia} onSelect={handleMediaSelect} />
	</section>

	{#if selectedMedia}
		<section>
			<h2 class="mb-3 text-xl font-bold">Adjust Watermark Settings</h2>
			<WatermarkSettings bind:size bind:opacity bind:positionX bind:positionY bind:rotation />
		</section>
		<section>
			<h2 class="mb-3 text-xl font-bold">Preview</h2>
			<div
				class="h-52 w-full border border-gray-300 bg-contain bg-center bg-no-repeat"
				style="background-image: url({selectedMedia.url}); opacity: {opacity}; transform: scale({size}) translate({positionX}px, {positionY}px) rotate({rotation}deg);"
				role="img"
				aria-label="Watermark preview"
			></div>
		</section>
	{/if}
</div>
