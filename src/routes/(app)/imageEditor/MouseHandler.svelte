<script lang=ts>
  import { onMount } from 'svelte';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  let MOUSEDOWN_WHOLE = false;
  let MOUSEDOWN_CORNER = false;
  let MOUSE_START_LEFT;
  let MOUSE_START_TOP;
  let selectedCorner;

  // Function to handle mouse down event
  export function handleMouseDown(e) {
    console.log('Mouse down event triggered');

    e.preventDefault();
    const corner = e.target.closest('.corner');
    const isWhole = e.target.closest('.inner');
    if (corner) {
      MOUSEDOWN_CORNER = true;
      // Additional logic for the corner case
      MOUSE_START_LEFT = e.pageX;
      MOUSE_START_TOP = e.pageY;
      selectedCorner = corner.getAttribute('data-corner');
    } else if (isWhole) {
      MOUSEDOWN_WHOLE = true;
      // Additional logic for the whole object case
      MOUSE_START_LEFT = e.pageX;
      MOUSE_START_TOP = e.pageY;
    }
  }

  // Function to handle mouse up event
  export function handleMouseUp(e) {
    console.log('Mouse up event triggered');

        MOUSEDOWN_WHOLE = false;
    MOUSEDOWN_CORNER = false;
    // Reset initial values or any other necessary logic
  }

  // Function to handle mouse move event
  export function handleMouseMove(e) {
    console.log('Mouse move event triggered');

        // Change some values based on mouse move on the X and Y axis
    // You may want to memorize the previous position and use it to calculate deltas
    // Based on deltas and the element state (whole or corner), you could also adjust the size or position of an element
    if (MOUSEDOWN_WHOLE) {
      dispatch('move', { x: e.pageX - MOUSE_START_LEFT, y: e.pageY - MOUSE_START_TOP });
    } else if (MOUSEDOWN_CORNER) {
      const deltaX = e.pageX - MOUSE_START_LEFT;
      const deltaY = e.pageY - MOUSE_START_TOP;

      switch (selectedCorner) {
        case 'top-left':
          dispatch('resize', { x: deltaX, y: deltaY, corner: 'top-left' });
          break;
        case 'top-right':
          dispatch('resize', { x: deltaX, y: deltaY, corner: 'top-right' });
          break;
        case 'bottom-left':
          dispatch('resize', { x: deltaX, y: deltaY, corner: 'bottom-left' });
          break;
        case 'bottom-right':
          dispatch('resize', { x: deltaX, y: deltaY, corner: 'bottom-right' });
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

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });
</script>

<div class="my-component"
     onmousedown={handleMouseDown}
     onmousemove={handleMouseMove}
     onmouseup={handleMouseUp}
     ontouchstart={handleMouseDown}
     ontouchmove={handleMouseMove}
     ontouchend={handleMouseUp}
     tabindex="0">
<!-- Component elements -->
</div>
