<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

   // Define your props here
   let props = {
    cropTop: 0,
    cropLeft: 0,
    cropRight: 0,
    cropBottom: 0,
    // other props...
  };

  let element; // The reference to the div element
  let selectedCorner; // The selected corner for resizing
  let moving = false; // Track if the mouse is moving
  let down = false; // Track if the mouse is clicked down

  // Function to handle mouse move event
  export function handleMouseMove(e) {
    moving = true;
   // console.log('Mouse move event triggered');

    // Get the size and position of the element
    const { width, height, left, top } = element.getBoundingClientRect();

    // Calculate the deltas based on the mouse position and the element position
    const deltaX = e.clientX - left;
    const deltaY = e.clientY - top;

    // Check if the mouse is moving the whole element or a corner
    if (moving && !selectedCorner) {
      // Dispatch the move event with the deltas
      dispatch('move', { x: deltaX, y: deltaY });
    } else if (moving && selectedCorner) {
      // Use a switch statement to handle the different cases for the corners
      switch (selectedCorner) {
        case 'top-left':
          // Dispatch the resize event with the deltas and the corner
          dispatch('resize', { x: deltaX, y: deltaY, corner: 'top-left' });
          break;
        case 'top-right':
          // Dispatch the resize event with the deltas and the corner
          dispatch('resize', { x: width - deltaX, y: deltaY, corner: 'top-right' });
          break;
        case 'bottom-left':
          // Dispatch the resize event with the deltas and the corner
          dispatch('resize', { x: deltaX, y: height - deltaY, corner: 'bottom-left' });
          break;
        case 'bottom-right':
          // Dispatch the resize event with the deltas and the corner
          dispatch('resize', { x: width - deltaX, y: height - deltaY, corner: 'bottom-right' });
          break;
        default:
          break;
      }
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowUp') {
      dispatch('move', { x: 0, y: -1 });
    } else if (event.key === 'ArrowDown') {
      dispatch('move', { x: 0, y: 1 });
    } else if (event.key === 'ArrowLeft') {
      dispatch('move', { x: -1, y: 0 });
    } else if (event.key === 'ArrowRight') {
      dispatch('move', { x: 1, y: 0 });
    }
  }

  function handleMouseDown(e) {
    down = true;
    //console.log('Mouse down event triggered');

    e.preventDefault();
    const corner = e.target.closest('.corner');
    if (corner) {
      // Set the selected corner
      selectedCorner = corner.getAttribute('data-corner');
    }
  }

  function handleMouseUp(e) {
    down = false;
    //console.log('Mouse up event triggered');

    // Reset the selected corner
    selectedCorner = null;
  }
</script>

<!-- Use a div element instead of a button element -->
<div class="my-component"
     bind:this={element}
     on:mousedown={handleMouseDown}
     on:mouseup={handleMouseUp}
     tabindex="0">
<!-- Use slots to pass HTML content from parent component -->
<slot {props}></slot>
</div>

<svelte:window on:mousemove={handleMouseMove} on:keydown={handleKeyDown} />

