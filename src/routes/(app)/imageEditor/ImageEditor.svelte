<script lang="ts">
  import Blur from './Blur.svelte';
  import Crop from './Crop.svelte';
  import Rotate from './Rotate.svelte';

  export let image: File | null | undefined;
  let imageView: HTMLImageElement | undefined;
  let cropping = false;
  let blurring = false;
  let focalpoint = false;
  let rotate: number = 0;

  let CONT_WIDTH: string | undefined;
  let CONT_HEIGHT: string | undefined;

  // Use the use:action directive to bind the image element to the imageView variable
  function imageView(node) {
    imageView = node;
    if (imageView) {
      CONT_WIDTH = `${imageView.naturalWidth}px`;
      CONT_HEIGHT = `${imageView.naturalHeight}px`;

      // Use CONT_WIDTH and CONT_HEIGHT as needed
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
    use:imageView={imageView}
    src={image ? URL.createObjectURL(image) : ''}
    alt=""
    class="mx-auto max-h-[40vh] w-auto"
    style={`transform: rotate(${rotate}deg);`}
  />

  {#if cropping || blurring || focalpoint}
    <div class="absolute left-0 top-0 h-full w-full p-10 text-primary-500">
      {#if cropping}
        <!-- Pass the image and the crop values to the Crop component -->
        <Crop image={image} bind:cropTop bind:cropLeft bind:cropRight bind:cropBottom />
      {/if}
      {#if blurring}
        <!-- Pass the image and the blur values to the Blur component -->
        <Blur image={image} bind:blurTop bind:blurLeft bind:blurRight bind:blurBottom />
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
<Rotate
  bind:rotate
  bind:image
  bind:CONT_WIDTH
  bind:CONT_HEIGHT
/>
