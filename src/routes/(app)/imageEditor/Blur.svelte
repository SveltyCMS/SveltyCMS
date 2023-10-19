<script lang="ts">
  import MouseHandler from './MouseHandler.svelte';

  // Define your props and logic for the Blur.svelte component
  export let image: string; // The image to be blurred
  export let blur: number = 5; // The blur amount in pixels
  export let minZoom: number = 1; // The minimum zoom of the image
  export let maxZoom: number = 3; // The maximum zoom of the image
  export let blurTop: number;
  export let blurLeft: number;
  export let blurRight: number;
  export let blurBottom: number;
  export let rotation: number = 0;
  export let visible: boolean = true;

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

    // Define a minimum size for the blur area in pixels
    const minSize = 50;

    // Update the blur value with the event data
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

  // Define a function to handle the mouse down event on the blur area
  function handleMouseDown() {
    console.log('Mouse down handled');
    // You can add any logic here, such as changing the cursor style or highlighting the blur area
  }

  // Define a function to handle the mouse up event on the blur area
  function handleMouseUp() {
    console.log('Mouse up handled');
    // You can add any logic here, such as resetting the cursor style or removing the highlight from the blur area
  }

  // Define a function to handle the delete event on the blur area
  function handleDelete() {
    console.log('Delete event handled');
    // Set the visible prop to false
    visible = false;
  }
</script>

<style>
  /* You can add any style here for your Blur.svelte component */
</style>

<div class="relative top-[5%] left-[5%] w-[90%] h-[90%] border border-white">
  <!-- Wrap the blur area element inside the MouseHandler component tag -->
  <MouseHandler on:move={handleMove} on:resize={handleResize} let:props>
    <!-- Use an if block to conditionally render the blur area based on the visible prop -->
    {#if visible}
    <!-- Use the props and blur value to style and position the blur area element -->
    <div
      class="absolute"
      style={`top: calc(50% + ${props.blurTop}px); left: calc(50% + ${props.blurLeft}px); width: ${props.blurRight -
        props.blurLeft}px; height: ${props.blurBottom - props.blurTop}px; transform: translate(-50%, -50%) rotate(${rotation}deg);`}
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

      <!-- Image -->
      <img
        src={image}
        style={`filter: blur(${blur}px); transform: translate(-50%, -50%) scale(${blurValue.scale}) rotate(${rotation}deg);`}
      />

      <!-- Delete button -->
      <button on:click={handleDelete}>X</button>
    </div>
    {/if}
  </MouseHandler>
</div>
