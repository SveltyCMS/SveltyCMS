<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  // Use export to define your props
  export let TopLeft = 0;
  export let TopRight = 0;
  export let BottomLeft = 0;
  export let BottomRight = 0;
  export let Center = 0;
  export let Rotate = 0;

  let element; // The reference to the div element
  let selectedCorner; // The selected corner for resizing
  let moving = false; // Track if the mouse is moving
  let down = false; // Track if the mouse is clicked down

  // Function to handle mouse move event
  export function handleMouseMove(e) {
    moving = true;
    console.log('Mouse move event triggered');

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
        case 'TopLeft':
          // Dispatch the resize event with the deltas and the corner
          dispatch('resize', { x: deltaX, y: deltaY, corner: 'TopLeft' });
          break;
        case 'TopRight':
          // Dispatch the resize event with the deltas and the corner
          dispatch('resize', { x: width - deltaX, y: deltaY, corner: 'TopRight' });
          break;
        case 'BottomLeft':
          // Dispatch the resize event with the deltas and the corner
          dispatch('resize', { x: deltaX, y: height - deltaY, corner: 'BottomLeft' });
          break;
        case 'BottomRight':
          // Dispatch the resize event with the deltas and the corner
          dispatch('resize', { x: width - deltaX, y: height - deltaY, corner: 'BottomRight' });
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
    console.log('Mouse down event triggered');
    e.preventDefault();
    const corner = e.target.closest('.corner');
    if (corner) {
      // Set the selected corner
      selectedCorner = corner.getAttribute('data-corner');
    }
  }

  function handleMouseUp(e) {
    down = false;
    console.log('Mouse up event triggered');

    // Reset the selected corner
    selectedCorner = null;

  }
  
   function handleMouseLeave(e) {
     // Handle mouse leave event
     handleMouseUp(e);
   }
</script>

<!-- Use a div element instead of a button element -->
<div class="my-component"
     bind:this={element}
     on:mousedown={handleMouseDown}
     on:mouseup={handleMouseUp}
     on:mousemove={handleMouseMove}
     on:mouseleave={handleMouseLeave}
     tabindex="0"
     style="--border-color: var(--primary-500); --background-color: var(--bg-2); --cursor: move;">
  
<!-- Use slots to pass HTML content from parent component -->
<slot {TopLeft} {TopRight} {BottomLeft} {BottomRight} {Center} {Rotate}>
</slot>
</div>

<style>
  .my-component {
    /* Add some styles to the div element */
    border: 2px solid var(--border-color);
    background-color: var(--background-color);
    cursor: var(--cursor);
  }
</style>