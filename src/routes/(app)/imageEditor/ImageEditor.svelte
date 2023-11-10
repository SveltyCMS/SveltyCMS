<script lang="ts">
	import Blur from './Blur.svelte';
	import Crop from './Crop.svelte';
	import FocalPoint from './FocalPoint.svelte';
	import Rotate from './Rotate.svelte';

	export let image: File | null | undefined;
	let CONT_WIDTH: number | undefined;
	let CONT_HEIGHT: number | undefined;

	let imageView: HTMLImageElement | undefined;

	// Initialize the CROP values with default values
	let cropping = false;
	let cropTop = 10;
	let cropLeft = 10;
	let cropRight = 10;
	let cropBottom = 10;
	let cropCenter = 0;
	let cropShape = 'rect'; // or 'round'

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
	function bindImageView(node: any) {
		imageView = node;
		if (imageView) {
			// Use CONT_WIDTH and CONT_HEIGHT as needed
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

<!-- Imagebox  -->
<h1>New imageEditor</h1>

<div class="relative overflow-hidden">
	<!-- Use the use:imageView action to bind the image element -->
	<img
		use:bindImageView
		src={image ? URL.createObjectURL(image) : ''}
		alt=""
		class="mx-auto max-h-[40vh] w-auto"
		style={`transform: rotate(${rotate}deg);`}
	/>

	{#if cropping || blurring || focalpoint}
		<div class="absolute left-0 top-0" style={`height: ${CONT_HEIGHT}; width: ${CONT_WIDTH};`}>
			{#if cropping}
				<!-- Pass the image and the crop values to the Crop component  -->
				<Crop {image} {cropTop} {cropLeft} {cropRight} {cropBottom} {cropCenter} {cropShape} />
			{/if}
			{#if blurring}
				<!-- Pass the image and the blur values to the Blur component  -->
				<Blur {image} {blurAmount} {blurTop} {blurLeft} {blurRight} {blurBottom} {blurCenter} {blurRotate} />
			{/if}
			{#if focalpoint}
				<!-- Pass the image, the focal point coordinates, and the image dimensions to the FocalPoint component -->
				<FocalPoint {focalPointCenter} {CONT_WIDTH} {CONT_HEIGHT} />
			{/if}
		</div>
	{/if}
</div>

<!-- Overlay functionality -->
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
<Rotate bind:rotate bind:image bind:CONT_WIDTH bind:CONT_HEIGHT />
