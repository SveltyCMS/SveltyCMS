<script lang="ts">
  import MouseHandler from './MouseHandler.svelte';

  // Define your props and logic for the Crop.svelte component
  export let image: string; // The image to be cropped
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

    // Define a minimum size for the crop area in pixels
    const minSize = 50;

    // Update the crop value with the event data
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

  // Define a function to handle the mouse down event on the crop area
  function handleMouseDown() {
    console.log('Mouse down handled');
    // You can add any logic here, such as changing the cursor style or highlighting the crop area
  }

  // Define a function to handle the mouse up event on the crop area
  function handleMouseUp() {
    console.log('Mouse up handled');
    // You can add any logic here, such as resetting the cursor style or removing the highlight from the crop area
  }
</script>

<style>
  /* You can add any style here for your Crop.svelte component */
</style>

<div class="relative top-[5%] left-[5%] w-[90%] h-[90%] border border-white">
  <!-- Wrap the crop area element inside the MouseHandler component tag -->
  <MouseHandler on:move={handleMove} on:resize={handleResize} let:props>
    <!-- Use the props and crop value to style and position the crop area element -->
    <div
      class="absolute border border-white"
      style={`top: calc(50% + ${props.cropTop}px); left: calc(50% + ${props.cropLeft}px); width: ${props.cropRight -
        props.cropLeft}px; height: ${props.cropBottom - props.cropTop}px; transform: translate(-50%, -50%) rotate(${crop.rotation}deg);`}
      on:mousedown={handleMouseDown}  
      on:mouseup={handleMouseUp}  
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

      <!-- Center -->
      <!-- <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4 h-4 border border-white bg-white cursor-move inner">center</div> -->
    </div>
  </MouseHandler>
</div>
