<script lang="ts">
	import Zoom from './Zoom.svelte';
	import Blur from './Blur.svelte';
	import Crop from './Crop.svelte';
	import FocalPoint from './FocalPoint.svelte';
	import Rotate from './Rotate.svelte';
	import { onMount } from 'svelte';

	export let image: File | null | undefined;

	let activeState = 'rotate';
	let zoom = 1;

	// Initialize CONT_WIDTH and CONT_HEIGHT with a default value
	let CONT_WIDTH: number = 0;
	let CONT_HEIGHT: number = 0;

	let imageView: HTMLImageElement | undefined;

	// Initialize the CROP values with default values
	let cropTop = 10;
	let cropLeft = 10;
	let cropRight = 10;
	let cropBottom = 10;
	let cropCenter = 0;
	let cropShape: 'rect' | 'round' = 'rect'; // or 'round'

	// Initialize the BLUR values with default values
	let blurTop = 10;
	let blurLeft = 10;
	let blurRight = 10;
	let blurBottom = 10;
	let blurCenter = 10;
	let blurAmount = 5;
	let blurRotate = 0;

	// Initialize the BLUR values with default values
	let focalPoint = { x: 0, y: 0 };

	// Initialize the Rotate values with default values,
	let rotate: number = 0;

	// Use the use:action directive to bind the image element to the imageView variable
	function bindImageView(node: HTMLImageElement) {
		imageView = node;
	}

	onMount(() => {
		if (imageView) {
			imageView.addEventListener('load', handleImageLoad);
		}
	});

	function handleImageLoad() {
		CONT_WIDTH = imageView?.naturalWidth ?? 0;
		CONT_HEIGHT = imageView?.naturalHeight ?? 0;
		focalPoint = { x: CONT_WIDTH / 2, y: CONT_HEIGHT / 2 };
	}
</script>

<div class="h-[calc(100vh -20%)] relative flex min-h-[150px] max-w-5xl items-center justify-center overflow-hidden rounded-lg border border-gray-200">
	<!-- Use the use:bindImageView action to bind the image element -->
	<img
		use:bindImageView
		src={image ? URL.createObjectURL(image) : ''}
		alt=""
		class="relative mx-auto w-auto border border-white"
		style={`transform: rotate(${rotate}deg) scale(${zoom});   object-fit: contain;`}
		on:load={() => handleImageLoad()}
	/>

	<div class="absolute left-1/2 top-1/2 translate-x-[-50%] translate-y-[-50%]">
		{#if activeState === 'cropping'}
			<!-- Pass the image and the crop values to the Crop component  -->
			<Crop bind:cropTop bind:cropLeft bind:cropRight bind:cropBottom bind:cropCenter bind:cropShape {CONT_WIDTH} {CONT_HEIGHT} />
		{/if}

		{#if activeState === 'blurring'}
			<!-- Pass the image and the blur values to the Blur component  -->
			<Blur bind:blurAmount bind:blurTop bind:blurLeft bind:blurRight bind:blurBottom bind:blurCenter bind:blurRotate {CONT_WIDTH} {CONT_HEIGHT} />
		{/if}

		{#if activeState === 'focalpoint'}
			<!-- Pass the image, the focal point coordinates, and the image dimensions to the FocalPoint component -->
			<FocalPoint bind:focalPoint on:move:handleMove {CONT_WIDTH} {CONT_HEIGHT} />
		{/if}
	</div>
</div>

<!-- Enable and Disable module functionality -->
<div class="flex items-center justify-center gap-2 px-2 md:justify-between">
	<p class="hidden md:block">Image Name: <span class="text-error-500"> {image?.name} </span></p>

	<div class="w-90 variant-filled-surface btn-group mt-1 dark:[&>*+*]:border-gray-200">
		<button on:click={() => (activeState = activeState === 'cropping' ? '' : 'cropping')} title="Crop">
			<iconify-icon icon="material-symbols:crop" width="26" class={activeState === 'cropping' ? 'text-error-500' : 'text-gray-500'} />
		</button>

		<button on:click={() => (activeState = activeState === 'blurring' ? '' : 'blurring')} title="Blur">
			<iconify-icon icon="ic:round-blur-circular" width="26" class={activeState === 'blurring' ? 'text-error-500' : 'text-gray-500'} />
		</button>

		<button
			on:click={() => (activeState = activeState === 'focalpoint' ? '' : 'focalpoint')}
			class="btn-primary btn p-0.5 text-white"
			title="Save Focal Point"
		>
			<iconify-icon
				icon="material-symbols:center-focus-strong"
				width="26"
				class={activeState === 'focalpoint' ? 'text-error-500' : 'text-gray-500'}
			/>
		</button>

		<button on:click={() => (activeState = activeState === 'rotate' ? '' : 'rotate')} title="Rotate">
			<iconify-icon icon="material-symbols:rotate-left-rounded" width="26" class={activeState === 'rotate' ? 'text-error-500' : 'text-gray-500'} />
		</button>

		<button on:click={() => (activeState = activeState === 'zoom' ? '' : 'zoom')} title="Zoom">
			<iconify-icon icon="material-symbols:zoom-out-map" width="26" class={activeState === 'zoom' ? 'text-error-500' : 'text-gray-500'} />
		</button>
	</div>

	<p class="hidden md:block">Width: <span class="text-error-500">{CONT_WIDTH}</span> x Height: <span class="text-error-500">{CONT_HEIGHT}</span></p>
</div>

{#if activeState !== 'rotate'}
	<!-- Zoom -->
	<Zoom bind:zoom />
{/if}

{#if activeState === 'rotate'}
	<!-- Pass rotate and rotateDetails to Rotate component -->
	<Rotate bind:rotate bind:image />
{/if}
