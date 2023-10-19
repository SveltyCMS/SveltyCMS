<script lang="ts">
  import MouseHandler from './MouseHandler.svelte';

  // Define your props and logic for the Crop.svelte component
  export let image: File | null | undefined;
  export let aspect: number = 1; // The aspect ratio of the crop area
  export let minZoom: number = 1; // The minimum zoom of the image
  export let maxZoom: number = 3; // The maximum zoom of the image
  export let cropShape: 'rect' | 'round' = 'rect'; // The shape of the crop area

  // Initialize the crop value with default values
  let crop = {
    x: 0, // The horizontal position of the image center
    y: 0, // The vertical position of the image center
    rotation: 0, // The rotation angle of the image in degrees
    scale: 1, // The scale factor of the image
  };

  // Define a function to handle the move event from the MouseHandler component
  function handleMove(event) {
    console.log('Move event handled');

    // Update the crop value with the event data
    crop.x += event.detail.x;
    crop.y += event.detail.y;
  }

  // Define a function to handle the resize event from the MouseHandler component
  function handleResize(event) {
    console.log('Resize event handled');

    // Update the crop object scale
    crop.scale += event.detail.y / (maxZoom - minZoom);

    // Define a minimum size for the crop area in pixels
    const minSize = 50;

    // Use a switch statement to handle the different cases for the corners
    switch (event.detail.corner) {
      case 'top-left':
        if (crop.scale * (maxZoom - minZoom) - event.detail.y > minSize) {
          crop.scale -= event.detail.y / (maxZoom - minZoom);
        }
        crop.x += event.detail.x;
        break;
      case 'top-right':
        if (crop.scale * (maxZoom - minZoom) - event.detail.y > minSize) {
          crop.scale -= event.detail.y / (maxZoom - minZoom);
        }
        crop.x -= event.detail.x;
        break;
      case 'bottom-left':
        if (crop.scale * (maxZoom - minZoom) + event.detail.y > minSize) {
          crop.scale += event.detail.y / (maxZoom - minZoom);
        }
        crop.x += event.detail.x;
        break;
      case 'bottom-right':
        if (crop.scale * (maxZoom - minZoom) + event.detail.y > minSize) {
          crop.scale += event.detail.y / (maxZoom - minZoom);
        }
        crop.x -= event.detail.x;
        break;
      default:
        break;
    }
  }
</script>

<style>
  /* You can add any style here for your Crop.svelte component */
</style>

<div class="relative top-[5%] left-[5%] w-[90%] h-[90%] border border-white">
  <!-- Wrap the crop area element inside the MouseHandler component tag -->
  <MouseHandler 
    on:move={handleMove} 
    on:resize={handleResize} 
    let:props 
   >
    <!-- Use an if block to conditionally render the crop area based on the image prop -->
    {#if image}
      <!-- Use some CSS filters to create a mask effect on the image -->
      <img src={URL.createObjectURL(image)} alt="Image" class="w-full h-full object-contain filter contrast-50 brightness-75" />
      <!-- Use some CSS properties to create a shape for the crop area element -->
      <div
        class="absolute border border-white"
        style={`top: calc(50% + ${props.cropTop}px + ${crop.y}px); left: calc(50% + ${props.cropLeft}px + ${crop.x}px); width: ${props.cropRight - props.cropLeft}px; height: ${props.cropBottom - props.cropTop}px; transform: translate(-50%, -50%) scale(${crop.scale}) rotate(${crop.rotation}deg); clip-path: ${cropShape === 'rect' ? 'none' : 'circle(50%)'};`}
      >
        <!-- Corners -->
        <div
          class="absolute top-0 left-0 w-2 h-2 border border-white bg-white cursor-pointer corner"
          data-corner="top-left"
        ></div>
        <div
          class="absolute top-0 right-0 w-2 h-2 border border-white bg-white cursor-pointer corner"
          data-corner="top-right"
        ></div>
        <div
          class="absolute bottom-0 left-0 w-2 h-2 border border-white bg-white cursor-pointer corner"
          data-corner="bottom-left"
        ></div>
        <div
          class="absolute bottom-0 right-0 w-2 h-2 border border-white bg-white cursor-pointer corner"
          data-corner="bottom-right"
        ></div>
      </div>
    {/if}
  </MouseHandler>
</div>
