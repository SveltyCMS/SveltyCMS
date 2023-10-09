<script lang="ts">
	import Blur from './Blur.svelte';
	import Crop from './Crop.svelte';
	import Rotate from './Rotate.svelte';

	export let image: File | null | undefined;
	let imageView: HTMLImageElement | undefined;
	let cropping = false;
	let buring = false;
	let focalpoint = false;
	let rotate: number = 0;
	
	let CONT_WIDTH: string | undefined;
	let CONT_HEIGHT: string | undefined;

	function handleImageLoad() {
		if (imageView) {
			CONT_WIDTH = `${imageView.naturalWidth}px`;
			CONT_HEIGHT = `${imageView.naturalHeight}px`;

			// Use CONT_WIDTH and CONT_HEIGHT as needed
		}
	}

	function handleSave() {
		// Add code to save the cropped image
		// You can use the cropTop, cropBottom, cropLeft, and cropRight values
		// to crop the image using Sharp.js or a similar library
		// Example:
		// sharp('input.jpg')
		//   .extract({ left: cropLeft, top: cropTop, width: cropRight - cropLeft, height: cropBottom - cropTop })
		//   .toFile('output.jpg', (err, info) => {
		//     // Handle the save operation
		//   });
	}
</script>

<!-- Imagebox where all effect should be applied to -->
<div class="relative overflow-hidden">
  <img
  src={image ? URL.createObjectURL(image) : ''}
  alt=""
  class="mx-auto max-h-[40vh] w-auto"
  bind:this={imageView}
  on:load={() => handleImageLoad()}
  style={`transform: rotate(${rotate}deg);`}
/>

	{#if cropping || buring || focalpoint}
		<div class="absolute left-0 top-0 h-full w-full p-10 text-primary-500">
			{#if cropping}
				<Crop />
			{/if}
			{#if buring}
				<Blur />
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

	{#if !buring}
	<button on:click={() => (buring = true)} class="btn-primary btn p-0.5 text-white" title="save">
		<iconify-icon icon="ic:round-blur-circular" width="24" class="text-primary-500" />
	</button>
	{:else if buring}
	<button on:click={() => (buring = false)} class="btn-primary btn p-0.5 text-white" title="save">
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
<Rotate
		bind:rotate
		bind:image
		bind:CONT_WIDTH
		bind:CONT_HEIGHT
	/>


