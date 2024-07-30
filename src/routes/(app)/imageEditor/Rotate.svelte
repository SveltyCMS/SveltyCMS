<script lang="ts">
	import { RangeSlider } from '@skeletonlabs/skeleton';
	import { onMount, afterUpdate } from 'svelte';

	export let rotate: number = 0;
	export let image: File | null | undefined;

	let preview: HTMLImageElement;

	$: if (preview && image) {
		const img = new Image();
		img.src = URL.createObjectURL(image);
		img.onload = () => {
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				return;
			}

			const width = img.width;
			const height = img.height;

			canvas.width = width;
			canvas.height = height;

			// Translate to the center of the canvas
			ctx.translate(canvas.width / 2, canvas.height / 2);

			// Rotate the image
			ctx.rotate((rotate * Math.PI) / 180);

			// Draw the image back to its original position
			ctx.drawImage(img, -width / 2, -height / 2);

			// Update the preview
			preview.src = canvas.toDataURL();
		};
	}

	onMount(() => {
		preview = document.getElementById('preview') as HTMLImageElement;
	});

	async function saveImage() {
		const response = await fetch('/api/save-image', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ rotate })
		});
		const data = await response.json();
		console.log(data);
	}
</script>

<RangeSlider name="range-slider" class="m-2 mx-auto w-full max-w-lg" bind:value={rotate} min={-180} max={180} step={1} aria-label="Rotate Slider">
	<div class="flex items-center justify-between">
		<div class="font-bold text-tertiary-500 dark:text-primary-500">Rotate</div>
		<button on:click={() => (rotate = 0)} class="btn-primary btn p-0.5 text-white" title="Reset Rotation" aria-label="Reset Rotation">
			<iconify-icon icon="material-symbols:rotate-left-rounded" width="24" class="text-tertiary-500 dark:text-primary-500" />
		</button>
		<div class="text-xs text-tertiary-500 dark:text-primary-500">{rotate}° / 180°</div>
	</div>
</RangeSlider>
<button on:click={saveImage} class="btn-primary btn mt-4">Save</button>