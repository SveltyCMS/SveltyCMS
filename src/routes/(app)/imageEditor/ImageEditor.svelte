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
	let blurCenter = 0;
	let blurRotate = 0;

	// Initialize the BLUR values with default values
	let focalPoint = { x: 0, y: 0 };
	let initialFocalPoint = { x: 0, y: 0 };

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

		// Set initial crop values to center the crop area
		cropTop = CONT_HEIGHT / 4;
		cropLeft = CONT_WIDTH / 4;
		cropRight = (CONT_WIDTH * 3) / 4;
		cropBottom = (CONT_HEIGHT * 3) / 4;
		cropCenter = 0;
	}

	function resetFocalPoint() {
		// Reset the focal point to its initial position
		focalPoint = { ...initialFocalPoint };
	}
</script>

<!-- Image Info -->
<div class="mb-1 flex items-center justify-between">
	<p>
		<span class="hidden lg:inline-block">Image:</span>
		<span class="text-tertiary-500 dark:text-primary-500">{image?.name}</span>
	</p>
	<p class="text-tertiary-500 dark:text-primary-500">{Math.round(focalPoint.x)} x {Math.round(focalPoint.y)}</p>
	<p>
		Width: <span class="text-tertiary-500 dark:text-primary-500">{CONT_WIDTH}</span> x Height:
		<span class="text-tertiary-500 dark:text-primary-500">{CONT_HEIGHT}</span>
	</p>
</div>

<!-- Image Area -->
<div class="h-[calc(100vh -20%)] relative flex min-h-[150px] max-w-5xl items-center justify-center overflow-hidden rounded-lg border border-gray-200">
	<!-- Use the use:bindImageView action to bind the image element -->
	<img
		use:bindImageView
		src={image ? URL.createObjectURL(image) : ''}
		alt=""
		class="relative mx-auto w-auto"
		style={`transform: rotate(${rotate}deg) scale(${zoom});   object-fit: contain;`}
		on:load={() => handleImageLoad()}
	/>

	<!-- Image overlays -->
	<div class="absolute left-1/2 top-1/2 translate-x-[-50%] translate-y-[-50%]">
		{#if activeState === 'cropping'}
			<!-- Pass the image and the crop values to the Crop component  -->

			<Crop bind:cropTop bind:cropLeft bind:cropRight bind:cropBottom bind:cropCenter bind:cropShape {CONT_WIDTH} {CONT_HEIGHT} />
		{/if}

		{#if activeState === 'blurring'}
			<!-- Pass the image and the blur values to the Blur component  -->
			<Blur bind:blurTop bind:blurLeft bind:blurRight bind:blurBottom bind:blurCenter bind:blurRotate {CONT_WIDTH} {CONT_HEIGHT} />
		{/if}

		{#if activeState === 'focalpoint'}
			<!-- Pass the image, the focal point coordinates, and the image dimensions to the FocalPoint component -->
			<FocalPoint bind:focalPoint on:move:handleMove {CONT_WIDTH} {CONT_HEIGHT} />
		{/if}
	</div>
</div>

<!-- Enable and Disable module functionality -->
<div class="mt-1 flex items-center justify-between px-2">
	<button on:click={resetFocalPoint} class="btn mr-6 flex flex-col items-center justify-center">
		<iconify-icon icon="material-symbols-light:device-reset" width="38" class="text-tertiary-500" />
		<p class="text-xs">Reset All</p>
	</button>

	<div class="mx-4 flex w-full items-center justify-between">
		<!-- Crop -->
		<button on:click={() => (activeState = activeState === 'cropping' ? '' : 'cropping')}>
			<iconify-icon icon="material-symbols:crop" width="28" class={activeState === 'cropping' ? 'text-error-500' : 'text-surface-token'} />
			<p class="text-xs">Crop</p>
		</button>

		<!-- Blur -->
		<button on:click={() => (activeState = activeState === 'blurring' ? '' : 'blurring')}>
			<iconify-icon icon="ic:round-blur-circular" width="28" class={activeState === 'blurring' ? 'text-error-500' : 'text-surface-token'} />
			<p class="text-xs">Blur</p>
		</button>

		<!-- Focal Point -->
		<button on:click={() => (activeState = activeState === 'focalpoint' ? '' : 'focalpoint')}>
			<iconify-icon
				icon="material-symbols:center-focus-strong"
				width="28"
				class={activeState === 'focalpoint' ? 'text-error-500' : 'text-surface-token'}
			/>
			<p class="text-xs">Focal Point</p>
		</button>

		<!-- Rotate -->
		<button on:click={() => (activeState = activeState === 'rotate' ? '' : 'rotate')} title="Rotate">
			<iconify-icon
				icon="material-symbols:rotate-left-rounded"
				width="28"
				class={activeState === 'rotate' ? 'text-error-500' : 'text-surface-token'}
			/>
			<p class="text-xs">Rotate</p>
		</button>

		<button on:click={() => (activeState = activeState === 'zoom' ? '' : 'zoom')} title="Zoom">
			<iconify-icon icon="material-symbols:zoom-out-map" width="28" class={activeState === 'zoom' ? 'text-error-500' : 'text-surface-token'} />
			<p class="text-xs">Zoom</p>
		</button>
	</div>
</div>
<div class="flex items-center justify-between">
	{#if activeState !== 'rotate'}
		<!-- Zoom -->
		<Zoom bind:zoom />
	{/if}

	{#if activeState === 'rotate'}
		<!-- Rotate  -->
		<Rotate bind:rotate bind:image />
	{/if}
</div>
