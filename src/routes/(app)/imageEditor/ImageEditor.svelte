<script lang="ts">
	import Blur from './Blur.svelte';
	import Crop from './Crop.svelte';
	import FocalPoint from './FocalPoint.svelte';
	import Rotate from './Rotate.svelte';

	export let image: File | null | undefined;

	// Initialize CONT_WIDTH and CONT_HEIGHT with a default value
	let CONT_WIDTH: number = 0;
	let CONT_HEIGHT: number = 0;

	let imageView: HTMLImageElement | undefined;

	// Initialize the CROP values with default values
	let cropping = false;
	let cropTop = 10;
	let cropLeft = 10;
	let cropRight = 10;
	let cropBottom = 10;
	let cropCenter = 0;
	let cropShape: 'rect' | 'round' = 'rect'; // or 'round'

	// Initialize the BLUR values with default values
	let blurring = false;
	let blurTop = 10;
	let blurLeft = 10;
	let blurRight = 10;
	let blurBottom = 10;
	let blurCenter = 10;
	let blurAmount = 5;
	let blurRotate = 0;

	// Initialize the BLUR values with default values
	let focalpoint = false;
	let focalPointCenter = { x: 0, y: 0 };

	// Initialize the Rotate values with default values,
	let rotate: number = 0;

	// Use the use:action directive to bind the image element to the imageView variable
	function bindImageView(node: HTMLImageElement) {
		imageView = node;
		if (imageView) {
			// Use clientWidth and clientHeight to get the actual displayed image size
			CONT_WIDTH = imageView.clientWidth;
			CONT_HEIGHT = imageView.clientHeight;
		}
	}

	function handleImageLoad() {
		if (imageView) {
			CONT_WIDTH = imageView.naturalWidth;
			CONT_HEIGHT = imageView.naturalHeight;
		}
	}

	function handleSave() {
		// Add code to save the cropped and blurred image
		// You can use the cropTop, cropBottom, cropLeft, and cropRight values
		// and the blurTop, blurBottom, blurLeft, and blurRight values
		// to crop and blur the image using Sharp.js or a similar library
		// Example:
		// sharp('input.jpg')
		//   .extract({ left: cropLeft, top: cropTop, width: cropRight - cropLeft, height: cropBottom - cropTop })
		//   .blur({ left: blurLeft, top: blurTop, width: blurRight - blurLeft, height: blurBottom - blurTop })
		//   .toFile('output.jpg', (err, info) => {
		//     // Handle the save operation
		//   });
	}
</script>

<div class="flex justify-center gap-2">
	<p>Image width: <span class="text-error-500">{CONT_WIDTH}</span></p>
	<p>Image height: <span class="text-error-500">{CONT_HEIGHT}</span></p>
</div>

<div class="relative overflow-hidden border-2 border-error-500" style="max-height: 60vh;">
	<!-- Use the use:bindImageView action to bind the image element -->
	<img
		use:bindImageView
		src={image ? URL.createObjectURL(image) : ''}
		alt=""
		class="relative mx-auto w-auto border border-white"
		style={`transform: rotate(${rotate}deg);`}
		on:load={() => handleImageLoad()}
	/>

	{#if cropping || blurring || focalpoint}
		<div class="absolute left-0 top-0 translate-x-1/2 translate-y-1/2" style={`height: ${CONT_HEIGHT}; width: ${CONT_WIDTH};`}>
			{#if cropping}
				<!-- Pass the image and the crop values to the Crop component  -->
				<Crop bind:cropTop bind:cropLeft bind:cropRight bind:cropBottom bind:cropCenter bind:cropShape {CONT_WIDTH} {CONT_HEIGHT} />
			{/if}
			{#if blurring}
				<!-- Pass the image and the blur values to the Blur component  -->
				<Blur
					bind:image
					bind:blurAmount
					bind:blurTop
					bind:blurLeft
					bind:blurRight
					bind:blurBottom
					bind:blurCenter
					bind:blurRotate
					{CONT_WIDTH}
					{CONT_HEIGHT}
				/>
			{/if}
			{#if focalpoint}
				<!-- Pass the image, the focal point coordinates, and the image dimensions to the FocalPoint component -->
				<FocalPoint {focalPointCenter} {CONT_WIDTH} {CONT_HEIGHT} />
			{/if}
		</div>
	{/if}
</div>

<!-- Enable and Disable module 	functionality -->
<div class="flex justify-center gap-3">
	{#if !cropping}
		<button on:click={() => (cropping = true)} class="btn-primary btn p-0.5 text-white" title="save">
			<iconify-icon icon="material-symbols:crop" width="24" class="text-primary-500" />
		</button>
	{:else if cropping}
		<button on:click={() => (cropping = false)} class="btn-primary btn p-0.5 text-white" title="save">
			<iconify-icon icon="material-symbols:save" width="24" class="text-primary-500" />
		</button>
	{/if}

	{#if !blurring}
		<button on:click={() => (blurring = true)} class="btn-primary btn p-0.5 text-white" title="save">
			<iconify-icon icon="ic:round-blur-circular" width="24" class="text-primary-500" />
		</button>
	{:else if blurring}
		<button on:click={() => (blurring = false)} class="btn-primary btn p-0.5 text-white" title="save">
			<iconify-icon icon="material-symbols:save" width="24" class="text-primary-500" />
		</button>
	{/if}

	{#if !focalpoint}
		<button on:click={() => (focalpoint = true)} class="btn-primary btn p-0.5 text-white" title="Focal Point">
			<iconify-icon icon="material-symbols:center-focus-strong" width="24" class="text-primary-500" />
		</button>
	{:else if focalpoint}
		<button on:click={() => (focalpoint = false)} class="btn-primary btn p-0.5 text-white" title="save">
			<iconify-icon icon="material-symbols:save" width="24" class="text-primary-500" />
		</button>
	{/if}
</div>

<!-- Pass rotate and rotateDetails to Rotate component -->
<Rotate bind:rotate bind:image />
