<script lang="ts">
  import MouseHandler from './MouseHandler.svelte';

  // Define your props and logic for the FocalPoint.svelte component
  export let image: string; // The image source
  export let focalPoint: { x: number; y: number }; // The focal point coordinates

  // Define a function to handle the drag event from the MouseHandler component
  function handleDrag(event) {
    console.log('Drag event handled');

    // Update the focal point coordinates with the event data
    focalPoint.x = event.detail.x;
    focalPoint.y = event.detail.y;
  }
</script>

<style>
  /* You can add any style here for your FocalPoint.svelte component */

  /* Style for the focal point indicator */
  .focal-point {
    position: absolute;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid white;
    transform: translate(-50%, -50%);
  }
</style>

<div class="relative top-[5%] left-[5%] w-[90%] h-[90%] border border-white">
  <!-- Wrap the image element inside the MouseHandler component tag -->
  <MouseHandler on:drag={handleDrag} let:props>
    <!-- Use the props and image source to render the image element -->
    <img src={image} />

    <!-- Use the focal point coordinates to render the focal point indicator -->
    <div
      class="focal-point"
      style={`left: ${focalPoint.x}px; top: ${focalPoint.y}px;`}
    ></div>
  </MouseHandler>
</div>
