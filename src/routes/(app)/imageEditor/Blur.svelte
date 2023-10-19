<script lang="ts">
  import MouseHandler from './MouseHandler.svelte';

  // Define your props and logic for the Blur.svelte component
  export let image: File | null | undefined;
  export let blur: number = 5; // The blur amount in pixels
  export let minZoom: number = 1; // The minimum zoom of the image
  export let maxZoom: number = 3; // The maximum zoom of the image
  export let blurTop: number;
  export let blurLeft: number;
  export let blurRight: number;
  export let blurBottom: number;
  export let rotation: number = 0;

  // Initialize the blur value with default values
  let blurValue = {
    x: 0, // The horizontal position of the image center
    y: 0, // The vertical position of the image center
    scale: 1, // The scale factor of the image
  };

  // Define a function to handle the move event from the MouseHandler component
  function handleMove(event) {
    console.log('Move event handled');

    // Update the blur value with the event data
    blurValue.x += event.detail.x;
    blurValue.y += event.detail.y;
  }

  // Define a function to handle the resize event from the MouseHandler component
  function handleResize(event) {
    console.log('Resize event handled');

    // Update the blur object scale
    blurValue.scale += event.detail.y / (maxZoom - minZoom);

    // Define a minimum size for the blur area in pixels
    const minSize = 50;

    // Use a switch statement to handle the different cases for the corners
    switch (event.detail.corner) {
      case 'top-left':
        if (blurValue.scale * (maxZoom - minZoom) - event.detail.y > minSize) {
          blurValue.scale -= event.detail.y / (maxZoom - minZoom);
        }
        blurValue.x += event.detail.x;
        break;
      case 'top-right':
        if (blurValue.scale * (maxZoom - minZoom) - event.detail.y > minSize) {
          blurValue.scale -= event.detail.y / (maxZoom - minZoom);
        }
        blurValue.x -= event.detail.x;
        break;
      case 'bottom-left':
        if (blurValue.scale * (maxZoom - minZoom) + event.detail.y > minSize) {
          blurValue.scale += event.detail.y / (maxZoom - minZoom);
        }
        blurValue.x += event.detail.x;
        break;
      case 'bottom-right':
        if (blurValue.scale * (maxZoom - minZoom) + event.detail.y > minSize) {
          blurValue.scale += event.detail.y / (maxZoom - minZoom);
        }
        blurValue.x -= event.detail.x;
        break;
      default:
        break;
    }
  }

  // Define a function to handle the delete event on the blur area
  function handleDelete() {
    console.log('Delete event handled');
    // Set the visible prop to false
    //visible = false;
  }
</script>

<style>
  /* You can add any style here for your Blur.svelte component */
</style>

<div class="relative top-[5%] left-[5%] w-[90%] h-[90%] border border-white">
  <!-- Wrap the blur area element inside the MouseHandler component tag -->
  <MouseHandler 
    on:move={handleMove} 
    on:resize={handleResize} 
    let:props 
   >
    <!-- Use an if block to conditionally render the blur area based on the image prop -->
    {#if image}
      <!-- Use some CSS filters to create a blur effect on the image -->
      <!-- <img src={URL.createObjectURL(image)} alt="Image" class="w-full h-full object-contain filter" style={`blur(${blur}px)`} /> -->
      <!-- Use a button element to delete the blur area -->
      <button on:click={handleDelete} class="absolute top-0 left-0">Delete</button>
    {/if}
  </MouseHandler>
</div>
