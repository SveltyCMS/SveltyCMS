<!-- Zoom.svelte -->
<script lang="ts">
	import { RangeSlider } from '@skeletonlabs/skeleton';
	import MouseHandler from './MouseHandler.svelte';

	export let zoom: number = 1;

	function handleZoom() {
		const preview = document.getElementById('preview') as HTMLImageElement;
		if (!preview) {
			// console.log('Preview element not found');
			return;
		}
		// Scale the image
		preview.style.transform = `scale(${zoom})`;
	}

	import { onMount, afterUpdate } from 'svelte';

	onMount(handleZoom);
	afterUpdate(handleZoom);
</script>

<RangeSlider name="zoom-slider" class="m-2 mx-auto  w-full max-w-lg" bind:value={zoom} min={0.1} max={3} step={0.1}>
	<div class="flex items-center justify-between">
		<div class="font-bold text-tertiary-500 dark:text-primary-500">Zoom</div>
		<button on:click={() => (zoom = 1)} class="btn-primary btn p-0.5 text-white" title="Reset">
			<iconify-icon icon="material-symbols:zoom-out-map" width="24" class="text-tertiary-500 dark:text-primary-500" />{zoom}
		</button>

		<div class="text-xs text-tertiary-500 dark:text-primary-500">{zoom} / 3</div>
	</div>
</RangeSlider>
