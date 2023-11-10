<!-- Rotate.svelte -->
<script lang="ts">
	import { RangeSlider } from '@skeletonlabs/skeleton';

	export let rotate: number;
	export let image: File | null | undefined;
	export let CONT_WIDTH: string | undefined;
	export let CONT_HEIGHT: string | undefined;

	function handleRotate() {
		const preview = document.getElementById('preview') as HTMLImageElement;
		if (!preview) {
			console.log('Preview element not found');
			return;
		}
		if (image) {
			const img = new Image();
			img.src = URL.createObjectURL(image);
			img.onload = () => {
				const canvas = document.createElement('canvas');
				const ctx = canvas.getContext('2d')!;
				const width = img.width;
				const height = img.height;

				canvas.width = width;
				canvas.height = height;

				// Rotate the image
				ctx.translate(width / 2, height / 2);
				ctx.rotate((rotate * Math.PI) / 180);
				ctx.drawImage(img, -width / 2, -height / 2);

				// Update the preview
				const preview = document.getElementById('preview') as HTMLImageElement;
				preview.src = canvas.toDataURL();
			};
		}
	}

	import { onMount, afterUpdate } from 'svelte';

	onMount(handleRotate);
	afterUpdate(handleRotate);
</script>

<RangeSlider name="range-slider" class="m-2 mx-auto max-w-lg" bind:value={rotate} min={-180} max={180} step={1}>
	<div class="flex items-center justify-between">
		<div class="font-bold text-primary-500">Rotate</div>
		<button on:click={() => (rotate = 0)} class="btn-primary btn p-0.5 text-white" title="Reset">
			<iconify-icon icon="material-symbols:rotate-left-rounded" width="24" class="text-primary-500" />{rotate}°
		</button>

		<div class="text-xs text-primary-500">{rotate}° / 180°</div>
	</div>
</RangeSlider>
