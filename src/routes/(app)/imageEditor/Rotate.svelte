<!-- Rotate.svelte -->
<script lang="ts">
	import { RangeSlider } from '@skeletonlabs/skeleton';

	export let rotate: number;
	export let image: File | null | undefined;

	function handleRotate() {
		const preview = document.getElementById('preview') as HTMLImageElement;
		if (!preview || !image) {
			// console.log('Preview element or image not found');
			return;
		}

		const img = new Image();
		img.src = URL.createObjectURL(image);
		img.onload = () => {
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				// console.log('Canvas context not supported');
				return;
			}

			const width = img.width;
			const height = img.height;

			canvas.width = width;
			canvas.height = height;

			// Translate to the center of the viewport
			ctx.translate(canvas.width / 2, canvas.height / 2);

			// Rotate the image
			ctx.rotate((rotate * Math.PI) / 180);

			// Draw the image back to its original position
			ctx.drawImage(img, -width / 2, -height / 2);

			// Update the preview
			preview.src = canvas.toDataURL();
		};
	}

	import { onMount, afterUpdate } from 'svelte';

	onMount(handleRotate);
	afterUpdate(handleRotate);
</script>

<RangeSlider name="range-slider" class="m-2 mx-auto max-w-lg" bind:value={rotate} min={-180} max={180} step={1}>
	<div class="flex items-center justify-between">
		<div class="font-bold text-tertiary-500 dark:text-primary-500">Rotate</div>
		<button on:click={() => (rotate = 0)} class="btn-primary btn p-0.5 text-white" title="Reset">
			<iconify-icon icon="material-symbols:rotate-left-rounded" width="24" class="text-tertiary-500 dark:text-primary-500" />{rotate}°
		</button>

		<div class="text-xs text-tertiary-500 dark:text-primary-500">{rotate}° / 180°</div>
	</div>
</RangeSlider>
